import { type Document, model, Schema, type Types } from 'mongoose';

export interface PitchDocument extends Document {
  venueId: Types.ObjectId;
  name: string;
  description?: string;
  surface?: string;
  indoor: boolean;
  isActive: boolean;
  sortOrder: number;
  slotIncrementMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
}

const pitchSchema = new Schema<PitchDocument>(
  {
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true, index: true },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 1000 },
    surface: { type: String, trim: true, maxlength: 80 },
    indoor: { type: Boolean, default: false, required: true },
    isActive: { type: Boolean, default: true, required: true },
    sortOrder: { type: Number, default: 0, min: 0, required: true },
    slotIncrementMinutes: { type: Number, default: 30, min: 1, max: 240, required: true },
    bufferBeforeMinutes: { type: Number, default: 0, min: 0, max: 120, required: true },
    bufferAfterMinutes: { type: Number, default: 0, min: 0, max: 120, required: true },
  },
  { timestamps: true, versionKey: false }
);

pitchSchema.index({ venueId: 1, isActive: 1, sortOrder: 1 });
pitchSchema.index({ venueId: 1, name: 1 }, { unique: true });

export const PitchModel = model<PitchDocument>('Pitch', pitchSchema);
