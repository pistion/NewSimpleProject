import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class MemberParamsDto {
  @ApiProperty()
  @IsUUID()
  memberId: string;
}
