import { type Document, model, Schema } from 'mongoose';

import {
  DEFAULT_USER_ROLE,
  USER_ROLES,
  USER_STATUSES,
  type UserRole,
  type UserStatus,
} from '../types/enums';

export interface UserDocument extends Document {
  email: string;
  passwordHash: string;
  displayName: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  emailVerifiedAt?: Date;
  passwordChangedAt?: Date;
  lastLoginAt?: Date;
}

const userSchema = new Schema<UserDocument>(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
      maxlength: 320,
    },
    passwordHash: { type: String, required: true, select: false },
    displayName: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 32 },
    role: {
      type: String,
      enum: USER_ROLES,
      default: DEFAULT_USER_ROLE,
      required: true,
      index: true,
    },
    status: { type: String, enum: USER_STATUSES, default: 'active', required: true, index: true },
    emailVerified: { type: Boolean, default: false, required: true, index: true },
    emailVerifiedAt: { type: Date },
    passwordChangedAt: { type: Date },
    lastLoginAt: { type: Date },
  },
  { timestamps: true, versionKey: false }
);

export const UserModel = model<UserDocument>('User', userSchema);
