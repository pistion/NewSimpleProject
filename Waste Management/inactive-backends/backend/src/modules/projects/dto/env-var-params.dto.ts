import { IsUUID } from 'class-validator';

export class EnvVarParamsDto {
  @IsUUID()
  projectId!: string;

  @IsUUID()
  envVarId!: string;
}
