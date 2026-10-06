import { type Document, model, Schema, type Types } from 'mongoose';

export interface AuthSessionDocument extends Document {
  sessionId: string;
  userId: Types.ObjectId;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt?: Date;
  userAgent?: string;
  ipAddress?: string;
}

const authSessionSchema = new Schema<AuthSessionDocument>(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    refreshTokenHash: { type: String, required: true, unique: true, select: false },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    userAgent: { type: String, maxlength: 500 },
    ipAddress: { type: String, maxlength: 100 },
  },
  { timestamps: true, versionKey: false }
);

authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
authSessionSchema.index({ userId: 1, revokedAt: 1, expiresAt: 1 });

export const AuthSessionModel = model<AuthSessionDocument>('AuthSession', authSessionSchema);
