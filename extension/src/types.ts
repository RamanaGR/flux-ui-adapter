export const MessageType = {
  CANVAS_SNAPSHOT: "TYPE_CANVAS_SNAPSHOT",
  HEARTBEAT: "TYPE_HEARTBEAT",
  UI_CONFIG: "TYPE_UI_CONFIG",
} as const;

export interface ScreenshotPayload {
  dataUrl: string;
  url: string;
  width?: number;
  height?: number;
}

export interface MessageEnvelope {
  type: string;
  sessionId: string;
  timestamp: number;
  compressed: boolean;
  payload: unknown;
}

export interface CaptureConfig {
  screenshotsEnabled: boolean;
  screenshotIntervalMs: number;
}

export interface UiConfigMessage {
  type: typeof MessageType.UI_CONFIG;
  theme?: Record<string, string>;
  translations?: Record<string, string>;
  settings?: Partial<CaptureConfig> & Record<string, unknown>;
}
