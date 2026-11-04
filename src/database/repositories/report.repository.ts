import type { ReportEntity } from '@app-types/report.types.js';
import { ReportStatus, ReportTargetType } from '@app-types/report.types.js';
import { Report } from '@database/schemas/report.schema.js';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  BaseCrudRepository,
  toPlainEntity,
  type LeanDocument,
} from './base.repository.js';

// Reports a moderator hasn't dealt with yet.
const OPEN = [ReportStatus.Received, ReportStatus.UnderReview];

@Injectable()
export class ReportRepository extends BaseCrudRepository<Report, ReportEntity> {
  constructor(@InjectModel(Report.name) model: Model<Report>) {
    super(model);
  }

  /** Posts and users the reporter has reported, so feeds can hide them. */
  async findReportedTargets(
    reporterId: string,
    limit: number,
  ): Promise<{ postIds: string[]; userIds: string[] }> {
    const reports = await this.findProjected<
      Pick<Report, 'targetType' | 'targetId'>
    >(
      {
        reporterId,
        targetType: { $in: [ReportTargetType.Post, ReportTargetType.User] },
      },
      { targetType: 1, targetId: 1 },
      { limit },
    );
    const of = (type: ReportTargetType) =>
      reports.filter((r) => r.targetType === type).map((r) => r.targetId);
    return {
      postIds: of(ReportTargetType.Post),
      userIds: of(ReportTargetType.User),
    };
  }

  /** Which of `postIds` have at least `minReports` open reports. */
  async findPostIdsWithOpenReports(
    postIds: string[],
    minReports: number,
  ): Promise<string[]> {
    if (postIds.length === 0) {
      return [];
    }
    const rows = await this.model.aggregate<{ _id: string }>([
      {
        $match: {
          targetType: ReportTargetType.Post,
          targetId: { $in: postIds },
          status: { $in: OPEN },
        },
      },
      { $group: { _id: '$targetId', count: { $sum: 1 } } },
      { $match: { count: { $gte: minReports } } },
    ]);
    return rows.map((row) => row._id);
  }

  protected toEntity(document: LeanDocument<Report>): ReportEntity {
    return toPlainEntity(document);
  }
}
