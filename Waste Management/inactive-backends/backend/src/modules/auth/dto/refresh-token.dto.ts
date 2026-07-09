import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class RefreshTokenDto {
  @IsUUID()
  sessionId!: string;

  @IsString()
  @MinLength(32)
  @MaxLength(256)
  refreshToken!: string;
}
