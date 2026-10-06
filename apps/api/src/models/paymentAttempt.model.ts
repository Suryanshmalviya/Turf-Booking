import { type Document, model, Schema, type Types } from 'mongoose';

import { PAYMENT_STATUSES, type PaymentStatus } from '../types/enums';

export interface PaymentAttemptDocument extends Document {
  bookingId: Types.ObjectId;
  provider: string;
  providerPaymentId?: string;
  idempotencyKey: string;
  status: PaymentStatus;
  amountMinor: number;
  currency: string;
  failureCode?: string;
  uncertainReason?: string;
  attemptedAt: Date;
}

const paymentAttemptSchema = new Schema<PaymentAttemptDocument>(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    provider: { type: String, required: true, trim: true, maxlength: 40 },
    providerPaymentId: { type: String, trim: true, maxlength: 200 },
    idempotencyKey: { type: String, required: true, trim: true, maxlength: 200 },
    status: { type: String, enum: PAYMENT_STATUSES, required: true },
    amountMinor: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isInteger, message: 'amountMinor must be an integer' },
    },
    currency: { type: String, required: true, uppercase: true, match: /^[A-Z]{3}$/ },
    failureCode: { type: String, trim: true, maxlength: 100 },
    uncertainReason: { type: String, trim: true, maxlength: 500 },
    attemptedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true, versionKey: false }
);
paymentAttemptSchema.index({ provider: 1, providerPaymentId: 1 }, { unique: true, sparse: true });
paymentAttemptSchema.index({ bookingId: 1, idempotencyKey: 1 }, { unique: true });
paymentAttemptSchema.index({ status: 1, updatedAt: 1 });

export const PaymentAttemptModel = model<PaymentAttemptDocument>(
  'PaymentAttempt',
  paymentAttemptSchema
);
