import { IsUUID } from 'class-validator';

export class ArtifactParamsDto {
  @IsUUID()
  artifactId!: string;
}
