import { insertDomMutation } from "../storage/sqlite.js";
import { emitMutation } from "../lib/event-bus.js";
import { childLogger } from "../lib/logger.js";

const log = childLogger({ module: "dom-mutation" });

export function handleDomMutation(
  sessionId: string,
  seq: number,
  payload: unknown,
): void {
  const json = JSON.stringify(payload);
  insertDomMutation(sessionId, seq, json);
  emitMutation(sessionId, seq, payload);
  log.debug({ sessionId, seq, payloadSize: json.length }, "DOM mutation stored");
}
