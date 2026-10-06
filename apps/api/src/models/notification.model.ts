import { type Document, model, Schema, type Types } from 'mongoose';

import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_STATUSES,
  NOTIFICATION_TYPES,
  type NotificationChannel,
  type NotificationStatus,
  type NotificationType,
} from '../types/enums';

export interface NotificationDocument extends Document {
  userId: Types.ObjectId;
  bookingId?: Types.ObjectId;
  type: NotificationType;
  channel: NotificationChannel;
  status: NotificationStatus;
  subject: string;
  body: string;
  sentAt?: Date;
  readAt?: Date;
  failureReason?: string;
  deduplicationKey: string;
  attemptCount: number;
  nextAttemptAt: Date;
}

const notificationSchema = new Schema<NotificationDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true, index: true },
    channel: { type: String, enum: NOTIFICATION_CHANNELS, required: true },
    status: {
      type: String,
      enum: NOTIFICATION_STATUSES,
      default: 'queued',
      required: true,
    },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 10000 },
    sentAt: { type: Date },
    readAt: { type: Date },
    failureReason: { type: String, trim: true, maxlength: 500 },
    deduplicationKey: { type: String, required: true, trim: true, maxlength: 200 },
    attemptCount: { type: Number, default: 0, required: true, min: 0 },
    nextAttemptAt: { type: Date, default: Date.now, required: true, index: true },
  },
  { timestamps: true, versionKey: false }
);
notificationSchema.index({ userId: 1, createdAt: -1, status: 1 });
notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ deduplicationKey: 1 }, { unique: true });

export const NotificationModel = model<NotificationDocument>('Notification', notificationSchema);
