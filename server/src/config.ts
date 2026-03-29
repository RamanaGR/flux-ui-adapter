import "dotenv/config";

function env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function envInt(key: string, fallback: number): number {
  const val = process.env[key];
  return val ? parseInt(val, 10) : fallback;
}

function envBool(key: string, fallback: boolean): boolean {
  const val = process.env[key];
  if (val === undefined) return fallback;
  return val === "true" || val === "1";
}

export const config = {
  get env() { return env("NODE_ENV", "development"); },
  get port() { return envInt("PORT", 3000); },
  get host() { return env("HOST", "0.0.0.0"); },
  get apiKey() { return env("API_KEY", "change-me-to-a-secure-random-string"); },
  get dbPath() { return env("DB_PATH", "./data/flux.db"); },
  get snapshotsDir() { return env("SNAPSHOTS_DIR", "./data/snapshots"); },
  get flushIntervalMs() { return envInt("FLUSH_INTERVAL_MS", 60000); },
  get heartbeatIntervalMs() { return envInt("HEARTBEAT_INTERVAL_MS", 15000); },
  get heartbeatTimeoutMs() { return envInt("HEARTBEAT_TIMEOUT_MS", 30000); },
  get logLevel() { return env("LOG_LEVEL", "info"); },
  get screenshotsEnabled() { return envBool("SCREENSHOTS_ENABLED", false); },
  get screenshotIntervalMs() { return envInt("SCREENSHOT_INTERVAL_MS", 10000); },
};
