import { type Document, model, Schema, type Types } from 'mongoose';

import { PRICING_UNITS, type PricingUnit } from '../types/enums';

export interface PriceRuleDocument extends Document {
  venueId: Types.ObjectId;
  dayOfWeek?: number;
  startMinute?: number;
  endMinute?: number;
  startDate?: Date;
  endDate?: Date;
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
  pricingUnit: PricingUnit;
  amountMinor: number;
  currency: string;
  priority: number;
  isActive: boolean;
}

const priceRuleSchema = new Schema<PriceRuleDocument>(
  {
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true },
    dayOfWeek: { type: Number, min: 0, max: 6 },
    startMinute: { type: Number, min: 0, max: 1439 },
    endMinute: { type: Number, min: 1, max: 1440 },
    startDate: { type: Date },
    endDate: { type: Date },
    minDurationMinutes: { type: Number, min: 1, max: 1440 },
    maxDurationMinutes: { type: Number, min: 1, max: 1440 },
    pricingUnit: { type: String, enum: PRICING_UNITS, default: 'booking', required: true },
    amountMinor: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isInteger, message: 'amountMinor must be an integer' },
    },
    currency: { type: String, required: true, uppercase: true, match: /^[A-Z]{3}$/ },
    priority: { type: Number, default: 0, required: true, min: 0 },
    isActive: { type: Boolean, default: true, required: true },
  },
  { timestamps: true, versionKey: false }
);
priceRuleSchema.index({ venueId: 1, isActive: 1, dayOfWeek: 1, startMinute: 1, priority: -1 });
priceRuleSchema.path('endDate').validate(function (value: Date | undefined) {
  return value === undefined || (this.startDate !== undefined && value >= this.startDate);
}, 'endDate must be on or after startDate');
priceRuleSchema.path('maxDurationMinutes').validate(function (value: number | undefined) {
  return (
    value === undefined ||
    (this.minDurationMinutes !== undefined && value >= this.minDurationMinutes)
  );
}, 'maxDurationMinutes must be at least minDurationMinutes');

export const PriceRuleModel = model<PriceRuleDocument>('PriceRule', priceRuleSchema);
