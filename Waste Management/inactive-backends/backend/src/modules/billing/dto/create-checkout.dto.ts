import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateCheckoutDto {
  @ApiProperty({ example: 'pro', description: 'Plan key to subscribe to.' })
  @IsString()
  planKey: string;

  @ApiPropertyOptional({ example: 'month', enum: ['month', 'year'] })
  @IsOptional()
  @IsIn(['month', 'year'])
  interval?: 'month' | 'year';
}
