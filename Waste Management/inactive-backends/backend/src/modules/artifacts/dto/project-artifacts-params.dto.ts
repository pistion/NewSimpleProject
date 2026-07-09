import { IsUUID } from 'class-validator';

export class ProjectArtifactsParamsDto {
  @IsUUID()
  projectId!: string;
}
