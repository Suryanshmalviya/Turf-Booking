import { type Document, model, Schema, type Types } from 'mongoose';

import { AUTH_TOKEN_PURPOSES, type AuthTokenPurpose } from '../types/enums';

/**
 * Single-use tokens backing email verification and password recovery.
 *
 * Only a SHA-256 digest is persisted: the raw token exists in the request that
 * created it and in the delivered email, never in the database. Consumption is
 * recorded with `consumedAt` so a replayed token is rejected, and expired rows
 * are removed by the TTL index.
 */
export interface AuthTokenDocument extends Document {
  purpose: AuthTokenPurpose;
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  consumedAt?: Date;
  userAgent?: string;
  ipAddress?: string;
}

const authTokenSchema = new Schema<AuthTokenDocument>(
  {
    purpose: { type: String, enum: AUTH_TOKEN_PURPOSES, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date },
    userAgent: { type: String, maxlength: 500 },
    ipAddress: { type: String, maxlength: 100 },
  },
  { timestamps: true, versionKey: false }
);

authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
authTokenSchema.index({ userId: 1, purpose: 1, consumedAt: 1 });

export const AuthTokenModel = model<AuthTokenDocument>('AuthToken', authTokenSchema);