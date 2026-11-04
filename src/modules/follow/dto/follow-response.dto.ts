import { ApiProperty } from '@nestjs/swagger';
import type { FollowEntity } from '@app-types/follow.types.js';
import { ProfileSummaryDto } from '@modules/profiles/dto/profile-summary.dto.js';

/** One relationship: `followerId` follows `followingId`. */
export class FollowResponseDto {
  @ApiProperty({ example: '2001' })
  followerId: string;

  @ApiProperty({ example: '2002' })
  followingId: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  static fromEntity(this: void, entity: FollowEntity): FollowResponseDto {
    const dto = new FollowResponseDto();
    dto.followerId = entity.followerId;
    dto.followingId = entity.followingId;
    dto.createdAt = entity.createdAt;
    return dto;
  }
}

/** One row of a followers / following list. */
export class FollowListItemDto {
  @ApiProperty({ type: ProfileSummaryDto })
  user: ProfileSummaryDto;

  @ApiProperty({ type: String, format: 'date-time' })
  followedAt: Date;

  @ApiProperty({ description: 'The caller follows this user' })
  isFollowing: boolean;

  @ApiProperty({ description: 'This user is the caller' })
  isMe: boolean;
}

export class FollowStatsResponseDto {
  @ApiProperty({ example: 120 })
  followersCount: number;

  @ApiProperty({ example: 87 })
  followingCount: number;

  @ApiProperty({ description: 'The caller follows this user' })
  isFollowing: boolean;

  @ApiProperty({ description: 'This user follows the caller' })
  isFollowedBy: boolean;
}
