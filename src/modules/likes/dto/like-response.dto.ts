import { ProfileSummaryDto } from '@modules/profiles/dto/profile-summary.dto.js';
import { ApiProperty } from '@nestjs/swagger';

export class LikeStateDto {
  @ApiProperty()
  liked: boolean;

  @ApiProperty({ example: 12 })
  likesCount: number;
}

/** One user in a post's likes list. */
export class LikerDto {
  @ApiProperty({ type: ProfileSummaryDto })
  user: ProfileSummaryDto;

  @ApiProperty({ type: String, format: 'date-time' })
  likedAt: Date;

  @ApiProperty({ description: 'The caller follows this user' })
  isFollowing: boolean;

  @ApiProperty({ description: 'This user is the caller' })
  isMe: boolean;
}
