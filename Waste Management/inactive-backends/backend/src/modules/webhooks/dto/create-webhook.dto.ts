import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateWebhookDto {
  @ApiProperty({ example: 'https://my-server.com/hooks/glondia' })
  @IsUrl({ require_tld: false })
  url: string;

  @ApiPropertyOptional({ example: ['deployment.completed', 'domain.verified'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];

  @ApiPropertyOptional({ description: 'Optional HMAC secret for request signing.' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  secret?: string;
}
