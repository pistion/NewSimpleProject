import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateEnvVarDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/^[A-Z_][A-Z0-9_]*$/)
  key!: string;

  @IsString()
  @MaxLength(4000)
  value!: string;

  @IsIn(['production', 'preview', 'development'])
  environment!: 'production' | 'preview' | 'development';
}
