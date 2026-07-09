import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ResizeVpsDto {
  @ApiProperty({ description: 'Vultr plan ID to resize the VPS to (e.g. vc2-2c-4gb)', example: 'vc2-2c-4gb' })
  @IsString()
  @IsNotEmpty()
  plan!: string;
}
