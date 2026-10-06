import { type Document, model, Schema, type Types } from 'mongoose';

export interface AvailabilityRuleDocument extends Document {
  venueId: Types.ObjectId;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  isActive: boolean;
}

const availabilityRuleSchema = new Schema<AvailabilityRuleDocument>(
  {
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true },
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    startMinute: { type: Number, required: true, min: 0, max: 1439 },
    endMinute: { type: Number, required: true, min: 1, max: 1440 },
    isActive: { type: Boolean, default: true, required: true },
  },
  { timestamps: true, versionKey: false }
);
availabilityRuleSchema.path('endMinute').validate(function (value: number) {
  return value > this.startMinute;
}, 'endMinute must be after startMinute');
availabilityRuleSchema.index({ venueId: 1, dayOfWeek: 1, isActive: 1, startMinute: 1 });

export const AvailabilityRuleModel = model<AvailabilityRuleDocument>(
  'AvailabilityRule',
  availabilityRuleSchema
);
