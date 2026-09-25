export interface SyncConfig {
  integration: string;
  pipeline: string;
  configuration?: Record<string, any>;
  configurationName?: string;
}

export interface Sync {
  id: string;
  integration: string;
  pipeline: string;
  status: SyncStatus;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
}

export type SyncStatus = "PENDING" | "SYNCING" | "IDLE" | "ERROR";

export interface SyncedRecord {
  id: string;
  syncId: string;
  name: string;
  mimeType?: string;
  size?: number;
  syncedAt: string;
  metadata?: Record<string, any>;
}

export interface RecordsResponse {
  data: SyncedRecord[];
  paging: {
    totalRecords: number;
    totalActiveRecords: number;
    remainingRecords: number;
    cursor: string | null;
    lastSeen: number;
  };
}

export interface WebhookEvent {
  event:
    | "sync_complete"
    | "sync_errored"
    | "record_created"
    | "record_updated"
    | "record_deleted"
    | "record_errored"
    | "webhook_verification";
  syncInstanceId: string;
  sync?: string;
  user: {
    id: string;
  };
  data?: {
    recordId?: string;
    model?: string;
    syncedAt?: string;
    numRecords?: number;
  };
  error?: {
    message?: string;
    recordId?: string;
    model?: string;
  };
  timestamp?: string;
  metadata?: Record<string, any>;
}
