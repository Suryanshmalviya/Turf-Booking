import { type Document, model, Schema, type Types } from 'mongoose';

import { REFUND_STATUSES, type RefundStatus } from '../types/enums';

export interface RefundDocument extends Document {
  bookingId: Types.ObjectId;
  paymentAttemptId: Types.ObjectId;
  amountMinor: number;
  currency: string;
  status: RefundStatus;
  providerRefundId?: string;
  reason?: string;
  idempotencyKey: string;
  failureReason?: string;
}

const refundSchema = new Schema<RefundDocument>(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    paymentAttemptId: { type: Schema.Types.ObjectId, ref: 'PaymentAttempt', required: true },
    amountMinor: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: 'amountMinor must be an integer' },
    },
    currency: { type: String, required: true, uppercase: true, match: /^[A-Z]{3}$/ },
    status: { type: String, enum: REFUND_STATUSES, default: 'requested', required: true },
    providerRefundId: { type: String, trim: true, maxlength: 200 },
    reason: { type: String, trim: true, maxlength: 500 },
    idempotencyKey: { type: String, required: true, trim: true, maxlength: 200 },
    failureReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true, versionKey: false }
);
refundSchema.index({ providerRefundId: 1 }, { unique: true, sparse: true });
refundSchema.index({ bookingId: 1, idempotencyKey: 1 }, { unique: true });

export const RefundModel = model<RefundDocument>('Refund', refundSchema);
