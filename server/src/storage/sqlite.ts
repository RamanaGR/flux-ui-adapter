import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";

let db: Database.Database;

let closed = false;

export function getDb(): Database.Database {
  if (!db || closed) {
    throw new Error("Database not initialized — call initDb() first");
  }
  return db;
}

export function isDbOpen(): boolean {
  return !!db && !closed;
}

export function initDb(dbPath: string = config.dbPath): Database.Database {
  if (db) {
    try { db.close(); } catch { /* already closed */ }
  }
  closed = false;

  if (dbPath !== ":memory:") {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  db = new Database(dbPath);

  if (dbPath !== ":memory:") {
    db.pragma("journal_mode = WAL");
  }
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT PRIMARY KEY,
      status      TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at  INTEGER NOT NULL,
      completed_at INTEGER,
      archived    INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS dom_mutations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id  TEXT NOT NULL,
      seq         INTEGER NOT NULL,
      payload     TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_dom_mutations_session
      ON dom_mutations(session_id, seq);

    CREATE TABLE IF NOT EXISTS canvas_snapshots (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id  TEXT NOT NULL,
      seq         INTEGER NOT NULL,
      file_path   TEXT NOT NULL,
      size_bytes  INTEGER NOT NULL,
      created_at  INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_canvas_snapshots_session
      ON canvas_snapshots(session_id, seq);
  `);

  logger.info({ dbPath }, "SQLite initialized (WAL mode)");
  return db;
}

export function createSession(sessionId: string): void {
  getDb()
    .prepare("INSERT OR IGNORE INTO sessions (id, status, created_at) VALUES (?, 'ACTIVE', ?)")
    .run(sessionId, Date.now());
}

export function completeSession(sessionId: string): void {
  if (!isDbOpen()) return;
  getDb()
    .prepare("UPDATE sessions SET status = 'COMPLETE', completed_at = ? WHERE id = ?")
    .run(Date.now(), sessionId);
}

export function insertDomMutation(
  sessionId: string,
  seq: number,
  payload: string,
): void {
  getDb()
    .prepare(
      "INSERT INTO dom_mutations (session_id, seq, payload, created_at) VALUES (?, ?, ?, ?)",
    )
    .run(sessionId, seq, payload, Date.now());
}

export function insertCanvasSnapshotRef(
  sessionId: string,
  seq: number,
  filePath: string,
  sizeBytes: number,
): void {
  getDb()
    .prepare(
      "INSERT INTO canvas_snapshots (session_id, seq, file_path, size_bytes, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(sessionId, seq, filePath, sizeBytes, Date.now());
}

export function getCompletedSessions(): Array<{ id: string }> {
  return getDb()
    .prepare("SELECT id FROM sessions WHERE status = 'COMPLETE' AND archived = 0")
    .all() as Array<{ id: string }>;
}

export function markSessionArchived(sessionId: string): void {
  getDb()
    .prepare("UPDATE sessions SET archived = 1 WHERE id = ?")
    .run(sessionId);
}

export function closeDb(): void {
  if (db && !closed) {
    db.close();
    closed = true;
    logger.info("SQLite connection closed");
  }
}
