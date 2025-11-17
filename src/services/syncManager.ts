import { SyncApiClient } from "./syncApi";
import { S3Service } from "./s3Service";
import { RecordPersistence } from "./recordPersistence";
import { SyncConfig, SyncedRecord } from "../types/sync";
import { logger, LogCategory } from "../utils/logger";
import { jwtService } from "./jwtService";

export class SyncManager {
  private syncApi: SyncApiClient;
  private s3Service: S3Service;
  private persistence: RecordPersistence;

  constructor() {
    this.syncApi = new SyncApiClient();
    this.s3Service = new S3Service();
    this.persistence = new RecordPersistence();
  }

  async processAllRecords(
    token: string,
    syncId: string,
    cursor?: string,
    userId?: string
  ): Promise<void> {
    const existingState = await this.persistence.getSyncState(syncId);
    const userIdForState = userId || existingState?.userId;

    let currentCursor =
      cursor || (await this.persistence.getSyncCursor(syncId));

    if (currentCursor) {
      logger.info(LogCategory.SYNC, `Resuming sync ${syncId} from cursor`, {
        syncId,
        cursor: currentCursor,
      });
    }

    let hasMore = true;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 5;

    while (hasMore) {
      try {
        const response = await this.syncApi.pullSyncedRecords(
          token,
          syncId,
          currentCursor
        );
        if (userIdForState) {
          await this.persistence.setSyncCursor(
            syncId,
            userIdForState,
            currentCursor
          );
        }

        consecutiveErrors = 0;

        const cursor = response.paging?.cursor ?? null;
        if (cursor) {
          currentCursor = cursor;
        }
        const responseHasMore = (response.paging?.remainingRecords ?? 0) > 0;
        hasMore = responseHasMore;

        for (const record of response.data) {
          try {
            await this.processRecord(token, syncId, record);
          } catch (error) {
            logger.error(
              LogCategory.SYNC,
              `Failed to process record ${record.id}, continuing with next record`,
              { recordId: record.id, syncId, error }
            );
          }
        }
      } catch (error) {
        consecutiveErrors++;
        logger.error(
          LogCategory.SYNC,
          `Error pulling records (attempt ${consecutiveErrors}/${maxConsecutiveErrors})`,
          {
            syncId,
            attempt: consecutiveErrors,
            maxAttempts: maxConsecutiveErrors,
            error,
          }
        );

        if (consecutiveErrors >= maxConsecutiveErrors) {
          await this.persistence.markSyncFailed(syncId);
          throw new Error(
            `Too many consecutive errors while pulling records. Last error: ${error}`
          );
        }

        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.min(1000 * Math.pow(2, consecutiveErrors), 30000)
          )
        );
      }
    }

    await this.persistence.clearSyncCursor(syncId);
    logger.info(
      LogCategory.SYNC,
      `Completed processing all records for sync ${syncId}`,
      { syncId }
    );
  }

  async recoverActiveSyncs(): Promise<void> {
    const activeSyncs = await this.persistence.getAllActiveSyncStates();

    if (activeSyncs.length === 0) {
      logger.info(LogCategory.SYNC, "No active syncs to recover");

      const failedSyncs = await this.persistence.getFailedSyncStates();
      if (failedSyncs.length > 0) {
        logger.warn(
          LogCategory.SYNC,
          `Found ${failedSyncs.length} failed/dead sync(s) that will not be recovered`,
          {
            failedSyncs: failedSyncs.map((s) => ({
              syncId: s.syncId,
              status: s.status,
              failureCount: s.failureCount,
              lastFailureAt: s.lastFailureAt,
            })),
          }
        );
      }
      return;
    }

    logger.info(
      LogCategory.SYNC,
      `Found ${activeSyncs.length} active sync(s) to recover`,
      { syncIds: activeSyncs.map((s: { syncId: string }) => s.syncId) }
    );

    for (const syncState of activeSyncs) {
      try {
        const token = jwtService.signToken(syncState.userId);
        logger.info(
          LogCategory.SYNC,
          `Recovering sync ${syncState.syncId} from cursor`,
          {
            syncId: syncState.syncId,
            userId: syncState.userId,
            cursor: syncState.cursor,
            lastProcessedAt: syncState.lastProcessedAt,
            failureCount: syncState.failureCount || 0,
          }
        );
        await this.processAllRecords(
          token,
          syncState.syncId,
          syncState.cursor,
          syncState.userId
        );
      } catch (error) {
        logger.error(
          LogCategory.SYNC,
          `Failed to recover sync ${syncState.syncId}`,
          {
            syncId: syncState.syncId,
            userId: syncState.userId,
            error,
          }
        );
        await this.persistence.markSyncFailed(syncState.syncId);
      }
    }
  }

  async processRecord(
    token: string,
    syncId: string,
    record: SyncedRecord,
    forceReprocess: boolean = false
  ): Promise<void> {
    const recordKey = `${syncId}:${record.id}`;

    if (!forceReprocess) {
      const isUpToDate = await this.persistence.isRecordUpToDate(
        syncId,
        record.id,
        record.syncedAt
      );
      if (isUpToDate) {
        logger.debug(
          LogCategory.SYNC,
          `Skipping already processed record: ${record.id} (syncedAt: ${record.syncedAt})`,
          { recordId: record.id, syncId, syncedAt: record.syncedAt }
        );
        return;
      } else if (await this.persistence.has(recordKey)) {
        logger.info(
          LogCategory.SYNC,
          `Record ${record.id} has been updated (syncedAt: ${record.syncedAt}), reprocessing...`,
          { recordId: record.id, syncId, syncedAt: record.syncedAt }
        );
      }
    }

    if (this.isDownloadable(record)) {
      const recordPrefix = `${syncId}/${record.id}/`;
      const existingFiles = await this.s3Service.listFiles(recordPrefix);

      if (existingFiles.length > 0) {
        logger.info(
          LogCategory.SYNC,
          `Deleting ${existingFiles.length} existing file(s) for record ${record.id} before processing update`,
          { recordId: record.id, syncId, existingFiles }
        );
        for (const fileKey of existingFiles) {
          try {
            await this.s3Service.deleteFile(fileKey);
            logger.debug(
              LogCategory.STORAGE,
              `Deleted existing file ${fileKey}`,
              { recordId: record.id, syncId, fileKey }
            );
          } catch (error) {
            logger.warn(
              LogCategory.STORAGE,
              `Failed to delete existing file ${fileKey}`,
              { recordId: record.id, syncId, fileKey, error }
            );
          }
        }
      }
      logger.info(
        LogCategory.SYNC,
        `Downloading binary content for record: ${record.id} (${record.name})`,
        { recordId: record.id, syncId, fileName: record.name }
      );
      const content = await this.syncApi.downloadFileContent(
        token,
        syncId,
        record.id
      );

      const s3Key = this.s3Service.generateKey(syncId, record.id, record.name);
      const s3Url = await this.s3Service.uploadFile(
        s3Key,
        content,
        record.mimeType,
        {
          "record-id": record.id,
          "sync-id": syncId,
          "synced-at": record.syncedAt,
          "original-name": record.name,
        }
      );

      logger.info(LogCategory.STORAGE, `Uploaded ${record.name} to ${s3Url}`, {
        recordId: record.id,
        syncId,
        fileName: record.name,
        s3Url,
      });
      await this.persistence.markProcessed(
        syncId,
        record.id,
        record.syncedAt,
        record.name
      );
    } else {
      logger.debug(
        LogCategory.SYNC,
        `Skipping non-binary record: ${record.id} (${
          record.mimeType || "unknown type"
        })`,
        { recordId: record.id, syncId, mimeType: record.mimeType }
      );
      await this.persistence.markProcessed(
        syncId,
        record.id,
        record.syncedAt,
        record.name
      );
    }
  }

  async processIncrementalSync(
    token: string,
    syncId: string,
    recordId: string,
    isUpdate: boolean = false
  ): Promise<void> {
    const record = await this.syncApi.getSyncedRecord(token, syncId, recordId);
    await this.processRecord(token, syncId, record, isUpdate);
  }

  private isDownloadable(record: SyncedRecord): boolean {
    if (!record.mimeType) {
      return false;
    }

    const undownloadableMimeTypes = ["application/vnd.google-apps.folder"];

    return !undownloadableMimeTypes.some((type) =>
      record.mimeType?.startsWith(type)
    );
  }

  async markRecordProcessed(
    syncId: string,
    recordId: string,
    syncedAt: string,
    fileName?: string
  ): Promise<void> {
    await this.persistence.markProcessed(syncId, recordId, syncedAt, fileName);
  }

  async removeRecord(syncId: string, recordId: string): Promise<void> {
    const fileName = await this.persistence.getFileName(syncId, recordId);

    if (fileName) {
      const s3Key = this.s3Service.generateKey(syncId, recordId, fileName);
      logger.info(LogCategory.SYNC, `Deleting S3 file for record ${recordId}`, {
        recordId,
        syncId,
        s3Key,
      });
      try {
        await this.s3Service.deleteFile(s3Key);
        logger.info(
          LogCategory.STORAGE,
          `Deleted S3 file ${s3Key} for record ${recordId}`,
          { recordId, syncId, s3Key }
        );
      } catch (error) {
        logger.warn(
          LogCategory.STORAGE,
          `Failed to delete S3 file ${s3Key} for record ${recordId}`,
          { recordId, syncId, s3Key, error }
        );
      }
    } else {
      const prefix = `${syncId}/${recordId}/`;
      logger.info(
        LogCategory.SYNC,
        `No stored filename for record ${recordId}, listing files with prefix ${prefix}`,
        { recordId, syncId, prefix }
      );
      const files = await this.s3Service.listFiles(prefix);
      for (const fileKey of files) {
        try {
          await this.s3Service.deleteFile(fileKey);
          logger.info(
            LogCategory.STORAGE,
            `Deleted S3 file ${fileKey} for record ${recordId}`,
            { recordId, syncId, fileKey }
          );
        } catch (error) {
          logger.warn(
            LogCategory.STORAGE,
            `Failed to delete S3 file ${fileKey} for record ${recordId}`,
            { recordId, syncId, fileKey, error }
          );
        }
      }
    }

    await this.persistence.forceReprocess(syncId, recordId);
  }

  async createSyncState(syncId: string, userId: string): Promise<void> {
    await this.persistence.createSyncState(syncId, userId);
  }
}
