import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProjectStatus } from '../../common/prisma-enums';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ProjectsRepository {
  constructor(private readonly prisma: PrismaService) {}

  listForOrganization(organizationId: string) {
    return this.prisma.project.findMany({
      where: {
        organizationId,
        deletedAt: null
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  findByIdForOrganization(projectId: string, organizationId: string) {
    return this.prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId,
        deletedAt: null
      }
    });
  }

  findBySlugForOrganization(slug: string, organizationId: string) {
    return this.prisma.project.findFirst({
      where: {
        slug,
        organizationId,
        deletedAt: null
      }
    });
  }

  create(data: Prisma.ProjectUncheckedCreateInput) {
    return this.prisma.project.create({ data });
  }

  updateById(projectId: string, data: Prisma.ProjectUncheckedUpdateInput) {
    return this.prisma.project.update({
      where: { id: projectId },
      data
    });
  }

  archive(projectId: string) {
    return this.prisma.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.archived,
        deletedAt: new Date()
      }
    });
  }

  listEnvVars(projectId: string, organizationId: string) {
    return this.prisma.projectEnvironmentVariable.findMany({
      where: {
        projectId,
        organizationId
      },
      orderBy: [
        { environment: 'asc' },
        { key: 'asc' }
      ]
    });
  }

  findEnvVarById(envVarId: string, projectId: string, organizationId: string) {
    return this.prisma.projectEnvironmentVariable.findFirst({
      where: {
        id: envVarId,
        projectId,
        organizationId
      }
    });
  }

  findEnvVarByKey(projectId: string, key: string, environment: 'production' | 'preview' | 'development') {
    return this.prisma.projectEnvironmentVariable.findUnique({
      where: {
        projectId_key_environment: {
          projectId,
          key,
          environment
        }
      }
    });
  }

  createEnvVar(data: Prisma.ProjectEnvironmentVariableUncheckedCreateInput) {
    return this.prisma.projectEnvironmentVariable.create({ data });
  }

  updateEnvVar(envVarId: string, data: Prisma.ProjectEnvironmentVariableUncheckedUpdateInput) {
    return this.prisma.projectEnvironmentVariable.update({
      where: { id: envVarId },
      data
    });
  }

  deleteEnvVar(envVarId: string) {
    return this.prisma.projectEnvironmentVariable.delete({
      where: { id: envVarId }
    });
  }
}
