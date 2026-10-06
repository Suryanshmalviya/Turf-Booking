import { type Document, model, Schema, type Types } from 'mongoose';

export interface AuditLogDocument extends Document {
  actorId?: Types.ObjectId;
  action: string;
  resourceType: string;
  resourceId?: Types.ObjectId;
  requestId?: string;
  metadata?: Record<string, string | number | boolean | null>;
  createdAt: Date;
}

const auditLogSchema = new Schema<AuditLogDocument>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    action: { type: String, required: true, trim: true, maxlength: 100 },
    resourceType: { type: String, required: true, trim: true, maxlength: 100 },
    resourceId: { type: Schema.Types.ObjectId },
    requestId: { type: String, trim: true, maxlength: 100, index: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);
auditLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });

export const AuditLogModel = model<AuditLogDocument>('AuditLog', auditLogSchema);
