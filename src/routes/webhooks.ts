import { Router, Request, Response, NextFunction } from "express";
import { SyncManager } from "../services/syncManager";
import { WebhookForwarder } from "../services/webhookForwarder";
import { jwtService } from "../services/jwtService";
import { WebhookEvent } from "../types/sync";
import { logger, LogCategory } from "../utils/logger";

const router = Router();
const syncManager = new SyncManager();
const webhookForwarder = new WebhookForwarder();

router.post("/webhooks", async (req: Request, res: Response) => {
  try {
    logger.debug(LogCategory.WEBHOOK, "Webhook request received", {
      body: req.body,
      headers: req.headers,
    });

    const event: WebhookEvent & { token?: string } = req.body;

    if (!event || typeof event !== "object") {
      logger.error(
        LogCategory.WEBHOOK,
        "Invalid webhook payload: body is not an object",
        req.body
      );
      res.status(400).json({
        success: false,
        error: "Invalid webhook payload",
      });
      return;
    }

    if (!event.event || !event.syncInstanceId || !event.user.id) {
      logger.error(
        LogCategory.WEBHOOK,
        "Invalid webhook payload: missing event, syncInstanceId, or userId",
        event
      );
      res.status(400).json({
        success: false,
        error:
          "Invalid webhook payload: event, syncInstanceId, and userId are required",
        received: event,
      });
      return;
    }

    logger.info(
      LogCategory.WEBHOOK,
      `Received webhook event: ${event.event} for sync ${event.syncInstanceId}`,
      { syncInstanceId: event.syncInstanceId, event: event.event }
    );

    res.status(200).json({ success: true });

    webhookForwarder
      .forwardEvent(event)
      .catch((error) =>
        logger.error(
          LogCategory.WEBHOOK,
          `Failed to forward webhook event ${event.event} to customer webhook`,
          error
        )
      );

    const token = jwtService.signToken(event.user.id);
    logger.debug(
      LogCategory.AUTH,
      `Generated JWT token for user ${event.user.id}`,
      {
        userId: event.user.id,
      }
    );

    switch (event.event) {
      case "sync_complete":
        logger.info(
          LogCategory.SYNC,
          `Sync ${event.syncInstanceId} completed, processing all records...`,
          { syncInstanceId: event.syncInstanceId }
        );
        syncManager
          .processAllRecords(
            token,
            event.syncInstanceId,
            undefined,
            event.user.id
          )
          .catch((error) =>
            logger.error(
              LogCategory.SYNC,
              `Failed to process records for sync ${event.syncInstanceId}`,
              error
            )
          );
        break;

      case "record_created":
        if (event.data?.recordId) {
          logger.info(
            LogCategory.SYNC,
            `Processing ${event.event} for record ${event.data?.recordId}`,
            {
              recordId: event.data?.recordId,
              syncInstanceId: event.syncInstanceId,
            }
          );
          syncManager
            .processIncrementalSync(
              token,
              event.syncInstanceId,
              event.data?.recordId,
              false
            )
            .catch((error) =>
              logger.error(
                LogCategory.SYNC,
                `Failed to process incremental sync for record ${event.data?.recordId}`,
                error
              )
            );
        }
        break;

      case "record_updated":
        if (event.data?.recordId) {
          logger.info(
            LogCategory.SYNC,
            `Processing ${event.event} for record ${event.data?.recordId}`,
            {
              recordId: event.data?.recordId,
              syncInstanceId: event.syncInstanceId,
            }
          );
          syncManager
            .processIncrementalSync(
              token,
              event.syncInstanceId,
              event.data?.recordId,
              true
            )
            .catch((error) =>
              logger.error(
                LogCategory.SYNC,
                `Failed to process incremental sync for record ${event.data?.recordId}`,
                error
              )
            );
        }
        break;

      case "record_deleted":
        logger.info(
          LogCategory.SYNC,
          `Record ${event.data?.recordId} deleted, removing from persistence`,
          {
            recordId: event.data?.recordId,
            syncInstanceId: event.syncInstanceId,
          }
        );
        if (event.data?.recordId) {
          syncManager
            .removeRecord(event.syncInstanceId, event.data?.recordId)
            .catch((error: any) =>
              logger.error(
                LogCategory.SYNC,
                `Failed to remove record ${event.data?.recordId} from persistence`,
                error
              )
            );
        }
        break;

      default:
        logger.warn(
          LogCategory.WEBHOOK,
          `Unknown webhook event type: ${(event as any).event}`,
          { event: (event as any).event }
        );
    }
  } catch (error) {
    logger.error(LogCategory.WEBHOOK, "Error processing webhook", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
