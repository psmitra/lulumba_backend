import { ApiProperty } from '@nestjs/swagger';

export class AccessTokenResponseDto {
  @ApiProperty({ description: 'Send as `Authorization: Bearer <token>`' })
  accessToken: string;

  @ApiProperty({ description: 'Seconds until the access token expires' })
  expiresIn: number;
}
