export const MessageType = {
  DOM_MUTATION: "TYPE_DOM_MUTATION",
  CANVAS_SNAPSHOT: "TYPE_CANVAS_SNAPSHOT",
  HEARTBEAT: "TYPE_HEARTBEAT",
  UI_CONFIG: "TYPE_UI_CONFIG",
} as const;

export interface DomMutation {
  target: string;
  type: "childList" | "attributes" | "characterData";
  addedNodes?: string[];
  removedNodes?: string[];
  attributeName?: string;
  oldValue?: string | null;
  newValue?: string | null;
}

export interface DomMutationPayload {
  url: string;
  mutations: DomMutation[];
}

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

export interface ContentMessage {
  action: "DOM_MUTATIONS";
  payload: DomMutationPayload;
}

export interface CaptureConfig {
  mutationsEnabled: boolean;
  screenshotsEnabled: boolean;
  screenshotIntervalMs: number;
}

export interface UiConfigMessage {
  type: typeof MessageType.UI_CONFIG;
  theme?: Record<string, string>;
  translations?: Record<string, string>;
  settings?: Partial<CaptureConfig> & Record<string, unknown>;
}
