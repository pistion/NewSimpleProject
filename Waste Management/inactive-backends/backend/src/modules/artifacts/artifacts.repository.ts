import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ArtifactsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProjectForOrganization(projectId: string, organizationId: string) {
    return this.prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId,
        deletedAt: null
      }
    });
  }

  listForProject(projectId: string, organizationId: string) {
    return this.prisma.artifact.findMany({
      where: {
        projectId,
        organizationId
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  findByIdForOrganization(artifactId: string, organizationId: string) {
    return this.prisma.artifact.findFirst({
      where: {
        id: artifactId,
        organizationId
      },
      include: {
        deployment: true,
        project: true
      }
    });
  }
}
