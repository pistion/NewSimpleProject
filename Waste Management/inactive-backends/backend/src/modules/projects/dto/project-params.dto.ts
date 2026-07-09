import { IsUUID } from 'class-validator';

export class ProjectParamsDto {
  @IsUUID()
  projectId!: string;
}
