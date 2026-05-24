import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeploymentSource, DeploymentStatus, Prisma } from '@prisma/client';
import { Job, Worker } from 'bullmq';
import { spawn } from 'child_process';
import * as fs from 'fs';
import IORedis from 'ioredis';
import * as os from 'os';
import * as path from 'path';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../../modules/storage/storage.service';
import { BuildRunnerService } from '../build-runner/build-runner.service';
import { DEPLOYMENTS_QUEUE, PROCESS_DEPLOYMENT_BUILD_JOB } from '../queues/queue.constants';
import { ProcessDeploymentBuildPayload } from '../queues/deployment-queue.service';

@Injectable()
export class DeploymentProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeploymentProcessor.name);
  private worker?: Worker<ProcessDeploymentBuildPayload>;
  private connection?: IORedis;

  constructor(
    private readonly config: ConfigService,
    private readonly buildRunner: BuildRunnerService,
    private readonly storage: StorageService,
    private readonly prisma: PrismaService
  ) {}

  onModuleInit() {
    if (this.config.get<string>('NODE_ENV') === 'test') {
      return;
    }

    this.connection = new IORedis(this.config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: null
    });
    this.worker = new Worker<ProcessDeploymentBuildPayload>(
      DEPLOYMENTS_QUEUE,
      (job) => this.process(job),
      {
        connection: this.connection,
        concurrency: Number(process.env.BUILD_MAX_CONCURRENT ?? 2)
      }
    );

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Deployment job ${job?.id ?? 'unknown'} failed: ${error.message}`);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    this.connection?.disconnect();
  }

  // ─── Job router ──────────────────────────────────────────────────────────────

  private async process(job: Job<ProcessDeploymentBuildPayload>) {
    if (job.name !== PROCESS_DEPLOYMENT_BUILD_JOB) {
      return;
    }

    try {
      await this.processDeploymentBuild(job);
    } catch (error) {
      await this.markFailed(job.data, error);
      throw error;
    }
  }

  // ─── Main pipeline ────────────────────────────────────────────────────────────

  private async processDeploymentBuild(job: Job<ProcessDeploymentBuildPayload>) {
    const { deploymentId, organizationId, requestedByUserId } = job.data;

    const deployment = await this.prisma.deployment.findFirst({
      where: { id: deploymentId, organizationId },
      include: { project: true }
    });

    if (!deployment || deployment.status !== DeploymentStatus.queued) {
      return;
    }

    // ── Builder-source deployments: no build step needed ──────────────────────
    // The builder service manages content directly in the database.
    if (deployment.source === DeploymentSource.builder) {
      await this.transitionDeployment(
        deployment.id,
        organizationId,
        DeploymentStatus.queued,
        DeploymentStatus.deployed,
        'Builder site published — no build step required.',
        {},
        { startedAt: new Date(), finishedAt: new Date() }
      );
      return;
    }

    // ── Git + manual source: run the full build pipeline ─────────────────────
    await this.transitionDeployment(
      deployment.id,
      organizationId,
      DeploymentStatus.queued,
      DeploymentStatus.building,
      'Deployment worker picked up the build.',
      { jobId: job.id ?? null },
      { startedAt: new Date() }
    );

    // Clone the git repository when source is 'git' and a repo is configured.
    let sourceDirectory: string | undefined;
    let clonedDirectory: string | undefined;

    if (deployment.source === DeploymentSource.git) {
      const { repositoryOwner, repositoryName, repositoryProvider } = deployment.project;

      if (!repositoryOwner || !repositoryName) {
        throw new Error(
          'No repository configured on this project. ' +
          'Set repositoryOwner and repositoryName in project settings.'
        );
      }

      clonedDirectory = await this.cloneRepository({
        deploymentId: deployment.id,
        organizationId,
        provider: repositoryProvider ?? 'github',
        owner: repositoryOwner,
        repo: repositoryName,
        branch: deployment.branch ?? deployment.project.productionBranch ?? 'main',
        requestedByUserId,
      });

      sourceDirectory = clonedDirectory;
    }

    let artifactPath: string | undefined;

    try {
      const buildResult = await this.buildRunner.run({
        organizationId,
        projectId: deployment.projectId,
        deploymentId: deployment.id,
        installCommand: deployment.project.installCommand,
        buildCommand: deployment.project.buildCommand,
        outputDirectory: deployment.project.outputDirectory,
        rootDirectory: deployment.project.rootDirectory,
        sourceDirectory,
      });

      artifactPath = buildResult.artifactPath;
      await this.appendBuildLogs(deployment.id, organizationId, buildResult.logs);

      await this.transitionDeployment(
        deployment.id,
        organizationId,
        DeploymentStatus.building,
        DeploymentStatus.uploading,
        'Build completed. Recording deployment artifact.',
        {}
      );

      await this.createArtifactForDeployment(deployment.id, organizationId, {
        sizeBytes: buildResult.sizeBytes,
        checksum: buildResult.checksum,
        outputDirectory: buildResult.outputDirectory,
      });

      await this.transitionDeployment(
        deployment.id,
        organizationId,
        DeploymentStatus.uploading,
        DeploymentStatus.deployed,
        'Deployment published.',
        {},
        { finishedAt: new Date() }
      );
    } finally {
      // Clean up temp directories to avoid disk exhaustion.
      await this.cleanupDir(clonedDirectory);
      await this.cleanupFile(artifactPath);
    }
  }

  // ─── Git clone ────────────────────────────────────────────────────────────────

  private async resolveGitToken(provider: string, requestedByUserId: string | null): Promise<string> {
    // 1. Try the user's stored OAuth token (set when they connected GitHub in the UI)
    if (requestedByUserId && provider.toLowerCase() === 'github') {
      const oauthAccount = await this.prisma.oauthAccount.findFirst({
        where: { userId: requestedByUserId, provider: 'github' },
        select: { accessTokenEncrypted: true },
      });
      if (oauthAccount?.accessTokenEncrypted) {
        return oauthAccount.accessTokenEncrypted; // stored as plaintext in this impl
      }
    }
    // 2. Fall back to global PAT
    return this.config.get<string>('GITHUB_TOKEN', '');
  }

  private async cloneRepository(input: {
    deploymentId: string;
    organizationId: string;
    provider: string;
    owner: string;
    repo: string;
    branch: string;
    requestedByUserId?: string | null;
  }): Promise<string> {
    const token = await this.resolveGitToken(input.provider, input.requestedByUserId ?? null);
    const cloneUrl = this.buildCloneUrl(input.provider, input.owner, input.repo, token);
    // Prefer the persistent disk temp dir so interrupted clones don't exhaust
    // ephemeral /tmp space and survive Render restarts during long builds.
    const buildTempBase = this.config.get<string>('BUILD_TEMP_DIR') || os.tmpdir();
    const targetDir = path.join(buildTempBase, `glondia-src-${input.deploymentId}`);

    await fs.promises.mkdir(targetDir, { recursive: true });

    const safeUrl = cloneUrl.replace(/\/\/[^@]+@/, '//***@');
    await this.appendLog(
      input.organizationId,
      input.deploymentId,
      'info',
      `Cloning ${input.owner}/${input.repo} (branch: ${input.branch}) …`,
      { cloneUrl: safeUrl }
    );

    try {
      // Shallow clone of the target branch.
      await this.execShell(
        `git clone --depth 1 --branch ${input.branch} ${cloneUrl} ${targetDir}`,
        os.tmpdir()
      );
    } catch {
      // If the branch doesn't exist, fall back to default branch.
      await this.appendLog(
        input.organizationId,
        input.deploymentId,
        'warn',
        `Branch "${input.branch}" not found — falling back to default branch.`,
        {}
      );
      await this.cleanupDir(targetDir);
      await fs.promises.mkdir(targetDir, { recursive: true });
      await this.execShell(`git clone --depth 1 ${cloneUrl} ${targetDir}`, os.tmpdir());
    }

    await this.appendLog(input.organizationId, input.deploymentId, 'info', 'Repository cloned successfully.', {});
    return targetDir;
  }

  private buildCloneUrl(provider: string, owner: string, repo: string, token?: string): string {
    const p = provider.toLowerCase();
    if (p === 'gitlab') {
      return token
        ? `https://oauth2:${token}@gitlab.com/${owner}/${repo}.git`
        : `https://gitlab.com/${owner}/${repo}.git`;
    }
    if (p === 'bitbucket') {
      return token
        ? `https://x-token-auth:${token}@bitbucket.org/${owner}/${repo}.git`
        : `https://bitbucket.org/${owner}/${repo}.git`;
    }
    // Default: GitHub
    return token
      ? `https://${token}@github.com/${owner}/${repo}.git`
      : `https://github.com/${owner}/${repo}.git`;
  }

  /**
   * Run a shell command and wait for it to finish.
   * @param timeoutMs  Kill the process and reject after this many ms (default 5 min).
   *                   Set to 0 to disable the timeout (not recommended).
   */
  private execShell(command: string, cwd: string, timeoutMs = 300_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, [], { cwd, shell: true, stdio: 'pipe' });
      const stderr: string[] = [];

      // Safety valve: kill the child if it runs longer than `timeoutMs`.
      const timer = timeoutMs > 0
        ? setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error(
              `Command timed out after ${timeoutMs / 1000}s — ` +
              `possible network hang or credential issue: ${command}`
            ));
          }, timeoutMs)
        : null;

      child.stderr?.on('data', (d: Buffer) => stderr.push(d.toString()));
      child.on('close', (code) => {
        if (timer) clearTimeout(timer);
        code === 0
          ? resolve()
          : reject(new Error(`Command failed (exit ${code}): ${command}\n${stderr.join('')}`));
      });
      child.on('error', (err) => { if (timer) clearTimeout(timer); reject(err); });
    });
  }

  // ─── Artifact creation ────────────────────────────────────────────────────────

  private async createArtifactForDeployment(
    deploymentId: string,
    organizationId: string,
    artifactInput: { sizeBytes: number; checksum: string | null; outputDirectory: string }
  ) {
    await this.prisma.$transaction(async (tx) => {
      const deployment = await tx.deployment.findFirst({
        where: { id: deploymentId, organizationId }
      });

      if (!deployment || deployment.status !== DeploymentStatus.uploading) {
        return;
      }

      const descriptor = this.storage.createDeploymentArtifactObject({
        organizationId,
        projectId: deployment.projectId,
        deploymentId
      });

      const artifact = await tx.artifact.create({
        data: {
          organizationId,
          projectId: deployment.projectId,
          deploymentId,
          bucket: descriptor.bucket,
          objectKey: descriptor.objectKey,
          sizeBytes: artifactInput.sizeBytes,
          checksum: artifactInput.checksum,
          status: 'ready'
        }
      });

      await tx.deployment.update({
        where: { id: deploymentId },
        data: { artifactId: artifact.id }
      });

      const sequence = await tx.deploymentLog.count({ where: { deploymentId } });
      await tx.deploymentLog.create({
        data: {
          deploymentId,
          organizationId,
          sequence: sequence + 1,
          level: 'info',
          message: 'Deployment artifact recorded.',
          metadata: {
            artifactId: artifact.id,
            bucket: descriptor.bucket,
            objectKey: descriptor.objectKey,
            outputDirectory: artifactInput.outputDirectory
          }
        }
      });
    });
  }

  // ─── Status transitions ───────────────────────────────────────────────────────

  private async transitionDeployment(
    deploymentId: string,
    organizationId: string,
    fromStatus: DeploymentStatus,
    toStatus: DeploymentStatus,
    message: string,
    metadata: Prisma.InputJsonObject,
    extraData: Prisma.DeploymentUpdateInput = {}
  ) {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.deployment.findFirst({ where: { id: deploymentId, organizationId } });
      if (!current || current.status !== fromStatus) return;

      await tx.deployment.update({
        where: { id: deploymentId },
        data: { ...extraData, status: toStatus }
      });

      const sequence = await tx.deploymentLog.count({ where: { deploymentId } });
      await tx.deploymentLog.create({
        data: { deploymentId, organizationId, sequence: sequence + 1, level: 'info', message, metadata }
      });
    });
  }

  // ─── Log helpers ─────────────────────────────────────────────────────────────

  private async appendBuildLogs(deploymentId: string, organizationId: string, logs: string[]) {
    if (logs.length === 0) return;

    await this.prisma.$transaction(async (tx) => {
      let sequence = await tx.deploymentLog.count({ where: { deploymentId } });
      for (const message of logs) {
        sequence += 1;
        await tx.deploymentLog.create({
          data: {
            deploymentId,
            organizationId,
            sequence,
            level: 'info',
            message,
            metadata: { source: 'build-runner' }
          }
        });
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
    const sequence = await this.prisma.deploymentLog.count({ where: { deploymentId } });
    return this.prisma.deploymentLog.create({
      data: { deploymentId, organizationId, sequence: sequence + 1, level, message, metadata }
    });
  }

  // ─── Failure handler ─────────────────────────────────────────────────────────

  private async markFailed(payload: ProcessDeploymentBuildPayload, error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown deployment worker error.';

    await this.prisma.$transaction(async (tx) => {
      const deployment = await tx.deployment.findFirst({
        where: { id: payload.deploymentId, organizationId: payload.organizationId }
      });

      if (!deployment || ['deployed', 'cancelled', 'rolled_back'].includes(deployment.status)) {
        return;
      }

      await tx.deployment.update({
        where: { id: deployment.id },
        data: {
          status: DeploymentStatus.failed,
          finishedAt: new Date(),
          errorCode: 'WORKER_FAILED',
          errorMessage: message
        }
      });

      const sequence = await tx.deploymentLog.count({ where: { deploymentId: deployment.id } });
      await tx.deploymentLog.create({
        data: {
          deploymentId: deployment.id,
          organizationId: payload.organizationId,
          sequence: sequence + 1,
          level: 'error',
          message: 'Deployment worker failed.',
          metadata: { error: message }
        }
      });
    });
  }

  // ─── Cleanup helpers ──────────────────────────────────────────────────────────

  private async cleanupDir(dirPath?: string) {
    if (!dirPath) return;
    try {
      await fs.promises.rm(dirPath, { recursive: true, force: true });
    } catch (err) {
      this.logger.warn(`Failed to clean up directory ${dirPath}: ${(err as Error).message}`);
    }
  }

  private async cleanupFile(filePath?: string) {
    if (!filePath) return;
    try {
      await fs.promises.rm(filePath, { force: true });
    } catch (err) {
      this.logger.warn(`Failed to clean up file ${filePath}: ${(err as Error).message}`);
    }
  }
}
