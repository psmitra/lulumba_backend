import type { Entity } from '@database/repositories/base.repository.js';
import type { HydratedDocument } from 'mongoose';
import type { Report } from '@database/schemas/report.schema.js';

export enum ReportTargetType {
  Post = 'post',
  User = 'user',
  Comment = 'comment',
}

export enum ReportReason {
  Spam = 'spam',
  Harassment = 'harassment',
  HateSpeech = 'hate_speech',
  Violence = 'violence',
  Nudity = 'nudity',
  Misinformation = 'misinformation',
  Copyright = 'copyright',
  Other = 'other',
}

export enum ReportStatus {
  Received = 'received',
  UnderReview = 'under_review',
  Resolved = 'resolved',
  Dismissed = 'dismissed',
}

export type ReportDocument = HydratedDocument<Report>;

/** What ReportRepository returns: plain object, `id` as a string. */
export type ReportEntity = Entity<Report>;
