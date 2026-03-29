import { WebSocketManager } from "./ws-manager.js";
import { ScreenshotManager } from "./screenshot-manager.js";
import { MessageType, type ContentMessage, type UiConfigMessage, type CaptureConfig } from "./types.js";

const SERVER_URL = "ws://localhost:3000";
const HEARTBEAT_INTERVAL_MS = 20_000;

let manager: WebSocketManager | null = null;
let screenshotMgr: ScreenshotManager | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

const captureConfig: CaptureConfig = {
  mutationsEnabled: true,
  screenshotsEnabled: false,
  screenshotIntervalMs: 10000,
};

async function getConfig(): Promise<{ apiKey: string; sessionId: string; serverUrl: string }> {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      { apiKey: "change-me-to-a-secure-random-string", sessionId: crypto.randomUUID(), serverUrl: SERVER_URL },
      (result) => {
        chrome.storage.local.set({ sessionId: result.sessionId });
        resolve(result as { apiKey: string; sessionId: string; serverUrl: string });
      },
    );
  });
}

async function init(): Promise<void> {
  const config = await getConfig();

  manager = new WebSocketManager({
    url: config.serverUrl,
    apiKey: config.apiKey,
    sessionId: config.sessionId,
    onMessage: handleServerMessage,
    onStatusChange: (connected) => {
      console.log(`[ChromaBridge BG] Connection: ${connected ? "online" : "offline"}`);
      if (!connected && screenshotMgr?.isCapturing()) {
        screenshotMgr.stop();
      }
    },
  });

  screenshotMgr = new ScreenshotManager(manager);
  manager.connect();

  heartbeatTimer = setInterval(() => {
    manager?.sendHeartbeat();
  }, HEARTBEAT_INTERVAL_MS);
}

function handleServerMessage(data: unknown): void {
  const msg = data as Record<string, unknown>;
  if (msg.type === MessageType.UI_CONFIG) {
    const configMsg = msg as unknown as UiConfigMessage;
    console.log("[ChromaBridge BG] Received UI config update:", configMsg);

    if (configMsg.settings) {
      if (typeof configMsg.settings.mutationsEnabled === "boolean") {
        captureConfig.mutationsEnabled = configMsg.settings.mutationsEnabled;
      }
      if (typeof configMsg.settings.screenshotsEnabled === "boolean") {
        captureConfig.screenshotsEnabled = configMsg.settings.screenshotsEnabled;
        if (!captureConfig.screenshotsEnabled && screenshotMgr?.isCapturing()) {
          screenshotMgr.stop();
        }
      }
      if (typeof configMsg.settings.screenshotIntervalMs === "number") {
        captureConfig.screenshotIntervalMs = configMsg.settings.screenshotIntervalMs;
      }
      console.log("[ChromaBridge BG] Capture config updated:", captureConfig);
    }

    if (configMsg.theme) {
      chrome.tabs.query({ active: true }, (tabs) => {
        for (const tab of tabs) {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, {
              action: "APPLY_THEME",
              theme: configMsg.theme,
            });
          }
        }
      });
    }
  }
}

chrome.runtime.onMessage.addListener((message: ContentMessage, _sender, _sendResponse) => {
  if (message.action === "DOM_MUTATIONS" && manager && captureConfig.mutationsEnabled) {
    manager.send(message.payload);
  }
  return false;
});

chrome.commands.onCommand.addListener((command) => {
  if (!captureConfig.screenshotsEnabled) {
    console.log(`[ChromaBridge] Command "${command}" ignored — screenshots disabled by server`);
    return;
  }

  if (command === "start-capture") {
    if (screenshotMgr && !screenshotMgr.isCapturing()) {
      screenshotMgr.start(captureConfig.screenshotIntervalMs);
    }
  } else if (command === "stop-capture") {
    screenshotMgr?.stop();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("[ChromaBridge] Extension installed — initializing...");
  init();
});

chrome.runtime.onStartup.addListener(() => {
  init();
});

init();
