import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** `:userId` route param: a GhanaWorks user id (Profile.externalUserId). */
export class UserIdParamDto {
  @ApiProperty({ description: 'GhanaWorks user id', example: '2001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  userId: string;
}
