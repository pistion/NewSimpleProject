import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateSnapshotDto {
  @ApiProperty({ description: 'Human-readable label for the snapshot', example: 'pre-upgrade-backup', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  description!: string;
}
