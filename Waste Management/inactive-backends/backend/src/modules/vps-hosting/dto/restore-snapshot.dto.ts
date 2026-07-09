import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RestoreSnapshotDto {
  @ApiProperty({ description: 'Vultr snapshot ID to restore the instance from', example: 'cb676a46-66fd-4dfb-b839-443f2e6c0b60' })
  @IsString()
  @IsNotEmpty()
  snapshotId!: string;
}
