import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateVpsDto {
  @IsString()
  @IsNotEmpty()
  region!: string;

  @IsString()
  @IsNotEmpty()
  plan!: string;

  @IsInt()
  osId!: number;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(64)
  label!: string;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  hostname?: string;

  @IsString()
  @IsOptional()
  sshKeyId?: string;

  @IsString()
  @IsOptional()
  userData?: string;
}
