import { Router, Response, NextFunction } from "express";
import { SyncManager } from "../services/syncManager";
import { SyncApiClient } from "../services/syncApi";
import { SyncConfig } from "../types/sync";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { ApiError } from "../utils/axiosError";
import { logger, LogCategory } from "../utils/logger";

const router = Router();
const syncManager = new SyncManager();
const syncApi = new SyncApiClient();

router.post(
  "/syncs",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const syncConfig: SyncConfig = req.body;
      const token = req.paragonToken!;

      if (!syncConfig.integration || !syncConfig.pipeline) {
        res.status(400).json({
          error: "integration and pipeline are required",
        });
        return;
      }

      logger.info(
        LogCategory.API,
        `Creating sync for ${syncConfig.integration}/${syncConfig.pipeline}`,
        { integration: syncConfig.integration, pipeline: syncConfig.pipeline }
      );

      const sync = await syncApi.enableSync(token, syncConfig);
      await syncManager.createSyncState(sync.id, sync.userId);

      res.status(201).json(sync);
    } catch (error: unknown) {
      logger.error(LogCategory.API, "Error creating sync", error);
      if (error instanceof ApiError && error.statusCode) {
        const responseBody: any = {
          error: "Failed to create sync",
          message: error.message,
        };

        if (error.body !== undefined) {
          if (typeof error.body === "object" && error.body !== null) {
            Object.assign(responseBody, error.body);
          } else {
            responseBody.details = error.body;
          }
        }

        res.status(error.statusCode).json(responseBody);
      } else {
        const err = error as Error;
        res.status(500).json({
          error: "Failed to create sync",
          message: err.message || "Unknown error",
        });
      }
    }
  }
);

router.get(
  "/syncs/:syncId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { syncId } = req.params;
      const token = req.paragonToken!;
      const sync = await syncApi.getSyncStatus(token, syncId);
      res.json(sync);
    } catch (error: unknown) {
      logger.error(LogCategory.API, "Error getting sync status", {
        syncId: req.params.syncId,
        error,
      });
      if (error instanceof ApiError && error.statusCode) {
        const responseBody: any = {
          error: "Failed to get sync status",
          message: error.message,
        };

        if (error.body !== undefined) {
          if (typeof error.body === "object" && error.body !== null) {
            Object.assign(responseBody, error.body);
          } else {
            responseBody.details = error.body;
          }
        }

        res.status(error.statusCode).json(responseBody);
      } else {
        const err = error as Error;
        res.status(500).json({
          error: "Failed to get sync status",
          message: err.message || "Unknown error",
        });
      }
    }
  }
);

router.post(
  "/syncs/:syncId/process",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { syncId } = req.params;
      const { cursor } = req.body;
      const token = req.paragonToken!;

      logger.info(LogCategory.API, `Processing records for sync ${syncId}`, {
        syncId: syncId,
        cursor,
      });
      await syncManager.processAllRecords(token, syncId, cursor);

      res.json({
        success: true,
        message: "Records processed successfully",
      });
    } catch (error: unknown) {
      logger.error(LogCategory.API, "Error processing records", {
        syncId: req.params.syncId,
        error,
      });
      if (error instanceof ApiError && error.statusCode) {
        const responseBody: any = {
          error: "Failed to process records",
          message: error.message,
        };

        if (error.body !== undefined) {
          if (typeof error.body === "object" && error.body !== null) {
            Object.assign(responseBody, error.body);
          } else {
            responseBody.details = error.body;
          }
        }

        res.status(error.statusCode).json(responseBody);
      } else {
        const err = error as Error;
        res.status(500).json({
          error: "Failed to process records",
          message: err.message || "Unknown error",
        });
      }
    }
  }
);

router.use((req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  next();
});

export default router;
