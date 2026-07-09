import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { jsonToDb } from '../../common/json-field';
import { DeploymentStatus } from '../../common/prisma-enums';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class DeploymentsRepository {
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

  create(data: Prisma.DeploymentUncheckedCreateInput) {
    return this.prisma.deployment.create({
      data,
      include: { artifacts: true }
    });
  }

  listForProject(projectId: string, organizationId: string) {
    return this.prisma.deployment.findMany({
      where: {
        projectId,
        organizationId
      },
      include: { artifacts: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  findByIdForOrganization(deploymentId: string, organizationId: string) {
    return this.prisma.deployment.findFirst({
      where: {
        id: deploymentId,
        organizationId
      },
      include: { artifacts: true }
    });
  }

  listLogs(deploymentId: string, organizationId: string) {
    return this.prisma.deploymentLog.findMany({
      where: {
        deploymentId,
        organizationId
      },
      orderBy: { sequence: 'asc' }
    });
  }

  createLog(data: Omit<Prisma.DeploymentLogUncheckedCreateInput, 'metadata'> & {
    metadata: Prisma.InputJsonObject;
  }) {
    return this.prisma.deploymentLog.create({
      data: { ...data, metadata: jsonToDb(data.metadata) }
    });
  }

  updateStatus(
    deploymentId: string,
    data: {
      status: DeploymentStatus;
      finishedAt?: Date;
      errorCode?: string | null;
      errorMessage?: string | null;
    }
  ) {
    return this.prisma.deployment.update({
      where: { id: deploymentId },
      data
    });
  }

  updateProvider(
    deploymentId: string,
    data: {
      provider?: string | null;
      providerServiceId?: string | null;
      providerDeployId?: string | null;
      providerStatus?: string | null;
    }
  ) {
    return this.prisma.deployment.update({
      where: { id: deploymentId },
      data,
      include: { artifacts: true }
    });
  }

  getNextLogSequence(deploymentId: string) {
    return this.prisma.deploymentLog.count({
      where: { deploymentId }
    }).then((count) => count + 1);
  }
}
