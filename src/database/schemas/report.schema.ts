import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  ReportReason,
  ReportStatus,
  ReportTargetType,
} from '../types/report.types.js';

/** A user's report about a post, user or comment, stored for later review. */
@Schema({ collection: 'reports', timestamps: true })
export class Report {
  // External auth system's user id.
  @Prop({ type: String, required: true, immutable: true, trim: true })
  reporterId: string;

  @Prop({
    type: String,
    enum: Object.values(ReportTargetType),
    required: true,
    immutable: true,
  })
  targetType: ReportTargetType;

  // Post/comment ObjectId as a string, or an external user id.
  @Prop({ type: String, required: true, immutable: true, trim: true })
  targetId: string;

  @Prop({
    type: String,
    enum: Object.values(ReportReason),
    required: true,
    immutable: true,
  })
  reason: ReportReason;

  @Prop({ type: String, trim: true, maxlength: 1000, immutable: true })
  details?: string;

  @Prop({
    type: String,
    enum: Object.values(ReportStatus),
    default: ReportStatus.Received,
  })
  status: ReportStatus;

  // Maintained by `timestamps: true`; declared for typing only.
  createdAt: Date;
  updatedAt: Date;
}

export const ReportSchema = SchemaFactory.createForClass(Report);

// One report per user per target, to limit report spam.
ReportSchema.index(
  { reporterId: 1, targetType: 1, targetId: 1 },
  { unique: true },
);
// Everything reported about a target.
ReportSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
// Review queue.
ReportSchema.index({ status: 1, createdAt: 1 });
