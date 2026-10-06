import { type Document, model, Schema, type Types } from 'mongoose';

import {
  BOOKING_STATUSES,
  type BookingStatus,
  PAYMENT_STATUSES,
  type PaymentStatus,
} from '../types/enums';

export interface BookingDocument extends Document {
  userId: Types.ObjectId;
  venueId: Types.ObjectId;
  pitchId: Types.ObjectId;
  startAt: Date;
  endAt: Date;
  timezone: string;
  status: BookingStatus;
  holdExpiresAt?: Date;
  idempotencyKey?: string;
  publicReference: string;
  paymentStatus: PaymentStatus;
  amountMinor: number;
  currency: string;
  cancellationReason?: string;
  cancellationPolicy: { freeUntilMinutesBefore: number; refundPercent: number; capturedAt: Date };
  cancelledAt?: Date;
  cancelledBy?: Types.ObjectId;
}

const bookingSchema = new Schema<BookingDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true },
    pitchId: { type: Schema.Types.ObjectId, ref: 'Pitch', required: true, index: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    timezone: { type: String, required: true, match: /^[A-Za-z]+(?:\/[A-Za-z0-9_+.-]+)+$/ },
    status: { type: String, enum: BOOKING_STATUSES, default: 'pending', required: true },
    holdExpiresAt: { type: Date, index: true },
    idempotencyKey: { type: String, trim: true, maxlength: 200 },
    publicReference: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      uppercase: true,
      maxlength: 32,
    },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'pending', required: true },
    amountMinor: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isInteger, message: 'amountMinor must be an integer' },
    },
    currency: { type: String, required: true, uppercase: true, match: /^[A-Z]{3}$/ },
    cancellationReason: { type: String, trim: true, maxlength: 500 },
    cancellationPolicy: {
      freeUntilMinutesBefore: { type: Number, required: true, min: 0 },
      refundPercent: { type: Number, required: true, min: 0, max: 100 },
      capturedAt: { type: Date, required: true },
    },
    cancelledAt: { type: Date },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false }
);
bookingSchema.path('endAt').validate(function (value: Date) {
  return value > this.startAt;
}, 'endAt must be after startAt');
bookingSchema.index({ venueId: 1, startAt: 1, endAt: 1, status: 1 });
bookingSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true, sparse: true });
bookingSchema.index({ userId: 1, startAt: -1, status: 1 });

export const BookingModel = model<BookingDocument>('Booking', bookingSchema);
