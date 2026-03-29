import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";

const SERVER_URL = process.env.SERVER_URL ?? "ws://localhost:3000";
const API_KEY = process.env.API_KEY ?? "change-me-to-a-secure-random-string";
const SESSION_ID = uuidv4();
const INTERVAL_MS = 2000;

let counter = 0;

console.log(`[test-client] Connecting to ${SERVER_URL}`);
console.log(`[test-client] Session ID: ${SESSION_ID}`);

const ws = new WebSocket(SERVER_URL, {
  headers: {
    "x-api-key": API_KEY,
    "x-session-id": SESSION_ID,
  },
});

ws.on("open", () => {
  console.log("[test-client] Connected! Sending DOM mutations every 2s...\n");

  const interval = setInterval(() => {
    counter++;
    const message = {
      type: "TYPE_DOM_MUTATION",
      sessionId: SESSION_ID,
      timestamp: Date.now(),
      compressed: false,
      payload: {
        url: "https://example.com/test-page",
        mutations: [
          {
            target: "body > div.content",
            type: "childList" as const,
            addedNodes: [`<div class="question" data-seq="${counter}">Test Question ${counter}</div>`],
          },
        ],
      },
    };

    ws.send(JSON.stringify(message));
    console.log(`[test-client] Sent mutation #${counter} at ${new Date().toISOString()}`);
  }, INTERVAL_MS);

  ws.on("close", () => {
    clearInterval(interval);
    console.log("[test-client] Connection closed");
    process.exit(0);
  });
});

ws.on("message", (data) => {
  console.log(`[test-client] Server response: ${data.toString()}`);
});

ws.on("error", (err) => {
  console.error(`[test-client] Error: ${err.message}`);
  process.exit(1);
});

process.on("SIGINT", () => {
  console.log("\n[test-client] Shutting down...");
  ws.close();
});
