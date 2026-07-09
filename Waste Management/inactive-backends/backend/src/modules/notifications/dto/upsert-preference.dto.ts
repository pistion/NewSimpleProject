import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsString, MaxLength } from 'class-validator';

export class UpsertPreferenceDto {
  @ApiProperty({ example: 'deployment.completed' })
  @IsString()
  @MaxLength(128)
  eventType: string;

  @ApiProperty({ example: 'in_app', enum: ['in_app', 'email', 'slack', 'webhook'] })
  @IsIn(['in_app', 'email', 'slack', 'webhook'])
  channel: string;

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;
}
