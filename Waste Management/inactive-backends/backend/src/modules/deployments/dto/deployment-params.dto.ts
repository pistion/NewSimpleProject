import { IsUUID } from 'class-validator';

export class DeploymentParamsDto {
  @IsUUID()
  deploymentId!: string;
}
