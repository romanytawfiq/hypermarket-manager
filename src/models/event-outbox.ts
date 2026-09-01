import mongoose, { type Model, type SchemaTimestampsConfig } from "mongoose";

/**
 * Event outbox (Phase 7).
 *
 * A transactional outbox for business events (architecture §15). Events are
 * written *in the same transaction* as the domain change that produced them, so
 * the order mutation and its notification never diverge. A monotonic
 * `sequence` gives consumers a resume point, and a unique `eventId` makes each
 * event idempotent — consumers may safely deduplicate a redelivered event.
 *
 * The current consumer is the in-app SSE stream for the KDS
 * (`src/app/api/cafe/events/route.ts`). Events are business state, not UI
 * events; the server remains authoritative, and a reconnecting client always
 * reconciles against full server state on top of any deltas.
 */
export const CAFE_EVENT_TYPES = [
  "CAFE_ORDER_CREATED",
  "CAFE_ORDER_STATUS_CHANGED",
] as const;

export type CafeEventType = (typeof CAFE_EVENT_TYPES)[number];

export interface OutboxEvent {
  eventId: string; // unique uuid — idempotency key for consumers
  type: CafeEventType;
  aggregateType: string; // e.g. "cafe_order"
  aggregateId: string; // the CafeOrder id
  /** Domain version at the time the event was produced. */
  version: number;
  sequence: number; // monotonic; resume marker for the SSE stream
  payload: Record<string, unknown>;
  processedAt?: Date | null; // set once delivered to a consumer
}

export type OutboxEventDocument = OutboxEvent &
  SchemaTimestampsConfig & { _id: mongoose.Types.ObjectId };

const outboxEventSchema = new mongoose.Schema<OutboxEvent>(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    type: { type: String, enum: CAFE_EVENT_TYPES, required: true },
    aggregateType: { type: String, required: true },
    aggregateId: { type: String, required: true, index: true },
    version: { type: Number, required: true, default: 0 },
    sequence: { type: Number, required: true, unique: true, index: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const EventOutboxModel: Model<OutboxEvent> =
  (mongoose.models.EventOutbox as Model<OutboxEvent> | undefined) ??
  mongoose.model<OutboxEvent>("EventOutbox", outboxEventSchema);
