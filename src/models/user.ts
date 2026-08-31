import mongoose, { type Model, type SchemaTimestampsConfig } from "mongoose";

export interface User {
  /** Unique staff login identifier (the authentication name). */
  username: string;
  /** bcrypt hash of the user's password. Never stored in plaintext. */
  passwordHash: string;
  /** Reference to the assigned Role document. */
  role: mongoose.Types.ObjectId;
  /** Human-readable display name. */
  name: string;
  /** Whether the account may authenticate / perform operations. */
  active: boolean;
  /** Whether this is the seeded system owner (non-deletable, protected). */
  isOwner?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = User & SchemaTimestampsConfig & { _id: mongoose.Types.ObjectId };

const userSchema = new mongoose.Schema<User>(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    passwordHash: { type: String, required: true },
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    active: { type: Boolean, default: true },
    isOwner: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const UserModel: Model<User> =
  (mongoose.models.User as Model<User> | undefined) ??
  mongoose.model<User>("User", userSchema);
