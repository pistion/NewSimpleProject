import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDeploymentDto {
  @IsIn(['production', 'preview'])
  environment!: 'production' | 'preview';

  @IsOptional()
  @IsIn(['git', 'builder', 'manual'])
  source?: 'git' | 'builder' | 'manual';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  commitSha?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  commitMessage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  branch?: string;
}
