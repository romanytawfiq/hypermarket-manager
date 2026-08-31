import mongoose, { type Model, type SchemaTimestampsConfig } from "mongoose";
import type { RoleId } from "@/lib/access-control/roles";
import type { PermissionId } from "@/lib/access-control/permissions";

export interface Role {
  /** Stable identifier, e.g. "MANAGER". */
  name: RoleId;
  /** Arabic label, editable by role managers. */
  label: string;
  /** Permission identifiers granted to this role. */
  permissions: PermissionId[];
  /** Whether this is a seeded system role that cannot be deleted. */
  system: boolean;
}

export type RoleDocument = Role & SchemaTimestampsConfig & { _id: mongoose.Types.ObjectId };

const roleSchema = new mongoose.Schema<Role>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    label: { type: String, required: true },
    permissions: { type: [String], default: [] },
    system: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const RoleModel: Model<Role> =
  (mongoose.models.Role as Model<Role> | undefined) ??
  mongoose.model<Role>("Role", roleSchema);
