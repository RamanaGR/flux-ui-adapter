import { z } from "zod";

export const MessageType = {
  DOM_MUTATION: "TYPE_DOM_MUTATION",
  CANVAS_SNAPSHOT: "TYPE_CANVAS_SNAPSHOT",
  HEARTBEAT: "TYPE_HEARTBEAT",
  UI_CONFIG: "TYPE_UI_CONFIG",
} as const;

export const DomMutationPayloadSchema = z.object({
  url: z.string(),
  mutations: z.array(
    z.object({
      target: z.string(),
      type: z.enum(["childList", "attributes", "characterData"]),
      addedNodes: z.array(z.string()).optional(),
      removedNodes: z.array(z.string()).optional(),
      attributeName: z.string().optional(),
      oldValue: z.string().nullable().optional(),
      newValue: z.string().nullable().optional(),
    }),
  ),
});

export const HeartbeatPayloadSchema = z.object({
  tabActive: z.boolean().optional(),
  memoryUsage: z.number().optional(),
});

export const MessageEnvelopeSchema = z.object({
  type: z.enum([
    MessageType.DOM_MUTATION,
    MessageType.CANVAS_SNAPSHOT,
    MessageType.HEARTBEAT,
  ]),
  sessionId: z.string().uuid(),
  timestamp: z.number(),
  compressed: z.boolean().default(false),
  payload: z.unknown(),
});

export const DomMutationMessageSchema = MessageEnvelopeSchema.extend({
  type: z.literal(MessageType.DOM_MUTATION),
  payload: DomMutationPayloadSchema,
});

export const HeartbeatMessageSchema = MessageEnvelopeSchema.extend({
  type: z.literal(MessageType.HEARTBEAT),
  payload: HeartbeatPayloadSchema,
});

export const UiConfigSchema = z.object({
  type: z.literal(MessageType.UI_CONFIG),
  theme: z.record(z.string()).optional(),
  translations: z.record(z.string()).optional(),
  settings: z.record(z.unknown()).optional(),
});

export const ScreenshotPayloadSchema = z.object({
  dataUrl: z.string(),
  url: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
});

export const ScreenshotMessageSchema = MessageEnvelopeSchema.extend({
  type: z.literal(MessageType.CANVAS_SNAPSHOT),
  payload: ScreenshotPayloadSchema,
});

export type MessageEnvelope = z.infer<typeof MessageEnvelopeSchema>;
export type DomMutationMessage = z.infer<typeof DomMutationMessageSchema>;
export type HeartbeatMessage = z.infer<typeof HeartbeatMessageSchema>;
export type UiConfig = z.infer<typeof UiConfigSchema>;
export type ScreenshotPayload = z.infer<typeof ScreenshotPayloadSchema>;

/** Binary canvas snapshot wire format:
 *  [0..1]   uint16 LE — type tag (0x0001 = canvas snapshot)
 *  [2..37]  36 bytes  — session UUID as ASCII
 *  [38..45] float64 LE — timestamp (ms since epoch)
 *  [46..49] uint32 LE — sequence number
 *  [50]     uint8     — compressed flag (0 or 1)
 *  [51..]   raw image data (webp/jpg)
 */
export const BINARY_TYPE_CANVAS = 0x0001;
export const BINARY_HEADER_SIZE = 51;

export interface CanvasSnapshotHeader {
  sessionId: string;
  timestamp: number;
  seq: number;
  compressed: boolean;
}

export function parseBinaryHeader(buf: Buffer): CanvasSnapshotHeader {
  if (buf.length < BINARY_HEADER_SIZE) {
    throw new Error(`Binary message too short: ${buf.length} < ${BINARY_HEADER_SIZE}`);
  }
  const typeTag = buf.readUInt16LE(0);
  if (typeTag !== BINARY_TYPE_CANVAS) {
    throw new Error(`Unknown binary type tag: 0x${typeTag.toString(16)}`);
  }
  return {
    sessionId: buf.subarray(2, 38).toString("ascii"),
    timestamp: buf.readDoubleLE(38),
    seq: buf.readUInt32LE(46),
    compressed: buf[50] === 1,
  };
}
