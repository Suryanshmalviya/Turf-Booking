import { type Document, model, Schema, type Types } from 'mongoose';

import { VENUE_STATUSES, type VenueStatus } from '../types/enums';

export interface VenueDocument extends Document {
  ownerId: Types.ObjectId;
  name: string;
  description?: string;
  timezone: string;
  currency: string;
  address: { line1: string; city: string; region: string; postalCode: string; country: string };
  location?: { type: 'Point'; coordinates: [number, number] };
  status: VenueStatus;
  images: Array<{
    key: string;
    url?: string;
    mimeType: string;
    sizeBytes: number;
    width?: number;
    height?: number;
    altText?: string;
  }>;
  reviewReason?: string;
  reviewedAt?: Date;
  reviewedBy?: Types.ObjectId;
}

const venueSchema = new Schema<VenueDocument>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 4000 },
    timezone: {
      type: String,
      required: true,
      trim: true,
      match: /^[A-Za-z]+(?:\/[A-Za-z0-9_+.-]+)+$/,
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      match: /^[A-Z]{3}$/,
      default: 'INR',
    },
    address: {
      line1: { type: String, required: true, trim: true, maxlength: 200 },
      city: { type: String, required: true, trim: true, maxlength: 100 },
      region: { type: String, required: true, trim: true, maxlength: 100 },
      postalCode: { type: String, required: true, trim: true, maxlength: 20 },
      country: { type: String, required: true, trim: true, length: 2, uppercase: true },
    },
    location: { type: { type: String, enum: ['Point'] }, coordinates: { type: [Number] } },
    status: { type: String, enum: VENUE_STATUSES, default: 'draft', required: true, index: true },
    images: [
      {
        key: { type: String, required: true, trim: true, maxlength: 500 },
        url: { type: String, trim: true, maxlength: 2000 },
        mimeType: { type: String, required: true, match: /^image\/(jpeg|png|webp)$/ },
        sizeBytes: { type: Number, required: true, min: 1, max: 10 * 1024 * 1024 },
        width: { type: Number, min: 1, max: 10000 },
        height: { type: Number, min: 1, max: 10000 },
        altText: { type: String, trim: true, maxlength: 200 },
      },
    ],
    reviewReason: { type: String, trim: true, maxlength: 1000 },
    reviewedAt: { type: Date },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false }
);
venueSchema.index({ location: '2dsphere' });
venueSchema.index({ status: 1, name: 1 });

export const VenueModel = model<VenueDocument>('Venue', venueSchema);
