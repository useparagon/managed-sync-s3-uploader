import axios, { AxiosInstance } from "axios";
import { config } from "../config/env";
import {
  Sync,
  SyncConfig,
  SyncStatus,
  SyncedRecord,
  RecordsResponse,
} from "../types/sync";
import { withRetry } from "../utils/retry";
import { wrapAxiosError } from "../utils/axiosError";

export class SyncApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.paragon.baseUrl;
  }

  private createClient(token: string): AxiosInstance {
    return axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 60000,
    });
  }

  async enableSync(token: string, syncConfig: SyncConfig): Promise<Sync> {
    return withRetry(async () => {
      try {
        const client = this.createClient(token);
        const response = await client.post<Sync>("/syncs", {
          integration: syncConfig.integration,
          pipeline: syncConfig.pipeline,
          configuration: syncConfig.configuration || {},
          configurationName: syncConfig.configurationName,
        });
        return response.data;
      } catch (error) {
        throw wrapAxiosError(error);
      }
    });
  }

  async getSyncStatus(token: string, syncId: string): Promise<Sync> {
    return withRetry(async () => {
      try {
        const client = this.createClient(token);
        const response = await client.get<Sync>(`/syncs/${syncId}`);
        return response.data;
      } catch (error) {
        throw wrapAxiosError(error);
      }
    });
  }

  async pullSyncedRecords(
    token: string,
    syncId: string,
    cursor?: string,
    limit: number = 100
  ): Promise<RecordsResponse> {
    return withRetry(async () => {
      try {
        const client = this.createClient(token);
        const params: Record<string, any> = { limit };
        if (cursor) {
          params.cursor = cursor;
        }

        const response = await client.get<RecordsResponse>(
          `/syncs/${syncId}/records`,
          {
            params,
          }
        );
        return response.data;
      } catch (error) {
        throw wrapAxiosError(error);
      }
    });
  }

  async getSyncedRecord(
    token: string,
    syncId: string,
    recordId: string
  ): Promise<SyncedRecord> {
    return withRetry(async () => {
      try {
        const client = this.createClient(token);
        const response = await client.get<{ data: SyncedRecord }>(
          `/syncs/${syncId}/records/${recordId}`
        );
        return response.data.data;
      } catch (error) {
        throw wrapAxiosError(error);
      }
    });
  }

  async downloadFileContent(
    token: string,
    syncId: string,
    recordId: string
  ): Promise<Buffer> {
    return withRetry(
      async () => {
        try {
          const client = this.createClient(token);
          const response = await client.get(
            `/syncs/${syncId}/records/${recordId}/content`,
            {
              responseType: "arraybuffer",
            }
          );
          return Buffer.from(response.data);
        } catch (error) {
          throw wrapAxiosError(error);
        }
      },
      {
        maxRetries: 5,
        initialDelayMs: 2000,
      }
    );
  }

  async waitForSyncCompletion(
    token: string,
    syncId: string,
    pollIntervalMs: number = 5000,
    maxWaitMs: number = 300000
  ): Promise<Sync> {
    const startTime = Date.now();

    while (true) {
      const sync = await this.getSyncStatus(token, syncId);

      if (sync.status === "IDLE") {
        return sync;
      }

      if (sync.status === "ERROR") {
        throw new Error(`Sync ${syncId} failed with error status`);
      }

      if (Date.now() - startTime > maxWaitMs) {
        throw new Error(
          `Sync ${syncId} did not complete within ${maxWaitMs}ms`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }
}
