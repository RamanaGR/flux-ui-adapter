import { config } from "../config.js";
import { logger } from "../lib/logger.js";
import { getCompletedSessions, markSessionArchived, getDb } from "./sqlite.js";

export interface LongTermStore {
  uploadMutations(sessionId: string, mutations: unknown[]): Promise<void>;
  uploadSnapshots(sessionId: string, snapshots: Array<{ filePath: string; seq: number }>): Promise<void>;
}

const noopStore: LongTermStore = {
  async uploadMutations(sessionId, mutations) {
    logger.debug({ sessionId, count: mutations.length }, "Stub: would upload mutations to long-term storage");
  },
  async uploadSnapshots(sessionId, snapshots) {
    logger.debug({ sessionId, count: snapshots.length }, "Stub: would upload snapshots to long-term storage");
  },
};

let flushInterval: ReturnType<typeof setInterval> | null = null;
let store: LongTermStore = noopStore;

export function setLongTermStore(s: LongTermStore): void {
  store = s;
}

export async function flushCompletedSessions(): Promise<number> {
  const sessions = getCompletedSessions();
  if (sessions.length === 0) return 0;

  const db = getDb();
  let flushed = 0;

  for (const { id: sessionId } of sessions) {
    try {
      const mutations = db
        .prepare("SELECT seq, payload, created_at FROM dom_mutations WHERE session_id = ? ORDER BY seq")
        .all(sessionId) as Array<{ seq: number; payload: string; created_at: number }>;

      const snapshots = db
        .prepare("SELECT seq, file_path FROM canvas_snapshots WHERE session_id = ? ORDER BY seq")
        .all(sessionId) as Array<{ seq: number; file_path: string }>;

      await store.uploadMutations(
        sessionId,
        mutations.map((m) => ({ seq: m.seq, payload: JSON.parse(m.payload), createdAt: m.created_at })),
      );

      await store.uploadSnapshots(
        sessionId,
        snapshots.map((s) => ({ filePath: s.file_path, seq: s.seq })),
      );

      markSessionArchived(sessionId);
      flushed++;
      logger.info(
        { sessionId, mutations: mutations.length, snapshots: snapshots.length },
        "Session flushed to long-term storage",
      );
    } catch (err) {
      logger.error({ sessionId, err }, "Failed to flush session");
    }
  }

  return flushed;
}

export function startFlushWorker(): void {
  if (flushInterval) return;

  flushInterval = setInterval(async () => {
    try {
      const count = await flushCompletedSessions();
      if (count > 0) {
        logger.info({ flushed: count }, "Flush cycle complete");
      }
    } catch (err) {
      logger.error({ err }, "Flush worker error");
    }
  }, config.flushIntervalMs);

  logger.info({ intervalMs: config.flushIntervalMs }, "Flush worker started");
}

export function stopFlushWorker(): void {
  if (flushInterval) {
    clearInterval(flushInterval);
    flushInterval = null;
    logger.info("Flush worker stopped");
  }
}
