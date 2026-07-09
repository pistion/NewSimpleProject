import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class SavePageContentDto {
  @ApiProperty({ description: 'Full JSON content tree of the page.' })
  @IsObject()
  content: Record<string, unknown>;
}
