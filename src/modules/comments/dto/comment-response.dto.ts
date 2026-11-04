import { ProfileSummaryDto } from '@modules/profiles/dto/profile-summary.dto.js';
import { ApiProperty } from '@nestjs/swagger';

export class CommentResponseDto {
  @ApiProperty({ example: '665f1c2e8b3a4d0012ab34cd' })
  id: string;

  @ApiProperty({ example: '665f1c2e8b3a4d0012ab34ce' })
  postId: string;

  @ApiProperty({
    type: ProfileSummaryDto,
    nullable: true,
    description: 'Null on a deleted comment kept for its replies',
  })
  user: ProfileSummaryDto | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Null on a deleted comment kept for its replies',
  })
  body: string | null;

  @ApiProperty({ description: 'Fetch them from GET /comments/{id}/replies' })
  repliesCount: number;

  @ApiProperty({
    description: 'Deleted, but shown as "[deleted]" because it has replies',
  })
  isDeleted: boolean;

  @ApiProperty()
  isEdited: boolean;

  @ApiProperty({ description: 'The caller wrote it' })
  isMine: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;
}

export class ReplyResponseDto {
  @ApiProperty({ example: '665f1c2e8b3a4d0012ab34cf' })
  id: string;

  @ApiProperty({ example: '665f1c2e8b3a4d0012ab34cd' })
  commentId: string;

  @ApiProperty({ example: '665f1c2e8b3a4d0012ab34ce' })
  postId: string;

  @ApiProperty({ type: ProfileSummaryDto })
  user: ProfileSummaryDto;

  @ApiProperty()
  body: string;

  @ApiProperty()
  isEdited: boolean;

  @ApiProperty({ description: 'The caller wrote it' })
  isMine: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;
}

export class DeleteCommentResponseDto {
  @ApiProperty({ enum: [true] })
  deleted: true;
}
