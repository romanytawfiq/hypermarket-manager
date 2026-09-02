import mongoose, { type Model, type SchemaTimestampsConfig } from "mongoose";

/**
 * InventoryReservation (Phase 9).
 *
 * A server-authoritative hold on sellable stock for an online order. Created at
 * checkout so two customers cannot claim the last unit (architecture §17,
 * BR-APP-005). Every reservation is auditable and reversible:
 *
 *   RESERVED → FULFILLED   (stock consumed by the posted Sale at COD collection)
 *   RESERVED → RELEASED    (order cancelled / failed, stock returned)
 *
 * Available stock for an online checkout is computed as:
 *
 *   available = currentSellable - sum(active RESERVED reservations)   (>= 0)
 *
 * A reservation carries an `expiresAt` so stale holds created but never fulfilled
 * (e.g. a cancelled/abandoned checkout) can be expired by a cleanup job rather
 * than blocking inventory forever. A reservation is considered active only
 * while STATUS = RESERVED and NOT past its expiry.
 */
export const RESERVATION_STATUSES = [
  "RESERVED",
  "FULFILLED",
  "RELEASED",
  "EXPIRED",
] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export interface InventoryReservation {
  product: mongoose.Types.ObjectId;
  onlineOrder: mongoose.Types.ObjectId;
  /** Order number snapshot for auditing. */
  orderNumber: string;
  quantity: number;
  status: ReservationStatus;
  /** Client order token used to scope the reservation. */
  reservationKey: string;
  expiresAt: Date;
  /** When still RESERVED, the timestamp it was created (auditable). */
  reservedAt: Date;
  fulfilledAt?: Date;
  releasedAt?: Date;
}

export type InventoryReservationDocument = InventoryReservation &
  SchemaTimestampsConfig & { _id: mongoose.Types.ObjectId };

const inventoryReservationSchema = new mongoose.Schema<InventoryReservation>({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
    index: true,
  },
  onlineOrder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "OnlineOrder",
    required: true,
    index: true,
  },
  orderNumber: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 1 },
  status: {
    type: String,
    enum: RESERVATION_STATUSES,
    default: "RESERVED",
    index: true,
  },
  reservationKey: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true },
  reservedAt: { type: Date, default: () => new Date() },
  fulfilledAt: { type: Date },
  releasedAt: { type: Date },
});

// Active-reservation lookups per product (available-stock computation).
inventoryReservationSchema.index({ product: 1, status: 1, expiresAt: 1 });

export const InventoryReservationModel: Model<InventoryReservation> =
  (mongoose.models.InventoryReservation as Model<InventoryReservation> | undefined) ??
  mongoose.model<InventoryReservation>(
    "InventoryReservation",
    inventoryReservationSchema,
  );