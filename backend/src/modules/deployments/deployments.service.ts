import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { jsonToDb } from '../../common/json-field';
import { DeploymentEnvironment, DeploymentSource, DeploymentStatus } from '../../common/prisma-enums';
import { PrismaService } from '../../database/prisma.service';
import { RenderService } from '../../integrations/render/render.service';
import { DeploymentQueueService } from '../../workers/queues/deployment-queue.service';
import { CreateDeploymentDto } from './dto/create-deployment.dto';
import { DeploymentsRepository } from './deployments.repository';

interface ActorContext {
  userId: string;
  organizationId: string;
}

@Injectable()
export class DeploymentsService {
  constructor(
    private readonly deploymentsRepository: DeploymentsRepository,
    private readonly deploymentQueue: DeploymentQueueService,
    private readonly prisma: PrismaService,
    private readonly render: RenderService
  ) {}

  async listForProject(projectId: string, context: ActorContext) {
    await this.getProjectOrThrow(projectId, context.organizationId);
    return this.deploymentsRepository.listForProject(projectId, context.organizationId);
  }

  async create(projectId: string, dto: CreateDeploymentDto, context: ActorContext) {
    const project = await this.getProjectOrThrow(projectId, context.organizationId);
    const deployment = await this.deploymentsRepository.create({
      organizationId: context.organizationId,
      projectId: project.id,
      environment: dto.environment as DeploymentEnvironment,
      source: (dto.source ?? 'manual') as DeploymentSource,
      commitSha: dto.commitSha,
      commitMessage: dto.commitMessage,
      branch: dto.branch,
      triggeredByUserId: context.userId
    });

    const setupTasks: Array<Promise<unknown>> = [
      this.deploymentsRepository.createLog({
        deploymentId: deployment.id,
        organizationId: context.organizationId,
        sequence: 1,
        level: 'info',
        message: 'Deployment queued.',
        metadata: {
          source: deployment.source,
          environment: deployment.environment
        }
      }),
      this.recordActivity(
        context,
        project.id,
        deployment.id,
        'deployment.queued',
        `Queued ${deployment.environment} deployment for ${project.name}.`
      )
    ];

    let currentDeployment = deployment;

    if (project.renderServiceId) {
      if (!this.render.isConfigured()) {
        throw new ConflictException('Project has a Render service ID, but RENDER_API_KEY is not configured.');
      }

      const renderDeploy = await this.render.triggerDeploy(project.renderServiceId);
      currentDeployment = await this.deploymentsRepository.updateProvider(deployment.id, {
        provider: 'render',
        providerServiceId: project.renderServiceId,
        providerDeployId: renderDeploy.id,
        providerStatus: renderDeploy.status ?? null
      });
      setupTasks.push(this.deploymentsRepository.createLog({
        deploymentId: deployment.id,
        organizationId: context.organizationId,
        sequence: 2,
        level: 'info',
        message: 'Render deploy triggered.',
        metadata: {
          provider: 'render',
          renderServiceId: project.renderServiceId,
          renderDeployId: renderDeploy.id,
          renderStatus: renderDeploy.status ?? null
        }
      }));
    } else {
      setupTasks.push(this.deploymentQueue.enqueueBuild({
        version: 1,
        organizationId: context.organizationId,
        deploymentId: deployment.id,
        requestedByUserId: context.userId
      }));
    }

    await Promise.all(setupTasks);

    return currentDeployment;
  }

  async get(deploymentId: string, context: ActorContext) {
    const deployment = await this.deploymentsRepository.findByIdForOrganization(
      deploymentId,
      context.organizationId
    );
    if (!deployment) {
      throw new NotFoundException('Deployment not found.');
    }

    return deployment;
  }

  async listLogs(deploymentId: string, context: ActorContext) {
    await this.get(deploymentId, context);
    return this.deploymentsRepository.listLogs(deploymentId, context.organizationId);
  }

  async cancel(deploymentId: string, context: ActorContext) {
    const deployment = await this.get(deploymentId, context);
    const cancellableStatuses: DeploymentStatus[] = ['queued', 'building', 'uploading'];

    if (!cancellableStatuses.includes(deployment.status as DeploymentStatus)) {
      throw new ConflictException('Deployment cannot be cancelled in its current state.');
    }

    const cancelled = await this.deploymentsRepository.updateStatus(deployment.id, {
      status: 'cancelled',
      finishedAt: new Date(),
      errorCode: null,
      errorMessage: null
    });

    await Promise.all([
      this.appendLog(context.organizationId, deployment.id, 'warn', 'Deployment cancelled by user.', {
        previousStatus: deployment.status
      }),
      this.recordActivity(
        context,
        deployment.projectId,
        deployment.id,
        'deployment.cancelled',
        'Cancelled deployment.'
      )
    ]);

    return cancelled;
  }

  async rollback(deploymentId: string, context: ActorContext) {
    const deployment = await this.get(deploymentId, context);

    if (deployment.status !== 'deployed') {
      throw new ConflictException('Only deployed deployments can be rolled back.');
    }

    const rolledBack = await this.deploymentsRepository.updateStatus(deployment.id, {
      status: 'rolled_back',
      finishedAt: new Date()
    });

    await Promise.all([
      this.appendLog(context.organizationId, deployment.id, 'info', 'Deployment marked as rolled back.', {}),
      this.recordActivity(
        context,
        deployment.projectId,
        deployment.id,
        'deployment.rolled_back',
        'Marked deployment as rolled back.'
      )
    ]);

    return rolledBack;
  }

  private async getProjectOrThrow(projectId: string, organizationId: string) {
    const project = await this.deploymentsRepository.findProjectForOrganization(projectId, organizationId);
    if (!project) {
      throw new NotFoundException('Project not found.');
    }

    return project;
  }

  private recordActivity(
    context: ActorContext,
    projectId: string,
    deploymentId: string,
    action: string,
    message: string
  ) {
    return this.prisma.activityLog.create({
      data: {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        entityType: 'deployment',
        entityId: deploymentId,
        action,
        message,
        metadata: jsonToDb({ projectId })
      }
    });
  }

  private async appendLog(
    organizationId: string,
    deploymentId: string,
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    metadata: Prisma.InputJsonObject
  ) {
    const sequence = await this.deploymentsRepository.getNextLogSequence(deploymentId);

    return this.deploymentsRepository.createLog({
      deploymentId,
      organizationId,
      sequence,
      level,
      message,
      metadata
    });
  }
}
