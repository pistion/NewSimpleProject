import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class UpdateMemberDto {
  @ApiProperty({ example: 'developer' })
  @IsString()
  @MaxLength(64)
  roleKey: string;
}
