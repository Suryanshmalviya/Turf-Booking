import { type Document, model, Schema, type Types } from 'mongoose';

import { AVAILABILITY_EXCEPTION_KINDS, type AvailabilityExceptionKind } from '../types/enums';

export interface AvailabilityExceptionDocument extends Document {
  venueId: Types.ObjectId;
  date: Date;
  kind: AvailabilityExceptionKind;
  isAvailable: boolean;
  startMinute?: number;
  endMinute?: number;
  reason?: string;
}

const availabilityExceptionSchema = new Schema<AvailabilityExceptionDocument>(
  {
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true },
    date: { type: Date, required: true },
    kind: { type: String, enum: AVAILABILITY_EXCEPTION_KINDS, required: true },
    isAvailable: { type: Boolean, required: true },
    startMinute: { type: Number, min: 0, max: 1439 },
    endMinute: { type: Number, min: 1, max: 1440 },
    reason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true, versionKey: false }
);
availabilityExceptionSchema.path('endMinute').validate(function (value: number | undefined) {
  return value === undefined || (this.startMinute !== undefined && value > this.startMinute);
}, 'endMinute must be after startMinute');
availabilityExceptionSchema.index({ venueId: 1, date: 1, startMinute: 1 });

export const AvailabilityExceptionModel = model<AvailabilityExceptionDocument>(
  'AvailabilityException',
  availabilityExceptionSchema
);
