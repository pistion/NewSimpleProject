import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class UpdateDomainDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @ApiPropertyOptional({ enum: ['pending_verification', 'verified', 'active', 'misconfigured', 'disabled'] })
  @IsOptional()
  @IsIn(['pending_verification', 'verified', 'active', 'misconfigured', 'disabled'])
  status?: 'pending_verification' | 'verified' | 'active' | 'misconfigured' | 'disabled';
}
