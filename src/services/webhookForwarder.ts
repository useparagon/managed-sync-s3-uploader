import axios from "axios";
import { WebhookEvent } from "../types/sync";
import { config } from "../config/env";
import { wrapAxiosError } from "../utils/axiosError";
import { logger, LogCategory } from "../utils/logger";

export class WebhookForwarder {
  private webhookUrl: string | undefined;

  constructor() {
    this.webhookUrl = config.webhook.customerWebhookUrl;
  }

  async forwardEvent(event: WebhookEvent): Promise<void> {
    if (!this.webhookUrl) {
      logger.debug(
        LogCategory.WEBHOOK,
        "No customer webhook URL configured, skipping forwarding"
      );
      return;
    }

    try {
      logger.info(
        LogCategory.WEBHOOK,
        `Forwarding webhook event ${event.event} to ${this.webhookUrl}`,
        { event: event.event, webhookUrl: this.webhookUrl }
      );
      await axios.post(this.webhookUrl, event, {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000,
      });
      logger.info(
        LogCategory.WEBHOOK,
        `Successfully forwarded webhook event ${event.event}`,
        { event: event.event }
      );
    } catch (error: unknown) {
      const apiError = wrapAxiosError(error);
      logger.error(
        LogCategory.WEBHOOK,
        `Failed to forward webhook event ${event.event} to ${this.webhookUrl}`,
        {
          event: event.event,
          webhookUrl: this.webhookUrl,
          statusCode: apiError.statusCode,
          body: apiError.body,
          error: apiError.message,
        }
      );
    }
  }
}
