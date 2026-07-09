import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional } from 'class-validator';

export class ReinstallVpsDto {
  @ApiPropertyOptional({ description: 'Vultr OS ID to reinstall with. Defaults to current OS if omitted.', example: 1743 })
  @IsInt()
  @IsOptional()
  osId?: number;
}
