import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { jsonToDb } from '../../common/json-field';
import { ProjectEnvironment, ProjectStatus } from '../../common/prisma-enums';
import { CryptoService } from '../../common/crypto/crypto.service';
import { PrismaService } from '../../database/prisma.service';
import { CreateEnvVarDto } from './dto/create-env-var.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateEnvVarDto } from './dto/update-env-var.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsRepository } from './projects.repository';

interface ActorContext {
  userId: string;
  organizationId: string;
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly projectsRepository: ProjectsRepository,
    private readonly cryptoService: CryptoService,
    private readonly prisma: PrismaService
  ) {}

  list(context: ActorContext) {
    return this.projectsRepository.listForOrganization(context.organizationId);
  }

  async get(projectId: string, context: ActorContext) {
    const project = await this.projectsRepository.findByIdForOrganization(projectId, context.organizationId);
    if (!project) {
      throw new NotFoundException('Project not found.');
    }

    return project;
  }

  async create(dto: CreateProjectDto, context: ActorContext) {
    const slug = dto.slug ?? this.slugify(dto.name);
    await this.assertSlugAvailable(slug, context.organizationId);

    const project = await this.projectsRepository.create({
      organizationId: context.organizationId,
      name: dto.name.trim(),
      slug,
      framework: dto.framework,
      repositoryProvider: dto.repositoryProvider,
      repositoryOwner: dto.repositoryOwner,
      repositoryName: dto.repositoryName,
      productionBranch: dto.productionBranch ?? 'main',
      rootDirectory: dto.rootDirectory,
      buildCommand: dto.buildCommand,
      outputDirectory: dto.outputDirectory,
      installCommand: dto.installCommand,
      createdByUserId: context.userId
    });

    await this.recordActivity(context, project.id, 'project.created', `Created project ${project.name}.`);
    return project;
  }

  async update(projectId: string, dto: UpdateProjectDto, context: ActorContext) {
    const project = await this.get(projectId, context);
    const nextSlug = dto.slug ?? project.slug;

    if (nextSlug !== project.slug) {
      await this.assertSlugAvailable(nextSlug, context.organizationId);
    }

    const updated = await this.projectsRepository.updateById(project.id, {
      name: dto.name?.trim(),
      slug: nextSlug,
      framework: dto.framework,
      repositoryProvider: dto.repositoryProvider,
      repositoryOwner: dto.repositoryOwner,
      repositoryName: dto.repositoryName,
      repositoryId: dto.repositoryId,
      renderServiceId: dto.renderServiceId === undefined ? undefined : (dto.renderServiceId ?? null),
      productionBranch: dto.productionBranch,
      rootDirectory: dto.rootDirectory,
      buildCommand: dto.buildCommand,
      outputDirectory: dto.outputDirectory,
      installCommand: dto.installCommand,
      status: dto.status as ProjectStatus | undefined
    });

    await this.recordActivity(context, project.id, 'project.updated', `Updated project ${updated.name}.`);
    return updated;
  }

  async archive(projectId: string, context: ActorContext) {
    const project = await this.get(projectId, context);
    const archived = await this.projectsRepository.archive(project.id);

    await this.recordActivity(context, project.id, 'project.archived', `Archived project ${project.name}.`);
    return archived;
  }

  async listEnvVars(projectId: string, context: ActorContext) {
    await this.get(projectId, context);
    const envVars = await this.projectsRepository.listEnvVars(projectId, context.organizationId);

    return envVars.map((envVar) => this.toEnvVarResponse(envVar));
  }

  async exportEnvVars(projectId: string, environment: string | undefined, context: ActorContext) {
    await this.get(projectId, context);
    const envVars = await this.projectsRepository.listEnvVars(projectId, context.organizationId);

    const filtered = environment
      ? envVars.filter((v) => v.environment === environment)
      : envVars;

    return filtered.map((envVar) => ({
      key: envVar.key,
      value: this.cryptoService.decrypt(envVar.valueEncrypted),
      environment: envVar.environment,
    }));
  }

  async createEnvVar(projectId: string, dto: CreateEnvVarDto, context: ActorContext) {
    const project = await this.get(projectId, context);
    const key = dto.key.trim().toUpperCase();
    const existing = await this.projectsRepository.findEnvVarByKey(project.id, key, dto.environment);

    if (existing) {
      throw new ConflictException('Environment variable already exists for this environment.');
    }

    const envVar = await this.projectsRepository.createEnvVar({
      projectId: project.id,
      organizationId: context.organizationId,
      key,
      valueEncrypted: this.cryptoService.encrypt(dto.value),
      environment: dto.environment as ProjectEnvironment,
      createdByUserId: context.userId
    });

    await Promise.all([
      this.recordActivity(context, project.id, 'project.env_var.created', `Created ${key} for ${dto.environment}.`),
      this.recordAudit(context, 'project.env_var.created', 'project_environment_variable', envVar.id, {
        projectId: project.id,
        key,
        environment: dto.environment
      })
    ]);

    return this.toEnvVarResponse(envVar);
  }

  async updateEnvVar(projectId: string, envVarId: string, dto: UpdateEnvVarDto, context: ActorContext) {
    await this.get(projectId, context);
    const envVar = await this.getEnvVarOrThrow(projectId, envVarId, context);
    const updated = await this.projectsRepository.updateEnvVar(envVar.id, {
      valueEncrypted: dto.value === undefined ? undefined : this.cryptoService.encrypt(dto.value)
    });

    await this.recordAudit(context, 'project.env_var.updated', 'project_environment_variable', envVar.id, {
      projectId,
      key: envVar.key,
      environment: envVar.environment
    });

    return this.toEnvVarResponse(updated);
  }

  async deleteEnvVar(projectId: string, envVarId: string, context: ActorContext) {
    await this.get(projectId, context);
    const envVar = await this.getEnvVarOrThrow(projectId, envVarId, context);
    await this.projectsRepository.deleteEnvVar(envVar.id);

    await this.recordAudit(context, 'project.env_var.deleted', 'project_environment_variable', envVar.id, {
      projectId,
      key: envVar.key,
      environment: envVar.environment
    });

    return { deleted: true };
  }

  private async assertSlugAvailable(slug: string, organizationId: string) {
    const existing = await this.projectsRepository.findBySlugForOrganization(slug, organizationId);
    if (existing) {
      throw new ConflictException('Project slug is already in use.');
    }
  }

  private slugify(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'project';
  }

  private recordActivity(context: ActorContext, projectId: string, action: string, message: string) {
    return this.prisma.activityLog.create({
      data: {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        entityType: 'project',
        entityId: projectId,
        action,
        message,
        metadata: jsonToDb({})
      }
    });
  }

  private recordAudit(
    context: ActorContext,
    action: string,
    resourceType: string,
    resourceId: string,
    metadata: Prisma.InputJsonObject
  ) {
    return this.prisma.auditLog.create({
      data: {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action,
        resourceType,
        resourceId,
        metadata: jsonToDb(metadata)
      }
    });
  }

  private async getEnvVarOrThrow(projectId: string, envVarId: string, context: ActorContext) {
    const envVar = await this.projectsRepository.findEnvVarById(envVarId, projectId, context.organizationId);
    if (!envVar) {
      throw new NotFoundException('Environment variable not found.');
    }

    return envVar;
  }

  private toEnvVarResponse(envVar: {
    id: string;
    key: string;
    environment: ProjectEnvironment | string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: envVar.id,
      key: envVar.key,
      environment: envVar.environment,
      createdAt: envVar.createdAt,
      updatedAt: envVar.updatedAt,
      value: '********'
    };
  }
}
