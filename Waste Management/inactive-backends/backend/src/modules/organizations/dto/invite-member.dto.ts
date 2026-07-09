import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class InviteMemberDto {
  @ApiProperty({ example: 'alice@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: 'developer', description: 'Role key to assign on acceptance.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  roleKey?: string;
}
