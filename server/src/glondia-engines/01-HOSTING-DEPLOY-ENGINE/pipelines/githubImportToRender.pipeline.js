/**
 * githubImportToRender.pipeline.js
 *
 * Controlled-source GitHub pipeline:
 *
 *   client GitHub repo
 *   → import source with GitHub App credentials
 *   → detect project + write build script
 *   → create Glondiasites-controlled repo + publish source
 *   → create Render service FROM THE CONTROLLED REPO
 *   → trigger Render deploy
 *   → store original (githubSource) + controlled (controlledSource) metadata
 *
 * Render never receives the client repo URL. The client repo is an import
 * source only.
 */

import renderApiService from '../../../services/renderApiService.js';
import { normalizeGithubLinkInput } from '../01-GITHUB-LINK-INTAKE-MOUNTAIN/githubLink.intake.js';
import { importClientGithubRepo } from '../02-GITHUB-CLIENT-IMPORT-MOUNTAIN/githubClientImport.stage.js';
import { detectProject } from '../02-UNZIP-AND-DETECT-MOUNTAIN/projectDetector.stage.js';
import { writeRenderBuildScript } from '../02-UNZIP-AND-DETECT-MOUNTAIN/buildScriptWriter.stage.js';
import { publishToControlledRepo } from '../03-GITHUB-SOURCE-MOUNTAIN/controlledRepoPublisher.stage.js';
import { githubAppConfigured } from '../03-GITHUB-SOURCE-MOUNTAIN/githubAppAuth.stage.js';
import { buildRenderPayload } from '../04-RENDER-PAYLOAD-MOUNTAIN/renderPayloadBuilder.stage.js';
import { createAndTriggerRenderDeploy } from '../05-RENDER-DEPLOY-MOUNTAIN/renderDeploy.stage.js';
import { hasRealValue } from '../../00-SHARED/runtimeConfig.js';
import {
  addDeploymentLog,
  createDeploymentRecord,
  renderSafeName,
  updateDeploymentRecord,
} from '../../00-SHARED/deploymentRecordStore.js';

export async function run(input = {}, context = {}) {
  const normalized = normalizeGithubLinkInput(input, context);

  const deployment = await createDeploymentRecord({
    userId: normalized.userId,
    siteId: normalized.siteId,
    projectId: normalized.projectId,
    serviceName: renderSafeName(normalized.siteName),
    source: 'github-import',
    sourceReference: normalized.repoUrl,
    repoUrl: null, // controlled repo URL is filled in after publish — never the client repo
    githubBranch: normalized.branch,
    status: 'preparing',
    buildStatus: 'queued',
    currentStep: 'Importing client GitHub repository',
    environmentConfiguration: {
      sourceRepository: '',
      originalSourceRepository: normalized.repoUrl,
      branch: normalized.branch,
      rootDirectory: '',
    },
  });

  try {
    await addDeploymentLog(deployment.deploymentId, `Importing client GitHub repository: ${normalized.parsedRepo.fullName}@${normalized.branch}.`, 'info', {
      originalSource: normalized.repoUrl,
    });

    const imported = await importClientGithubRepo({ ...normalized, deploymentSafeId: deployment.deploymentId });
    await addDeploymentLog(deployment.deploymentId, `Imported ${imported.files.length} files from client repository.`, 'ok');

    const detected = await detectProject(imported.localDir, imported.files);
    const shell = await writeRenderBuildScript(imported.localDir, detected);
    await addDeploymentLog(deployment.deploymentId, `Detected ${detected.framework} (${detected.type}). Build script prepared.`, 'info');

    const githubSource = {
      originalRepoUrl: imported.originalRepoUrl,
      originalFullName: imported.originalFullName,
      originalBranch: imported.originalBranch,
      originalRootDirectory: imported.originalRootDirectory,
      clientInstallationId: imported.clientInstallationId,
      importedAt: imported.importedAt,
    };

    // Capability check: we can publish to a controlled repo if we have a usable
    // credential (GitHub App or non-PEM PAT) AND a controlled target (a creatable
    // owner or the shared RENDER_GENERATED_SITES_REPO_URL fallback).
    const patToken = process.env.GITHUB_GENERATED_SITES_TOKEN || process.env.GITHUB_TOKEN || '';
    const hasControlledCreds = githubAppConfigured() || (hasRealValue(patToken) && !patToken.includes('-----BEGIN'));
    const hasControlledTarget = hasRealValue(process.env.GITHUB_GLONDIASITES_OWNER) || hasRealValue(process.env.RENDER_GENERATED_SITES_REPO_URL);
    if (!hasControlledCreds || !hasControlledTarget) {
      return ready(
        deployment.deploymentId,
        'Ready - controlled repo publishing not configured',
        'Configure GitHub App credentials (GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY) and a controlled target (GITHUB_GLONDIASITES_OWNER or RENDER_GENERATED_SITES_REPO_URL) before deploying client repos.',
        { githubSource },
      );
    }

    const controlledRepo = await publishToControlledRepo({
      localDir: imported.localDir,
      siteName: normalized.siteName,
      userId: normalized.userId,
      owner: input.controlledRepoOwner || process.env.GITHUB_GLONDIASITES_OWNER,
      privateRepo: input.privateRepo,
    });
    await addDeploymentLog(deployment.deploymentId, `Published ${controlledRepo.publishedCount} files to controlled repo (${controlledRepo.mode}): ${controlledRepo.controlledFullName}${controlledRepo.rootDirectory ? '/' + controlledRepo.rootDirectory : ''}.`, 'ok', {
      controlledSource: controlledRepo.controlledRepoUrl,
      mode: controlledRepo.mode,
      rootDirectory: controlledRepo.rootDirectory,
      commitId: controlledRepo.commitId,
    });

    const controlledSource = {
      repoUrl: controlledRepo.controlledRepoUrl,
      fullName: controlledRepo.controlledFullName,
      branch: controlledRepo.branch,
      rootDirectory: controlledRepo.rootDirectory || '',
      commitId: controlledRepo.commitId,
      private: controlledRepo.private,
      createdAt: controlledRepo.createdAt,
      publishedCount: controlledRepo.publishedCount,
    };

    const renderPayload = buildRenderPayload({
      ...input,
      serviceName: normalized.siteName,
      // Render source is ALWAYS the controlled repo, never the client repo.
      repoUrl: controlledRepo.controlledRepoUrl,
      repositoryUrl: controlledRepo.controlledRepoUrl,
      sourceReference: controlledRepo.controlledRepoUrl,
      branch: controlledRepo.branch,
      rootDirectory: controlledRepo.rootDirectory || '',
      buildCommand: shell.buildCommand,
      publishDirectory: detected.publishDirectory,
      outputDirectory: detected.publishDirectory,
      startCommand: detected.startCommand || '',
      runtime: detected.runtime || '',
      serviceType: detected.serviceType,
      framework: detected.framework,
    });

    const baseUpdate = {
      repoUrl: controlledRepo.controlledRepoUrl,
      githubRepo: controlledRepo.controlledRepoUrl,
      githubBranch: controlledRepo.branch,
      serviceType: detected.serviceType,
      githubSource,
      controlledSource,
      environmentConfiguration: {
        sourceRepository: controlledRepo.controlledRepoUrl,
        originalSourceRepository: normalized.repoUrl,
        branch: controlledRepo.branch,
        rootDirectory: controlledRepo.rootDirectory || '',
        buildCommand: renderPayload.buildCommand,
        outputDirectory: renderPayload.outputDirectory,
        startCommand: renderPayload.startCommand || '',
        runtime: renderPayload.runtime || '',
        plan: renderPayload.plan,
        region: renderPayload.region,
      },
    };

    if (!renderApiService.configured()) {
      const settings = renderApiService.settings();
      return ready(
        deployment.deploymentId,
        'Ready - missing Render credentials',
        `Configure ${settings.required.join(', ')} to deploy the controlled repo to Render.`,
        baseUpdate,
      );
    }

    const renderResult = await createAndTriggerRenderDeploy({
      ...renderPayload,
      // Pin the deploy to the freshly published commit when available.
      ...(controlledRepo.commitId ? { commitId: controlledRepo.commitId } : {}),
    });
    await addDeploymentLog(deployment.deploymentId, `Render deploy ${renderResult.deployId} started from controlled repo.`, 'ok', {
      renderServiceId: renderResult.serviceId,
    });

    return updateDeploymentRecord(deployment.deploymentId, {
      ...baseUpdate,
      status: 'building',
      buildStatus: 'queued',
      currentStep: 'Queued in Render',
      renderServiceId: renderResult.serviceId,
      renderDeployId: renderResult.deployId,
      providerStatus: renderResult.providerStatus,
      liveUrl: renderResult.liveUrl,
      render: {
        serviceResponse: renderResult.serviceResponse,
        deployResponse: renderResult.deployResponse,
      },
      errorMessage: null,
    });
  } catch (error) {
    // Keep failed records visible with their source metadata intact.
    await addDeploymentLog(deployment.deploymentId, error.message || 'GitHub import deployment failed.', 'error', error.details || null);
    return updateDeploymentRecord(deployment.deploymentId, {
      status: 'failed',
      buildStatus: 'failed',
      recordStatus: 'active',
      currentStep: stageToStep(error.stage),
      errorMessage: error.message || 'GitHub import deployment failed.',
      errorDetails: error.details || null,
    });
  }
}

class GithubImportPipelineService {
  async create(input = {}, context = {}) {
    return run(input, context);
  }
}

async function ready(deploymentId, step, message, patch = {}) {
  await addDeploymentLog(deploymentId, message, 'warn');
  return updateDeploymentRecord(deploymentId, {
    ...patch,
    status: 'ready',
    buildStatus: 'configuration_required',
    currentStep: step,
    errorMessage: message,
  });
}

function stageToStep(stage) {
  return {
    github_repo_validate: 'GitHub repo validation failed',
    github_client_import: 'Client GitHub import failed',
    project_detection: 'Project detection failed',
    build_script_write: 'Build script write failed',
    controlled_repo_create: 'Controlled repo creation failed',
    github_push: 'Controlled repo publish failed',
    render_service_create: 'Render service creation failed',
    render_deploy_trigger: 'Render deploy trigger failed',
  }[stage] || 'Failed';
}

export default new GithubImportPipelineService();
