import { type Document, model, Schema, type Types } from 'mongoose';

export interface BookingInventoryDocument extends Document {
  pitchId: Types.ObjectId;
  bookingId: Types.ObjectId;
  slotStartAt: Date;
  expiresAt: Date;
}

const bookingInventorySchema = new Schema<BookingInventoryDocument>(
  {
    pitchId: { type: Schema.Types.ObjectId, ref: 'Pitch', required: true },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    slotStartAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false }
);

bookingInventorySchema.index({ pitchId: 1, slotStartAt: 1 }, { unique: true });
bookingInventorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const BookingInventoryModel = model<BookingInventoryDocument>(
  'BookingInventory',
  bookingInventorySchema
);
