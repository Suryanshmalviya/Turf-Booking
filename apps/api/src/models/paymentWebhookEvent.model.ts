import { type Document, model, Schema } from 'mongoose';

export interface PaymentWebhookEventDocument extends Document {
  provider: string;
  eventId: string;
  eventType: string;
  receivedAt: Date;
  processedAt?: Date;
  processingError?: string;
}

const paymentWebhookEventSchema = new Schema<PaymentWebhookEventDocument>(
  {
    provider: { type: String, required: true, trim: true, maxlength: 40 },
    eventId: { type: String, required: true, trim: true, maxlength: 200 },
    eventType: { type: String, required: true, trim: true, maxlength: 100 },
    receivedAt: { type: Date, required: true, default: Date.now },
    processedAt: { type: Date },
    processingError: { type: String, maxlength: 1000 },
  },
  { timestamps: true, versionKey: false }
);

paymentWebhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
paymentWebhookEventSchema.index({ processedAt: 1, receivedAt: 1 });

export const PaymentWebhookEventModel = model<PaymentWebhookEventDocument>(
  'PaymentWebhookEvent',
  paymentWebhookEventSchema
);
