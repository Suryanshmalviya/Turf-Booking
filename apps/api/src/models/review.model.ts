import { type Document, model, Schema, type Types } from 'mongoose';

import { REVIEW_STATUSES, type ReviewStatus } from '../types/enums';

export interface ReviewReply {
  authorId: Types.ObjectId;
  body: string;
  createdAt: Date;
}

export interface ReviewDocument extends Document {
  venueId: Types.ObjectId;
  bookingId: Types.ObjectId;
  userId: Types.ObjectId;
  rating: number;
  title?: string;
  comment: string;
  surfaceRating?: number;
  serviceRating?: number;
  status: ReviewStatus;
  isVerifiedBooking: boolean;
  reply?: ReviewReply;
  moderatedBy?: Types.ObjectId;
  moderatedAt?: Date;
  moderationReason?: string;
}

/**
 * Customer review for a completed booking at a venue. One review per booking is
 * enforced by the unique index below, which makes review submission naturally
 * idempotent from the customer's point of view.
 */
const reviewSchema = new Schema<ReviewDocument>(
  {
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true, index: true },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: { validator: Number.isInteger, message: 'rating must be a whole number' },
    },
    title: { type: String, trim: true, maxlength: 120 },
    comment: { type: String, required: true, trim: true, minlength: 3, maxlength: 2000 },
    surfaceRating: { type: Number, min: 1, max: 5 },
    serviceRating: { type: Number, min: 1, max: 5 },
    status: { type: String, enum: REVIEW_STATUSES, default: 'published', required: true },
    isVerifiedBooking: { type: Boolean, default: false, required: true },
    reply: {
      authorId: { type: Schema.Types.ObjectId, ref: 'User' },
      body: { type: String, trim: true, maxlength: 1000 },
      createdAt: { type: Date },
    },
    moderatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    moderatedAt: { type: Date },
    moderationReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true, versionKey: false }
);

reviewSchema.index({ bookingId: 1, userId: 1 }, { unique: true });
reviewSchema.index({ venueId: 1, status: 1, createdAt: -1 });
reviewSchema.index({ venueId: 1, status: 1, rating: -1 });
reviewSchema.index({ userId: 1, createdAt: -1 });

export const ReviewModel = model<ReviewDocument>('Review', reviewSchema);
