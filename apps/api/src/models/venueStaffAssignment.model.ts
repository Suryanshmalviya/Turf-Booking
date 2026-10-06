import { type Document, model, Schema, type Types } from 'mongoose';

export interface VenueStaffAssignmentDocument extends Document {
  venueId: Types.ObjectId;
  userId: Types.ObjectId;
  active: boolean;
}

const venueStaffAssignmentSchema = new Schema<VenueStaffAssignmentDocument>(
  {
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    active: { type: Boolean, default: true, required: true },
  },
  { timestamps: true, versionKey: false }
);

venueStaffAssignmentSchema.index({ venueId: 1, userId: 1 }, { unique: true });
venueStaffAssignmentSchema.index({ userId: 1, active: 1, venueId: 1 });

export const VenueStaffAssignmentModel = model<VenueStaffAssignmentDocument>(
  'VenueStaffAssignment',
  venueStaffAssignmentSchema
);
