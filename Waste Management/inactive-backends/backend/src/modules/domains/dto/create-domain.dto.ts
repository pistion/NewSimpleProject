import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class CreateDomainDto {
  @ApiProperty({ example: 'mysite.com' })
  @IsString()
  @MaxLength(253)
  @Matches(/^(?!-)(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,63}$/, {
    message: 'hostname must be a valid domain name'
  })
  hostname: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectId?: string;
}
