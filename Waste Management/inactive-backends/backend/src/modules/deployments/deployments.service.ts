import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { jsonToDb } from '../../common/json-field';
import { DeploymentEnvironment, DeploymentSource, DeploymentStatus } from '../../common/prisma-enums';
import { PrismaService } from '../../database/prisma.service';
import { RenderService } from '../../integrations/render/render.service';
import { DeploymentQueueService } from '../../workers/queues/deployment-queue.service';
import { CreateDeploymentDto } from './dto/create-deployment.dto';
import { CreateRenderDeploymentDto } from './dto/create-render-deployment.dto';
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

  async createRenderDeployment(dto: CreateRenderDeploymentDto, context: ActorContext) {
    if (!dto.repoUrl) throw new BadRequestException('repoUrl is required to deploy to Render.');
    if (!this.render.isConfigured()) {
      throw new ConflictException('RENDER_API_KEY and RENDER_OWNER_ID must be configured before deploying to Render.');
    }

    const project = await this.findOrCreateRenderProject(dto, context);
    const deployment = await this.deploymentsRepository.create({
      organizationId: context.organizationId,
      projectId: project.id,
      environment: 'production',
      source: 'git',
      branch: dto.branch ?? 'main',
      triggeredByUserId: context.userId,
      status: 'queued'
    });

    await this.appendLog(context.organizationId, deployment.id, 'info', 'Creating Render service/deploy.', {
      repoUrl: dto.repoUrl,
      branch: dto.branch ?? 'main'
    });

    try {
      let renderServiceId = project.renderServiceId ?? null;
      let liveUrl: string | null = null;
      if (!renderServiceId) {
        const created = await this.render.createService({
          type: dto.serviceType ?? (dto.startCommand ? 'web_service' : 'static_site'),
          name: dto.name,
          repo: dto.repoUrl,
          branch: dto.branch,
          rootDirectory: dto.rootDirectory,
          buildCommand: dto.buildCommand,
          startCommand: dto.startCommand,
          outputDirectory: dto.outputDirectory,
          envVars: dto.environmentVariables
        });
        renderServiceId = created.service?.id ?? created.id ?? null;
        liveUrl = created.service?.serviceDetails?.url ?? null;
        if (!renderServiceId) throw new ConflictException('Render did not return a service ID.');
        await this.prisma.project.update({ where: { id: project.id }, data: { renderServiceId } });
      }

      const renderDeploy = await this.render.triggerDeploy(renderServiceId);
      if (!renderDeploy.id) throw new ConflictException('Render did not return a deploy ID.');

      const updated = await this.deploymentsRepository.updateProvider(deployment.id, {
        provider: 'render',
        providerServiceId: renderServiceId,
        providerDeployId: renderDeploy.id,
        providerStatus: renderDeploy.status ?? 'created'
      });
      await this.deploymentsRepository.updateStatus(deployment.id, {
        status: 'building',
        errorCode: null,
        errorMessage: null
      });
      await this.appendLog(context.organizationId, deployment.id, 'info', 'Render accepted the deployment.', {
        renderServiceId,
        renderDeployId: renderDeploy.id,
        renderStatus: renderDeploy.status ?? null
      });

      return this.toRenderDeploymentResponse(updated, {
        serviceName: dto.name,
        serviceType: dto.serviceType ?? (dto.startCommand ? 'web_service' : 'static_site'),
        liveUrl,
        currentStep: 'Queued',
        buildStatus: 'queued'
      });
    } catch (error) {
      await this.deploymentsRepository.updateStatus(deployment.id, {
        status: 'failed',
        errorCode: 'RENDER_DEPLOY_FAILED',
        errorMessage: error instanceof Error ? error.message : 'Render deployment failed.'
      });
      await this.appendLog(context.organizationId, deployment.id, 'error', error instanceof Error ? error.message : 'Render deployment failed.', {});
      throw error;
    }
  }

  async getRenderStatus(deploymentId: string, context: ActorContext) {
    const deployment = await this.get(deploymentId, context);
    if (deployment.provider !== 'render' || !deployment.providerServiceId) {
      throw new ConflictException('Render deployment not started for this deployment.');
    }
    let renderDeploy = deployment.providerDeployId
      ? await this.render.getDeploy(deployment.providerServiceId, deployment.providerDeployId)
      : null;
    if (!renderDeploy?.id) {
      const deploys = await this.render.listDeploys(deployment.providerServiceId);
      const row = deploys[0] as { deploy?: { id?: string; status?: string } } | { id?: string; status?: string } | undefined;
      renderDeploy = ('deploy' in (row ?? {}) ? (row as { deploy?: { id?: string; status?: string } }).deploy : row) as { id: string; status?: string } | null;
    }
    if (!renderDeploy?.id) return this.toRenderDeploymentResponse(deployment, { currentStep: 'Waiting for Render deploy' });

    const mapped = mapRenderStatus(renderDeploy.status);
    const updated = await this.deploymentsRepository.updateProvider(deployment.id, {
      provider: 'render',
      providerServiceId: deployment.providerServiceId,
      providerDeployId: renderDeploy.id,
      providerStatus: renderDeploy.status ?? null
    });
    await this.deploymentsRepository.updateStatus(deployment.id, {
      status: mapped.status as DeploymentStatus,
      finishedAt: mapped.status === 'deployed' || mapped.status === 'failed' ? new Date() : undefined
    });
    let liveUrl: string | null = null;
    let urlReachable = false;
    if (mapped.status === 'deployed') {
      liveUrl = extractRenderUrl(await this.render.getService(deployment.providerServiceId));
      urlReachable = await verifyUrl(liveUrl);
    }
    return this.toRenderDeploymentResponse(updated, {
      currentStep: mapped.currentStep,
      buildStatus: mapped.buildStatus,
      liveUrl,
      urlReachable
    });
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

  private async findOrCreateRenderProject(dto: CreateRenderDeploymentDto, context: ActorContext) {
    if (dto.projectId) {
      const existing = await this.deploymentsRepository.findProjectForOrganization(dto.projectId, context.organizationId);
      if (existing) return existing;
    }

    const slug = `${dto.name || 'render-app'}-${Date.now()}`
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
    return this.prisma.project.create({
      data: {
        organizationId: context.organizationId,
        name: dto.name || 'Render app',
        slug,
        framework: dto.startCommand ? 'Node' : 'Static Site',
        repositoryProvider: 'github',
        productionBranch: dto.branch ?? 'main',
        rootDirectory: dto.rootDirectory,
        buildCommand: dto.buildCommand,
        outputDirectory: dto.outputDirectory,
        createdByUserId: context.userId
      }
    });
  }

  private toRenderDeploymentResponse(deployment: {
    id: string;
    projectId: string;
    providerServiceId?: string | null;
    providerDeployId?: string | null;
    providerStatus?: string | null;
    status: string;
    errorMessage?: string | null;
    createdAt: Date;
    updatedAt: Date;
    finishedAt?: Date | null;
  }, extras: {
    serviceName?: string;
    serviceType?: string;
    liveUrl?: string | null;
    urlReachable?: boolean;
    currentStep?: string;
    buildStatus?: string;
  } = {}) {
    return {
      deploymentId: deployment.id,
      projectId: deployment.projectId,
      renderServiceId: deployment.providerServiceId,
      renderDeployId: deployment.providerDeployId,
      serviceName: extras.serviceName,
      serviceType: extras.serviceType,
      status: deployment.status,
      buildStatus: extras.buildStatus ?? deployment.providerStatus,
      providerStatus: deployment.providerStatus,
      currentStep: extras.currentStep ?? deployment.status,
      liveUrl: extras.liveUrl ?? null,
      verifiedUrl: extras.urlReachable ? extras.liveUrl ?? null : null,
      urlReachable: Boolean(extras.urlReachable),
      errorMessage: deployment.errorMessage,
      createdAt: deployment.createdAt,
      updatedAt: deployment.updatedAt,
      lastDeployedAt: deployment.finishedAt
    };
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

function mapRenderStatus(status?: string) {
  const value = String(status ?? '').toLowerCase();
  if (['live', 'deployed', 'succeeded'].includes(value)) return { status: 'deployed', buildStatus: 'succeeded', currentStep: 'Verifying URL' };
  if (['build_failed', 'update_failed', 'pre_deploy_failed', 'canceled', 'failed'].includes(value)) return { status: 'failed', buildStatus: 'failed', currentStep: 'Failed' };
  if (['created', 'queued'].includes(value)) return { status: 'queued', buildStatus: value || 'queued', currentStep: 'Queued' };
  return { status: 'building', buildStatus: value || 'building', currentStep: 'Building' };
}

function extractRenderUrl(response: unknown) {
  const wrapper = response as { service?: { serviceDetails?: { url?: string }; url?: string } };
  const service = wrapper?.service ?? (response as { serviceDetails?: { url?: string }; url?: string });
  return service?.serviceDetails?.url ?? service?.url ?? null;
}

async function verifyUrl(url: string | null) {
  if (!url) return false;
  try {
    const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
    return response.ok;
  } catch {
    return false;
  }
}
