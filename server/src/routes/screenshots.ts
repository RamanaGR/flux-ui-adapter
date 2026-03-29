import { FastifyInstance } from "fastify";
import { existsSync, readFileSync } from "node:fs";
import { getDb, isDbOpen } from "../storage/sqlite.js";

const MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  bin: "application/octet-stream",
};

export async function screenshotRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { sessionId: string; seq: string } }>(
    "/session/:sessionId/screenshots/:seq",
    async (request, reply) => {
      const { sessionId, seq } = request.params;
      const seqNum = parseInt(seq, 10);

      if (!isDbOpen() || isNaN(seqNum)) {
        return reply.status(400).send("Invalid request");
      }

      const db = getDb();
      const row = db
        .prepare("SELECT file_path FROM canvas_snapshots WHERE session_id = ? AND seq = ?")
        .get(sessionId, seqNum) as { file_path: string } | undefined;

      if (!row || !existsSync(row.file_path)) {
        return reply.status(404).send("Screenshot not found");
      }

      const ext = row.file_path.split(".").pop() || "bin";
      const contentType = MIME_MAP[ext] || "application/octet-stream";
      const data = readFileSync(row.file_path);

      return reply
        .header("Content-Type", contentType)
        .header("Cache-Control", "public, max-age=86400")
        .send(data);
    },
  );
}
