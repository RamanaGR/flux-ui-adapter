import { config } from "./config.js";
import { logger } from "./lib/logger.js";
import { closeDb } from "./storage/sqlite.js";
import { clearAllHeartbeats } from "./ws/heartbeat.js";
import { startFlushWorker, stopFlushWorker } from "./storage/flush-worker.js";
import { buildServer } from "./app.js";

async function start() {
  const app = await buildServer();

  startFlushWorker();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down...");
    stopFlushWorker();
    clearAllHeartbeats();
    await app.close();
    closeDb();
    logger.info("Server stopped");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  await app.listen({ port: config.port, host: config.host });
  logger.info(
    { port: config.port, host: config.host, env: config.env },
    `ChromaBridge server listening on ${config.host}:${config.port}`,
  );
}

start().catch((err) => {
  logger.fatal({ err }, "Failed to start server");
  process.exit(1);
});
