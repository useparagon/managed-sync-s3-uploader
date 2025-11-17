import express, { Express, Request, Response } from "express";
import { config } from "./config/env";
import syncRoutes from "./routes/syncs";
import webhookRoutes from "./routes/webhooks";
import { ProxyService } from "./services/proxyService";
import { SyncManager } from "./services/syncManager";
import { requireAuth, AuthenticatedRequest } from "./middleware/auth";
import { logger, LogCategory } from "./utils/logger";

const app: Express = express();
const proxyService = new ProxyService();
const syncManager = new SyncManager();

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api", syncRoutes);
app.use("/api", webhookRoutes);

app.use(
  "/api",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    await proxyService.proxyRequest(req, res, req.paragonToken!);
  }
);

const port = config.server.port;

app.listen(port, async () => {
  logger.info(
    LogCategory.SERVER,
    `Paragon Sync Extractor service running on port ${port}`,
    {
      port,
    }
  );
  logger.info(
    LogCategory.SERVER,
    `Health check: http://localhost:${port}/health`
  );
  logger.info(
    LogCategory.SERVER,
    `Create sync: POST http://localhost:${port}/api/syncs`
  );
  logger.info(
    LogCategory.SERVER,
    `Webhooks: POST http://localhost:${port}/api/webhooks`
  );

  await syncManager.recoverActiveSyncs();
});
