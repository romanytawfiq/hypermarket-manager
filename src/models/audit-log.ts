import mongoose, { type Model } from "mongoose";

/**
 * Append-only audit log for sensitive / important actions.
 *
 * Stores a snapshot of who performed the action, on which entity, and (where
 * helpful) the before/after state, plus free-form metadata. Audit records must
 * never contain passwords, password hashes, or session secrets.
 */
export interface AuditLog {
  /** Id of the acting user, or null for system/seeded actions. */
  actorId: mongoose.Types.ObjectId | null;
  /** Snapshot of the actor's username for readable logs. */
  actorUsername: string | null;
  /** Stable action identifier, e.g. "user.created". */
  action: string;
  /** Entity type, e.g. "user". */
  entity: string;
  /** Id of the affected entity, when applicable. */
  entityId?: string;
  /** Optional before/after snapshot for mutations. */
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  /** Free-form metadata (never secrets). */
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const auditLogSchema = new mongoose.Schema<AuditLog>(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    actorUsername: { type: String, default: null },
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: { type: String },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ entity: 1, entityId: 1 });

export const AuditLogModel: Model<AuditLog> =
  (mongoose.models.AuditLog as Model<AuditLog> | undefined) ??
  mongoose.model<AuditLog>("AuditLog", auditLogSchema);
