import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  framework?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  repositoryProvider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  repositoryOwner?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  repositoryName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  productionBranch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  rootDirectory?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  buildCommand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  outputDirectory?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  installCommand?: string;
}
