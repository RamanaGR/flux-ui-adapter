import Fastify from "fastify";
import { initDb } from "./storage/sqlite.js";
import { createWss, handleUpgrade } from "./ws/upgrade.js";
import { createViewerWss, handleViewerUpgrade } from "./ws/viewer.js";
import { healthRoutes } from "./routes/health.js";
import { landingRoutes } from "./routes/landing.js";
import { sessionViewRoutes } from "./routes/session-view.js";
import { screenshotRoutes } from "./routes/screenshots.js";
import { sessionsListRoutes } from "./routes/sessions-list.js";

export async function buildServer() {
  const app = Fastify({ logger: false });

  initDb();
  createWss();
  createViewerWss();

  await app.register(healthRoutes);
  await app.register(sessionViewRoutes);
  await app.register(screenshotRoutes);
  await app.register(sessionsListRoutes);
  await app.register(landingRoutes);

  app.server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (url.pathname.startsWith("/viewer/")) {
      handleViewerUpgrade(request, socket, head);
    } else {
      handleUpgrade(request, socket, head);
    }
  });

  return app;
}
