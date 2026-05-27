import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

const SCHEDULE_TYPES = ['daily', 'weekly', 'monthly', 'daily_alt_even', 'daily_alt_odd'] as const;

export class SetBackupScheduleDto {
  @ApiProperty({
    description: 'Backup frequency type',
    enum: SCHEDULE_TYPES,
    example: 'daily',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(SCHEDULE_TYPES)
  type!: string;

  @ApiPropertyOptional({ description: 'Hour of day (UTC, 0–23) to run the backup', example: 3, minimum: 0, maximum: 23 })
  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(23)
  hour?: number;

  @ApiPropertyOptional({ description: 'Day of week (0 = Sunday … 6 = Saturday) for weekly backups', example: 1, minimum: 0, maximum: 6 })
  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(6)
  dow?: number;

  @ApiPropertyOptional({ description: 'Day of month (1–28) for monthly backups', example: 1, minimum: 1, maximum: 28 })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(28)
  dom?: number;
}
