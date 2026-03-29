import { ZodSchema, ZodError } from "zod";
import { logger } from "../lib/logger.js";
import {
  MessageEnvelopeSchema,
  DomMutationMessageSchema,
  HeartbeatMessageSchema,
  MessageType,
  type MessageEnvelope,
} from "../schemas/messages.js";

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: ZodError["issues"],
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export function validateEnvelope(raw: unknown): MessageEnvelope {
  const result = MessageEnvelopeSchema.safeParse(raw);
  if (!result.success) {
    logger.warn({ issues: result.error.issues }, "Envelope validation failed");
    throw new ValidationError("Invalid message envelope", result.error.issues);
  }
  return result.data;
}

export function validatePayload(envelope: MessageEnvelope): MessageEnvelope {
  switch (envelope.type) {
    case MessageType.DOM_MUTATION: {
      const result = DomMutationMessageSchema.safeParse(envelope);
      if (!result.success) {
        throw new ValidationError("Invalid DOM mutation payload", result.error.issues);
      }
      return result.data;
    }
    case MessageType.HEARTBEAT: {
      const result = HeartbeatMessageSchema.safeParse(envelope);
      if (!result.success) {
        throw new ValidationError("Invalid heartbeat payload", result.error.issues);
      }
      return result.data;
    }
    case MessageType.CANVAS_SNAPSHOT:
      return envelope;
    default:
      throw new ValidationError(`Unknown message type: ${(envelope as MessageEnvelope).type}`, []);
  }
}

export function parseAndValidate(json: string): MessageEnvelope {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new ValidationError("Invalid JSON", []);
  }
  const envelope = validateEnvelope(raw);
  return validatePayload(envelope);
}

export function validateSchema<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError("Schema validation failed", result.error.issues);
  }
  return result.data;
}
