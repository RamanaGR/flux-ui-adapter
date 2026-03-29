import { FastifyInstance } from "fastify";
import { getActiveConnectionCount } from "../ws/upgrade.js";
import { getDb } from "../storage/sqlite.js";

const startedAt = Date.now();

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (_request, reply) => {
    let dbOk = false;
    try {
      const row = getDb().prepare("SELECT 1 AS ok").get() as { ok: number } | undefined;
      dbOk = row?.ok === 1;
    } catch {
      dbOk = false;
    }

    const status = dbOk ? "ok" : "degraded";
    const code = dbOk ? 200 : 503;

    return reply.status(code).send({
      status,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      activeConnections: getActiveConnectionCount(),
      db: dbOk ? "ok" : "error",
      timestamp: new Date().toISOString(),
    });
  });
}
