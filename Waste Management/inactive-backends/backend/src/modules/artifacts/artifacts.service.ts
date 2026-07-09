import { Injectable, NotFoundException } from '@nestjs/common';
import { ArtifactsRepository } from './artifacts.repository';

interface ActorContext {
  organizationId: string;
}

@Injectable()
export class ArtifactsService {
  constructor(private readonly artifactsRepository: ArtifactsRepository) {}

  async listForProject(projectId: string, context: ActorContext) {
    await this.getProjectOrThrow(projectId, context.organizationId);
    return this.artifactsRepository.listForProject(projectId, context.organizationId);
  }

  async get(artifactId: string, context: ActorContext) {
    const artifact = await this.artifactsRepository.findByIdForOrganization(artifactId, context.organizationId);
    if (!artifact) {
      throw new NotFoundException('Artifact not found.');
    }

    return artifact;
  }

  private async getProjectOrThrow(projectId: string, organizationId: string) {
    const project = await this.artifactsRepository.findProjectForOrganization(projectId, organizationId);
    if (!project) {
      throw new NotFoundException('Project not found.');
    }

    return project;
  }
}
