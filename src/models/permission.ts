import mongoose, { type Model, type SchemaTimestampsConfig } from "mongoose";
import type { PermissionId } from "@/lib/access-control/permissions";

/**
 * The authoritative registry of permissions.
 *
 * Seeded idempotently from the permission catalog. Roles reference permission
 * identifiers; this collection exists so the full set of permissions can be
 * listed, documented, and extended cleanly in the management UI.
 */
export interface Permission {
  /** Stable identifier, e.g. "users.create". */
  key: PermissionId;
  /** Arabic human-readable label. */
  label: string;
  /** Short Arabic description. */
  description?: string;
  /** Feature scope, e.g. "users". */
  scope: string;
}

export type PermissionDocument = Permission &
  SchemaTimestampsConfig & { _id: mongoose.Types.ObjectId };

const permissionSchema = new mongoose.Schema<Permission>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    label: { type: String, required: true },
    description: { type: String },
    scope: { type: String, required: true },
  },
  { timestamps: true },
);

export const PermissionModel: Model<Permission> =
  (mongoose.models.Permission as Model<Permission> | undefined) ??
  mongoose.model<Permission>("Permission", permissionSchema);
