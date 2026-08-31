import { dbConnect } from "@/lib/db";
import { AuditLogModel } from "@/models/audit-log";

/**
 * Audit foundation for identity/authorization events.
 *
 * Auditing is best-effort and must never break the primary operation it
 * accompanies. Records never contain passwords, password hashes, or session
 * secrets.
 */

interface AuditInput {
  actorId?: string | null;
  actorUsername?: string | null;
  action: string;
  entity: string;
  entityId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/** Appends an audit record. Never throws. */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await dbConnect();
    await AuditLogModel.create({
      actorId: input.actorId ?? null,
      actorUsername: input.actorUsername ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      before: input.before,
      after: input.after,
      metadata: input.metadata,
    });
  } catch (error) {
    // Audit must never break the primary operation. Log technical context
    // without leaking secrets.
    console.error("[audit] failed to write audit record", {
      action: input.action,
      entity: input.entity,
      error,
    });
  }
}
