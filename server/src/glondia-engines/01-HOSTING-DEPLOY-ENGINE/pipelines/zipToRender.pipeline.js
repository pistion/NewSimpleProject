/**
 * zipToRender.pipeline.js
 *
 * ZIP -> GitHub generated-sites repo -> Render pipeline.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import renderApiService from '../../../services/renderApiService.js';
import { deployZipSite } from './base64ZipToRender.pipeline.js';
import { normalizeZipUploadInput } from '../01-ZIP-INTAKE-MOUNTAIN/zipUpload.intake.js';
import { extractZipSafely } from '../02-UNZIP-AND-DETECT-MOUNTAIN/zipExtractor.stage.js';
import { detectProject } from '../02-UNZIP-AND-DETECT-MOUNTAIN/projectDetector.stage.js';
import { writeRenderBuildScript, writeRootDispatcherScript } from '../02-UNZIP-AND-DETECT-MOUNTAIN/buildScriptWriter.stage.js';
import { publishDirectoryToGithub } from '../03-GITHUB-SOURCE-MOUNTAIN/githubPublisher.stage.js';
import { publishDirectoryToTemporaryRepo, shouldUseTemporaryRepo } from '../03-GITHUB-SOURCE-MOUNTAIN/temporaryRepoManager.stage.js';
import { getRuntimeConfig, hasRealValue } from '../../00-SHARED/runtimeConfig.js';
import {
  addDeploymentLog,
  createDeploymentRecord,
  renderSafeName,
  serviceUrl,
  updateDeploymentRecord,
} from '../../00-SHARED/deploymentRecordStore.js';
import { createAndTriggerRenderDeploy } from '../05-RENDER-DEPLOY-MOUNTAIN/renderDeploy.stage.js';

export async function run(input = {}, context = {}) {
  const normalized = normalizeZipUploadInput(input, context);
  const { file, fields, siteName, slug, uploadId, siteDir, targetRoot, sourceRepo, branch } = normalized;
  const cfg = getRuntimeConfig();

  // Launch-first rule: every deployment starts on the free plan. Only an admin
  // may force a non-free initial plan (e.g. internal/staff deploys).
  const initialPlan = (context.isAdmin === true && fields.plan)
    ? fields.plan
    : (process.env.RENDER_INITIAL_PLAN || 'free');

  const deployment = await createDeploymentRecord({
    userId: normalized.userId,
    siteId: fields.siteId || null,
    projectId: fields.projectId || fields.siteId || null,
    serviceName: renderSafeName(siteName),
    source: 'zip-upload',
    sourceReference: file.originalname,
    repoUrl: sourceRepo || null,
    githubBranch: branch,
    status: 'preparing',
    buildStatus: 'uploaded',
    currentStep: 'ZIP received',
    generatedSite: {
      uploadId,
      uploadedFileName: file.originalname,
      uploadedBytes: file.size,
      siteDir,
      githubTargetRoot: targetRoot,
    },
    environmentConfiguration: { sourceRepository: sourceRepo || '', branch, rootDirectory: targetRoot },
  });

  try {
    await addDeploymentLog(deployment.deploymentId, `ZIP upload received: ${file.originalname}.`, 'info');
    const extracted = await extractZipSafely(file.buffer, siteDir);
    const detected = await detectProject(siteDir, extracted.files);
    const shell = await writeRenderBuildScript(siteDir, detected);
    const manifest = await writeManifest(siteDir, deployment.deploymentId, uploadId, file.originalname, targetRoot, sourceRepo, branch, detected, extracted);

    const serviceType = fields.serviceType || detected.serviceType;
    const outputDirectory = fields.outputDirectory || fields.publishDirectory || detected.publishDirectory || 'dist';
    const useTemporaryRepo = shouldUseTemporaryRepo(fields);
    let activeSourceRepo = sourceRepo;
    let activeTargetRoot = targetRoot;
    let renderInput = buildRenderInput(fields, siteName, serviceType, activeSourceRepo, branch, activeTargetRoot, shell, outputDirectory, detected, initialPlan);
    let baseUpdate = buildBaseUpdate(deployment, serviceType, activeSourceRepo, branch, activeTargetRoot, renderInput, detected, extracted, manifest);

    await addDeploymentLog(deployment.deploymentId, `Detected ${detected.framework} (${detected.type}) and prepared ${extracted.files.length} deployable files.`, 'info');

    if (!useTemporaryRepo && !hasRealValue(sourceRepo)) {
      return ready(deployment.deploymentId, baseUpdate, 'Ready - missing generated-sites repo', 'Configure RENDER_GENERATED_SITES_REPO_URL before Render can deploy ZIP source.');
    }
    if (!cfg.githubPublisherConfigured) {
      return ready(deployment.deploymentId, baseUpdate, 'Ready - missing GitHub publisher token', `Configure ${cfg.missingGithubPublisher.join(', ')} before Render can deploy ZIP source.`);
    }

    let githubPublish;
    if (useTemporaryRepo) {
      const tempRepo = await publishDirectoryToTemporaryRepo({
        directory: siteDir,
        slug,
        branch,
        token: cfg.githubPublisherToken,
        owner: fields.temporaryRepoOwner || fields.githubOwner,
        name: fields.temporaryRepoName,
        privateRepo: fields.temporaryRepoPrivate !== false && fields.temporaryRepoPrivate !== 'false',
      });
      activeSourceRepo = tempRepo.repoUrl;
      activeTargetRoot = '';
      githubPublish = tempRepo.githubPublish;
      renderInput = buildRenderInput(fields, siteName, serviceType, activeSourceRepo, tempRepo.branch || branch, activeTargetRoot, shell, outputDirectory, detected, initialPlan);
      baseUpdate = buildBaseUpdate(deployment, serviceType, activeSourceRepo, tempRepo.branch || branch, activeTargetRoot, renderInput, detected, extracted, manifest);
      baseUpdate.generatedSite.temporaryRepo = {
        repoUrl: tempRepo.repoUrl,
        fullName: tempRepo.fullName,
        private: tempRepo.private,
        archived: tempRepo.archived,
      };
    } else {
      githubPublish = await publishDirectoryToGithub({
        directory: siteDir,
        targetRoot,
        repoUrl: sourceRepo,
        branch,
        token: cfg.githubPublisherToken,
        rootDispatcher: writeRootDispatcherScript,
      });
    }
    baseUpdate.generatedSite.githubPublish = githubPublish;
    await addDeploymentLog(deployment.deploymentId, `Published ${githubPublish.published.length} files to GitHub.`, 'ok');

    if (!renderApiService.configured()) {
      return ready(deployment.deploymentId, baseUpdate, 'Ready - missing Render credentials', `Configure ${cfg.missingRender.join(', ')} to start Render deployment.`);
    }

    const renderResult = await createAndTriggerRenderDeploy({ ...renderInput, siteSlug: slug });
    await addDeploymentLog(deployment.deploymentId, `Render deploy ${renderResult.deployId} started.`, 'ok');
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
    await addDeploymentLog(deployment.deploymentId, error.message || 'ZIP deploy failed.', 'error', error.details || null);
    return updateDeploymentRecord(deployment.deploymentId, {
      status: 'failed',
      buildStatus: 'failed',
      currentStep: stageToStep(error.stage),
      errorMessage: error.message || 'ZIP deploy failed.',
      errorDetails: error.details || null,
    });
  }
}

export async function runFromBase64(input) {
  return deployZipSite(input);
}

class ZipDeploymentPipelineService {
  async create(input = {}, context = {}) {
    return run(input, context);
  }
}

function buildRenderInput(fields, siteName, serviceType, sourceRepo, branch, targetRoot, shell, outputDirectory, detected, initialPlan = 'free') {
  return {
    serviceName: renderSafeName(siteName),
    serviceType,
    repoUrl: sourceRepo,
    repositoryUrl: sourceRepo,
    sourceReference: sourceRepo,
    branch,
    rootDirectory: targetRoot,
    buildCommand: fields.buildCommand || shell.buildCommand,
    outputDirectory,
    publishDirectory: outputDirectory,
    startCommand: fields.startCommand || detected.startCommand || detected.detectedStartCommand || '',
    runtime: fields.runtime || detected.runtime || '',
    plan: initialPlan,
    region: fields.region || 'oregon',
    framework: detected.framework,
  };
}

function buildBaseUpdate(deployment, serviceType, sourceRepo, branch, targetRoot, renderInput, detected, extracted, manifest) {
  return {
    serviceType,
    repoUrl: sourceRepo || null,
    githubRepo: sourceRepo || null,
    githubBranch: branch,
    generatedSite: {
      ...deployment.generatedSite,
      framework: detected.framework,
      projectType: detected.type,
      files: extracted.files,
      ignoredFiles: extracted.ignoredFiles,
      sourceArtifact: manifest,
    },
    environmentConfiguration: {
      sourceRepository: sourceRepo || '',
      branch,
      rootDirectory: targetRoot,
      buildCommand: renderInput.buildCommand,
      outputDirectory: renderInput.outputDirectory,
      startCommand: renderInput.startCommand || '',
      runtime: renderInput.runtime || '',
      plan: renderInput.plan,
      region: renderInput.region,
    },
  };
}

async function writeManifest(siteDir, deploymentId, uploadId, originalName, targetRoot, sourceRepo, branch, detected, extracted) {
  const manifest = {
    deploymentId,
    uploadId,
    source: 'zip-upload',
    originalName,
    targetRoot,
    sourceRepo,
    branch,
    detected,
    files: extracted.files,
    ignoredCount: extracted.ignoredFiles.length,
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(path.join(siteDir, 'glondia-upload-artifact.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

async function ready(deploymentId, baseUpdate, step, message) {
  await addDeploymentLog(deploymentId, message, 'warn');
  return updateDeploymentRecord(deploymentId, {
    ...baseUpdate,
    status: 'ready',
    buildStatus: 'configuration_required',
    currentStep: step,
    errorMessage: message,
  });
}

function stageToStep(stage) {
  return {
    zip_upload: 'ZIP upload failed',
    zip_validation: 'ZIP validation failed',
    zip_extract: 'ZIP extraction failed',
    project_detection: 'Project detection failed',
    github_push: 'GitHub publish failed',
    render_service_create: 'Render service creation failed',
    render_deploy_trigger: 'Render deploy trigger failed',
  }[stage] || 'Failed';
}

export default new ZipDeploymentPipelineService();
