import { IsUUID } from 'class-validator';

export class ProjectDeploymentParamsDto {
  @IsUUID()
  projectId!: string;
}
