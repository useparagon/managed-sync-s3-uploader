import * as fs from "fs";
import * as path from "path";
import { config } from "../config/env";
import { S3Service } from "./s3Service";
import { logger, LogCategory } from "../utils/logger";

interface ProcessedRecord {
  syncId: string;
  recordId: string;
  syncedAt: string;
  fileName?: string;
}

interface SyncState {
  syncId: string;
  userId: string;
  cursor?: string;
  lastProcessedAt?: string;
  failureCount?: number;
  lastFailureAt?: string;
  status?: "active" | "failed" | "dead";
}

export class RecordPersistence {
  private processedRecords: Map<string, ProcessedRecord> = new Map();
  private syncStates: Map<string, SyncState> = new Map();
  private s3Service?: S3Service;
  private filePath: string;
  private stateFilePath: string;
  private loadPromise: Promise<void>;

  constructor() {
    this.filePath = config.persistence.filePath;
    this.stateFilePath = config.persistence.filePath.replace(
      /\.json$/,
      "-state.json"
    );

    if (config.persistence.mode === "s3") {
      this.s3Service = new S3Service();
      this.loadPromise = Promise.all([
        this.loadFromS3(),
        this.loadStateFromS3(),
      ]).then(() => {});
    } else {
      this.loadFromFile();
      this.loadStateFromFile();
      this.loadPromise = Promise.resolve();
    }
  }

  private async ensureLoaded(): Promise<void> {
    await this.loadPromise;
  }

  private async loadFromS3(): Promise<void> {
    try {
      const data = await this.s3Service!.downloadFile(config.persistence.s3Key);
      if (data) {
        const records = JSON.parse(data.toString("utf-8")) as ProcessedRecord[];
        this.processedRecords = new Map(
          records.map((r) => [`${r.syncId}:${r.recordId}`, r])
        );
        logger.info(
          LogCategory.STORAGE,
          `Loaded ${this.processedRecords.size} processed records from S3`,
          { recordCount: this.processedRecords.size }
        );
      } else {
        logger.info(
          LogCategory.STORAGE,
          "No existing state found in S3, starting fresh"
        );
      }
    } catch (error) {
      logger.warn(
        LogCategory.STORAGE,
        "Failed to load processed records from S3",
        error
      );
      this.processedRecords = new Map();
    }
  }

  private async loadStateFromS3(): Promise<void> {
    try {
      const stateKey = config.persistence.s3Key.replace(
        /\.json$/,
        "-state.json"
      );
      const data = await this.s3Service!.downloadFile(stateKey);
      if (data) {
        const states = JSON.parse(data.toString("utf-8")) as SyncState[];
        this.syncStates = new Map(states.map((s) => [s.syncId, s]));
        logger.info(
          LogCategory.STORAGE,
          `Loaded ${this.syncStates.size} sync states from S3`,
          { stateCount: this.syncStates.size }
        );
      }
    } catch (error) {
      logger.warn(
        LogCategory.STORAGE,
        "Failed to load sync states from S3",
        error
      );
      this.syncStates = new Map();
    }
  }

  private loadFromFile(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, "utf-8");
        const records = JSON.parse(data) as ProcessedRecord[];
        this.processedRecords = new Map(
          records.map((r) => [`${r.syncId}:${r.recordId}`, r])
        );
        logger.info(
          LogCategory.STORAGE,
          `Loaded ${this.processedRecords.size} processed records from file`,
          { recordCount: this.processedRecords.size, filePath: this.filePath }
        );
      }
    } catch (error) {
      logger.warn(
        LogCategory.STORAGE,
        "Failed to load processed records from file",
        {
          filePath: this.filePath,
          error,
        }
      );
      this.processedRecords = new Map();
    }
  }

  private loadStateFromFile(): void {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const data = fs.readFileSync(this.stateFilePath, "utf-8");
        const states = JSON.parse(data) as SyncState[];
        this.syncStates = new Map(states.map((s) => [s.syncId, s]));
        logger.info(
          LogCategory.STORAGE,
          `Loaded ${this.syncStates.size} sync states from file`,
          { stateCount: this.syncStates.size, filePath: this.stateFilePath }
        );
      }
    } catch (error) {
      logger.warn(LogCategory.STORAGE, "Failed to load sync states from file", {
        filePath: this.stateFilePath,
        error,
      });
      this.syncStates = new Map();
    }
  }

  private async save(): Promise<void> {
    const records = Array.from(this.processedRecords.values());
    const content = JSON.stringify(records, null, 2);

    if (config.persistence.mode === "s3" && this.s3Service) {
      await this.saveToS3(content);
    } else {
      this.saveToFile(content);
    }
  }

  private async saveState(): Promise<void> {
    const states = Array.from(this.syncStates.values());
    const content = JSON.stringify(states, null, 2);

    if (config.persistence.mode === "s3" && this.s3Service) {
      const stateKey = config.persistence.s3Key.replace(
        /\.json$/,
        "-state.json"
      );
      await this.s3Service.uploadString(stateKey, content);
    } else {
      try {
        const dir = path.dirname(this.stateFilePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(this.stateFilePath, content);
      } catch (error) {
        logger.warn(LogCategory.STORAGE, "Failed to save sync states to file", {
          filePath: this.stateFilePath,
          error,
        });
      }
    }
  }

  private async saveToS3(content: string): Promise<void> {
    try {
      await this.s3Service!.uploadString(config.persistence.s3Key, content);
    } catch (error) {
      logger.warn(
        LogCategory.STORAGE,
        "Failed to save processed records to S3",
        {
          s3Key: config.persistence.s3Key,
          error,
        }
      );
    }
  }

  private saveToFile(content: string): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, content);
    } catch (error) {
      logger.warn(
        LogCategory.STORAGE,
        "Failed to save processed records to file",
        {
          filePath: this.filePath,
          error,
        }
      );
    }
  }

  async has(recordKey: string): Promise<boolean> {
    await this.ensureLoaded();
    return this.processedRecords.has(recordKey);
  }

  async isRecordUpToDate(
    syncId: string,
    recordId: string,
    syncedAt: string
  ): Promise<boolean> {
    await this.ensureLoaded();
    const recordKey = `${syncId}:${recordId}`;
    const existing = this.processedRecords.get(recordKey);
    if (!existing) {
      return false;
    }
    return existing.syncedAt === syncedAt;
  }

  async markProcessed(
    syncId: string,
    recordId: string,
    syncedAt: string,
    fileName?: string
  ): Promise<void> {
    await this.ensureLoaded();
    const recordKey = `${syncId}:${recordId}`;
    this.processedRecords.set(recordKey, {
      syncId,
      recordId,
      syncedAt,
      fileName,
    });
    await this.save();
  }

  async getFileName(
    syncId: string,
    recordId: string
  ): Promise<string | undefined> {
    await this.ensureLoaded();
    const recordKey = `${syncId}:${recordId}`;
    const record = this.processedRecords.get(recordKey);
    return record?.fileName;
  }

  async clear(): Promise<void> {
    this.processedRecords.clear();
    if (config.persistence.mode === "s3" && this.s3Service) {
      try {
        await this.s3Service.uploadString(config.persistence.s3Key, "[]");
      } catch (error) {
        logger.warn(LogCategory.STORAGE, "Failed to clear records in S3", {
          s3Key: config.persistence.s3Key,
          error,
        });
      }
    } else {
      if (fs.existsSync(this.filePath)) {
        fs.unlinkSync(this.filePath);
      }
    }
  }

  async forceReprocess(syncId: string, recordId: string): Promise<void> {
    await this.ensureLoaded();
    const recordKey = `${syncId}:${recordId}`;
    this.processedRecords.delete(recordKey);
    await this.save();
  }

  async getSyncCursor(syncId: string): Promise<string | undefined> {
    await this.ensureLoaded();
    const state = this.syncStates.get(syncId);
    return state?.cursor;
  }

  async getSyncState(syncId: string): Promise<SyncState | undefined> {
    await this.ensureLoaded();
    return this.syncStates.get(syncId);
  }

  async getAllActiveSyncStates(): Promise<SyncState[]> {
    await this.ensureLoaded();
    return Array.from(this.syncStates.values()).filter(
      (state) => state.status !== "dead" && state.status !== "failed"
    );
  }

  async getFailedSyncStates(): Promise<SyncState[]> {
    await this.ensureLoaded();
    return Array.from(this.syncStates.values()).filter(
      (state) => state.status === "failed" || state.status === "dead"
    );
  }

  async createSyncState(syncId: string, userId: string): Promise<void> {
    await this.ensureLoaded();
    this.syncStates.set(syncId, {
      syncId,
      userId,
      status: "active",
    });
    await this.saveState();
  }

  async markSyncFailed(syncId: string): Promise<void> {
    await this.ensureLoaded();
    const state = this.syncStates.get(syncId);
    if (state) {
      state.failureCount = (state.failureCount || 0) + 1;
      state.lastFailureAt = new Date().toISOString();

      const maxFailures = parseInt(process.env.MAX_SYNC_FAILURES || "10", 10);

      if (state.failureCount >= maxFailures) {
        state.status = "dead";
        logger.warn(
          LogCategory.STORAGE,
          `Sync ${syncId} marked as dead after ${state.failureCount} failures`,
          { syncId, failureCount: state.failureCount }
        );
      } else {
        state.status = "failed";
      }

      await this.saveState();
    }
  }

  async resetSyncFailures(syncId: string): Promise<void> {
    await this.ensureLoaded();
    const state = this.syncStates.get(syncId);
    if (state) {
      state.failureCount = 0;
      state.lastFailureAt = undefined;
      state.status = "active";
      await this.saveState();
    }
  }

  async setSyncCursor(
    syncId: string,
    userId: string,
    cursor: string | undefined
  ): Promise<void> {
    await this.ensureLoaded();
    const state = this.syncStates.get(syncId) || {
      syncId,
      userId,
      status: "active",
    };
    state.userId = userId;
    state.cursor = cursor;
    state.lastProcessedAt = new Date().toISOString();
    state.status = cursor ? "active" : state.status || "active";
    if (cursor) {
      state.failureCount = 0;
      state.lastFailureAt = undefined;
    }
    this.syncStates.set(syncId, state);
    await this.saveState();
  }

  async clearSyncCursor(syncId: string): Promise<void> {
    await this.ensureLoaded();
    this.syncStates.delete(syncId);
    await this.saveState();
  }
}
