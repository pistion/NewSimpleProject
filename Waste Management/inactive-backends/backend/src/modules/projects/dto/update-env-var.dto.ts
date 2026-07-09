import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateEnvVarDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  value?: string;
}
