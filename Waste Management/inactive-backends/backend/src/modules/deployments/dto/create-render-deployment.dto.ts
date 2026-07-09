import { IsArray, IsIn, IsOptional, IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class RenderEnvVarDto {
  @IsString()
  @MaxLength(120)
  key!: string;

  @IsString()
  value!: string;
}

export class CreateRenderDeploymentDto {
  @IsOptional()
  @IsString()
  siteId?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsString()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsIn(['static_site', 'web_service'])
  serviceType?: 'static_site' | 'web_service';

  @IsUrl({ require_tld: false })
  repoUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  branch?: string;

  @IsOptional()
  @IsString()
  rootDirectory?: string;

  @IsOptional()
  @IsString()
  buildCommand?: string;

  @IsOptional()
  @IsString()
  startCommand?: string;

  @IsOptional()
  @IsString()
  outputDirectory?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RenderEnvVarDto)
  environmentVariables?: RenderEnvVarDto[];

  @IsOptional()
  @IsString()
  sourceReference?: string;
}
