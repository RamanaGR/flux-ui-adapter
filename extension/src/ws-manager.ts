import { gzipSync } from "fflate";
import { MessageType, type MessageEnvelope } from "./types.js";

export interface WsManagerOptions {
  url: string;
  apiKey: string;
  sessionId: string;
  onMessage?: (data: unknown) => void;
  onStatusChange?: (connected: boolean) => void;
}

const INITIAL_DELAY = 1000;
const MAX_DELAY = 30000;

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectDelay = INITIAL_DELAY;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionallyClosed = false;

  private readonly url: string;
  private readonly apiKey: string;
  private readonly sessionId: string;
  private readonly onMessage?: (data: unknown) => void;
  private readonly onStatusChange?: (connected: boolean) => void;

  constructor(options: WsManagerOptions) {
    this.url = options.url;
    this.apiKey = options.apiKey;
    this.sessionId = options.sessionId;
    this.onMessage = options.onMessage;
    this.onStatusChange = options.onStatusChange;
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.intentionallyClosed = false;

    try {
      const connUrl = new URL(this.url);
      connUrl.searchParams.set("apiKey", this.apiKey);
      connUrl.searchParams.set("sessionId", this.sessionId);
      this.ws = new WebSocket(connUrl.toString());
      this.ws.binaryType = "arraybuffer";

      this.ws.addEventListener("open", () => this.handleOpen());
      this.ws.addEventListener("message", (event) => this.handleMessage(event));
      this.ws.addEventListener("close", (event) => this.handleClose(event));
      this.ws.addEventListener("error", () => this.handleError());
    } catch {
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }
    this.onStatusChange?.(false);
  }

  sendScreenshot(payload: unknown): void {
    const envelope: MessageEnvelope = {
      type: MessageType.CANVAS_SNAPSHOT,
      sessionId: this.sessionId,
      timestamp: Date.now(),
      compressed: true,
      payload,
    };

    if (this.isConnected()) {
      this.sendCompressed(envelope);
    }
  }

  sendHeartbeat(): void {
    const envelope: MessageEnvelope = {
      type: MessageType.HEARTBEAT,
      sessionId: this.sessionId,
      timestamp: Date.now(),
      compressed: false,
      payload: { tabActive: true },
    };

    if (this.isConnected()) {
      this.ws!.send(JSON.stringify(envelope));
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private handleOpen(): void {
    console.log("[ChromaBridge] WebSocket connected");
    this.reconnectDelay = INITIAL_DELAY;
    this.onStatusChange?.(true);
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(
        typeof event.data === "string"
          ? event.data
          : new TextDecoder().decode(event.data),
      );
      this.onMessage?.(data);
    } catch {
      console.warn("[ChromaBridge] Failed to parse server message");
    }
  }

  private handleClose(event: CloseEvent): void {
    console.log(`[ChromaBridge] WebSocket closed: code=${event.code}`);
    this.ws = null;
    this.onStatusChange?.(false);

    if (!this.intentionallyClosed) {
      this.scheduleReconnect();
    }
  }

  private handleError(): void {
    console.warn("[ChromaBridge] WebSocket error");
    if (this.ws) {
      this.ws.close();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    console.log(`[ChromaBridge] Reconnecting in ${this.reconnectDelay}ms...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_DELAY);
      this.connect();
    }, this.reconnectDelay);
  }

  private sendCompressed(envelope: MessageEnvelope): void {
    const json = JSON.stringify(envelope);
    const compressed = gzipSync(new TextEncoder().encode(json));
    this.ws!.send(compressed.buffer);
  }
}
