import mongoose, { type Model } from "mongoose";

/**
 * A server-side authentication session.
 *
 * The client cookie carries an opaque random token. Only the SHA-256 hash of
 * that token is stored here, so a database leak does not expose usable session
 * tokens. Sessions are revocable (deleted / expired server-side).
 */
export interface Session {
  /** SHA-256 hash of the opaque session token. */
  tokenHash: string;
  /** Reference to the authenticated User. */
  userId: mongoose.Types.ObjectId;
  /** ISO timestamp at which the session expires. */
  expiresAt: Date;
  createdAt: Date;
}

const sessionSchema = new mongoose.Schema<Session>({
  tokenHash: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 },
  },
  createdAt: { type: Date, default: Date.now },
});

export const SessionModel: Model<Session> =
  (mongoose.models.Session as Model<Session> | undefined) ??
  mongoose.model<Session>("Session", sessionSchema);
