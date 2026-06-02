/**
 * zipToRender.pipeline.js
 *
 * ZIP -> GitHub generated-sites repo -> Render pipeline.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import renderApiService from '../../../services/renderApiService.js';
import { normalizeZipUploadInput } from '../01-ZIP-INTAKE-MOUNTAIN/zipUpload.intake.js';
import { extractZipSafely } from '../02-UNZIP-AND-DETECT-MOUNTAIN/zipExtractor.stage.js';
import { detectProject } from '../02-UNZIP-AND-DETECT-MOUNTAIN/projectDetector.stage.js';
import { writeRenderBuildScript, writeRootDispatcherScript } from '../02-UNZIP-AND-DETECT-MOUNTAIN/buildScriptWriter.stage.js';
import { resolveDeployMode } from '../02-UNZIP-AND-DETECT-MOUNTAIN/deployModeResolver.stage.js';
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
import { startPostDeployPolling } from '../../../services/deploymentPostDeployPoller.js';

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
    // Resolve the deploy mode (auto unless the user picked one) and let it drive
    // the build script and Render service settings.
    const resolvedMode = resolveDeployMode({
      detected,
      selectedMode: fields.deployMode || fields.mode || 'auto',
      fields,
      files: extracted.files,
    });
    const shell = await writeRenderBuildScript(siteDir, {
      ...detected,
      serviceType: resolvedMode.serviceType,
      detectedBuildCommand: resolvedMode.buildCommand,
      publishDirectory: resolvedMode.publishDirectory,
    });
    const manifest = await writeManifest(siteDir, deployment.deploymentId, uploadId, file.originalname, targetRoot, sourceRepo, branch, detected, extracted);

    const serviceType = fields.serviceType || resolvedMode.serviceType;
    const outputDirectory = fields.outputDirectory || fields.publishDirectory || resolvedMode.publishDirectory || 'dist';
    // Root base the site source is published under (targetRoot === `${rootBase}/${slug}`).
    // The root dispatcher and GLONDIA_SITE_ROOT_DIR env var must use this same base
    // so a shared-repo deploy published under generated-sites/foo is found there.
    const dirOfTarget = path.posix.dirname(String(targetRoot || ''));
    const rootBase = (!dirOfTarget || dirOfTarget === '.')
      ? (cfg.generatedSitesRootDir || 'uploaded-sites')
      : dirOfTarget;
    const useTemporaryRepo = shouldUseTemporaryRepo(fields);
    let activeSourceRepo = sourceRepo;
    let activeTargetRoot = targetRoot;
    let renderInput = buildRenderInput(fields, siteName, serviceType, activeSourceRepo, branch, activeTargetRoot, shell, outputDirectory, detected, initialPlan);
    let baseUpdate = buildBaseUpdate(deployment, serviceType, activeSourceRepo, branch, activeTargetRoot, renderInput, detected, extracted, manifest);
    // Record the resolved deploy mode + warnings so the dashboard can show them.
    baseUpdate.deployMode = resolvedMode.mode;
    baseUpdate.deployModeConfidence = resolvedMode.confidence;
    baseUpdate.deployModeWarnings = resolvedMode.warnings;
    baseUpdate.environmentConfiguration.deployMode = resolvedMode.mode;
    baseUpdate.environmentConfiguration.deployModeConfidence = resolvedMode.confidence;
    if (resolvedMode.warnings.length) {
      await addDeploymentLog(deployment.deploymentId, `Deploy mode "${resolvedMode.mode}": ${resolvedMode.warnings.join(' ')}`, 'warn');
    }

    await addDeploymentLog(deployment.deploymentId, `Detected ${detected.framework} (${detected.type}) and prepared ${extracted.files.length} deployable files.`, 'info');
    if (detected.envHints?.requiredEnv?.length) {
      await addDeploymentLog(
        deployment.deploymentId,
        `Detected required env hints: ${detected.envHints.requiredEnv.join(', ')}. Set these on the service before the app can run correctly.`,
        detected.envHints.riskLevel === 'high' ? 'warn' : 'info',
        { envHints: detected.envHints },
      );
    }

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
        // Bind the dispatcher to the SAME root base used for targetRoot so it
        // looks under generated-sites/<slug>, not the hardcoded uploaded-sites.
        rootDispatcher: (dir) => writeRootDispatcherScript(dir, { rootBase }),
      });
    }
    baseUpdate.generatedSite.githubPublish = githubPublish;
    await addDeploymentLog(deployment.deploymentId, `Published ${githubPublish.published.length} files to GitHub.`, 'ok');

    if (!renderApiService.configured()) {
      return ready(deployment.deploymentId, baseUpdate, 'Ready - missing Render credentials', `Configure ${cfg.missingRender.join(', ')} to start Render deployment.`);
    }

    await addDeploymentLog(deployment.deploymentId, 'Render configured — creating service and triggering deploy.', 'info');
    // For shared-repo mode the dispatcher needs the root base; for a temporary
    // repo the site lives at the repo root so no root base is sent.
    const renderResult = await createAndTriggerRenderDeploy({
      ...renderInput,
      siteSlug: slug,
      ...(useTemporaryRepo ? {} : { siteRootDir: rootBase }),
    });
    await addDeploymentLog(deployment.deploymentId, `Deploy ${renderResult.deployId} started.`, 'ok');
    await addDeploymentLog(deployment.deploymentId, `Render service ${renderResult.serviceId} created and deploy ${renderResult.deployId} triggered.`, 'ok');
    const updated = await updateDeploymentRecord(deployment.deploymentId, {
      ...baseUpdate,
      // Render handoff succeeded → this is a real, billable platform deployment.
      platformDeployed: true,
      status: 'building',
      buildStatus: 'queued',
      currentStep: 'Queued for deploy',
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
    // Kick off a background monitor so the record advances to live/failed
    // without waiting for the user to open the dashboard. Non-blocking.
    startPostDeployPolling(deployment.deploymentId);
    return updated;
  } catch (error) {
    await addDeploymentLog(deployment.deploymentId, error.message || 'ZIP deploy failed.', 'error', error.details || null);
    return updateDeploymentRecord(deployment.deploymentId, {
      // Never reached Render → not billable, no trial timer.
      platformDeployed: false,
      status: 'failed',
      buildStatus: 'failed',
      currentStep: stageToStep(error.stage),
      paymentStatus: 'not_billable_yet',
      subscriptionStatus: 'not_started',
      errorMessage: error.message || 'ZIP deploy failed.',
      errorDetails: error.details || null,
    });
  }
}

export async function runFromBase64(input) {
  const { deployZipSite } = await import('./base64ZipToRender.pipeline.js');
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
    // Prepared but NOT handed off to Render → not billable, no trial timer.
    platformDeployed: false,
    status: 'ready',
    buildStatus: 'configuration_required',
    currentStep: step,
    paymentStatus: 'not_billable_yet',
    subscriptionStatus: 'not_started',
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
