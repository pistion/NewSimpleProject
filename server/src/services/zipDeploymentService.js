import fs from 'node:fs/promises';
import path from 'node:path';
import renderApiService from './renderApiService.js';
import { makeId, mutateHostingStore, nowIso } from './hostingStore.js';
import { extractZipSafely } from './zipExtractor.js';
import { detectProject } from './projectDetector.js';
import { writeRenderBuildScript } from './buildScriptWriter.js';
import { publishDirectoryToGithub } from './githubPublisher.js';
import { getRuntimeConfig, hasRealValue, normalizeRoot } from './runtimeConfig.js';

const dataDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), '.glondia-data'));

class ZipDeploymentService {
  async create({ file, fields = {} } = {}, context = {}) {
    if (!file?.buffer) throw requestError('A ZIP file is required. Send multipart/form-data with field name zip or file.', 400, 'zip_upload');

    const cfg = getRuntimeConfig();
    const siteName = fields.serviceName || fields.siteName || String(file.originalname || 'uploaded-site').replace(/\.zip$/i, '');
    const slug = fields.slug || renderSafeName(siteName);
    const uploadId = makeId('zip');
    const siteDir = path.resolve(dataDir, 'uploaded-sites', uploadId);
    const targetRoot = normalizeRoot(fields.rootDirectory || path.posix.join(cfg.generatedSitesRootDir, slug)) || path.posix.join('uploaded-sites', slug);
    const sourceRepo = fields.repoUrl || fields.repositoryUrl || cfg.generatedSitesRepo;
    const branch = fields.branch || process.env.GITHUB_DEFAULT_BRANCH || 'main';

    const deployment = await createDeploymentRecord({
      userId: context.userId,
      siteId: fields.siteId || null,
      projectId: fields.projectId || fields.siteId || null,
      serviceName: renderSafeName(siteName),
      sourceReference: file.originalname,
      repoUrl: sourceRepo || null,
      githubBranch: branch,
      status: 'preparing',
      buildStatus: 'uploaded',
      currentStep: 'ZIP received',
      generatedSite: { uploadId, uploadedFileName: file.originalname, uploadedBytes: file.size, siteDir, githubTargetRoot: targetRoot },
      environmentConfiguration: { sourceRepository: sourceRepo || '', branch, rootDirectory: targetRoot },
    });

    await addLog(deployment.deploymentId, `ZIP upload received: ${file.originalname} (${file.size || file.buffer.length} bytes).`, 'info');

    try {
      const extracted = await extractZipSafely(file.buffer, siteDir);
      await addLog(deployment.deploymentId, `Raw ZIP entries: ${extracted.rawEntryCount}. Ignored: ${extracted.ignoredFiles.length}. Deployable: ${extracted.files.length}.`, 'info');

      const detected = await detectProject(siteDir, extracted.files);
      const shell = await writeRenderBuildScript(siteDir, detected);
      await addLog(deployment.deploymentId, `Detected ${detected.framework} (${detected.type}) as ${detected.serviceType}.`, 'info');

      const manifest = {
        deploymentId: deployment.deploymentId,
        uploadId,
        source: 'zip-upload',
        originalName: file.originalname,
        targetRoot,
        sourceRepo,
        branch,
        detected,
        files: extracted.files,
        ignoredCount: extracted.ignoredFiles.length,
        createdAt: nowIso(),
      };
      await fs.writeFile(path.join(siteDir, 'glondia-upload-artifact.json'), JSON.stringify(manifest, null, 2));

      const serviceType = fields.serviceType || detected.serviceType;
      const outputDirectory = fields.outputDirectory || fields.publishDirectory || detected.publishDirectory || 'dist';
      const renderInput = {
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
        plan: fields.plan || 'starter',
        region: fields.region || 'oregon',
        framework: detected.framework,
      };

      const baseUpdate = {
        serviceType,
        repoUrl: sourceRepo || null,
        githubRepo: sourceRepo || null,
        githubBranch: branch,
        generatedSite: { ...deployment.generatedSite, framework: detected.framework, projectType: detected.type, files: extracted.files, ignoredFiles: extracted.ignoredFiles, sourceArtifact: manifest },
        environmentConfiguration: {
          sourceRepository: sourceRepo || '', branch, rootDirectory: targetRoot,
          buildCommand: renderInput.buildCommand, outputDirectory, startCommand: renderInput.startCommand || '',
          runtime: renderInput.runtime || '', plan: renderInput.plan, region: renderInput.region,
        },
      };

      if (!hasRealValue(sourceRepo)) {
        await addLog(deployment.deploymentId, 'ZIP extracted but generated-sites GitHub repo is not configured.', 'warn');
        return updateDeployment(deployment.deploymentId, { ...baseUpdate, status: 'ready', buildStatus: 'extracted', currentStep: 'Ready — missing generated-sites repo', errorMessage: 'Configure RENDER_GENERATED_SITES_REPO_URL before Render can deploy ZIP source.' });
      }

      if (!cfg.githubPublisherConfigured) {
        await addLog(deployment.deploymentId, 'ZIP extracted but GitHub publisher is not configured.', 'warn');
        return updateDeployment(deployment.deploymentId, { ...baseUpdate, status: 'ready', buildStatus: 'extracted', currentStep: 'Ready — missing GitHub publisher token', errorMessage: `Configure ${cfg.missingGithubPublisher.join(', ')} before Render can deploy ZIP source.` });
      }

      const githubPublish = await publishDirectoryToGithub({ directory: siteDir, targetRoot, repoUrl: sourceRepo, branch, token: cfg.githubPublisherToken });
      await addLog(deployment.deploymentId, `Published ${githubPublish.published.length} files to GitHub at ${githubPublish.repo}/${targetRoot}.`, 'ok');
      baseUpdate.generatedSite.githubPublish = githubPublish;

      if (!renderApiService.configured()) {
        await addLog(deployment.deploymentId, 'Files published to GitHub. Render deploy skipped because Render credentials are missing.', 'warn');
        return updateDeployment(deployment.deploymentId, { ...baseUpdate, status: 'ready', buildStatus: 'published', currentStep: 'Ready — missing Render credentials', errorMessage: `Configure ${cfg.missingRender.join(', ')} to start Render deployment.` });
      }

      const serviceResponse = await renderApiService.createService(renderInput);
      const renderServiceId = serviceResponse?.service?.id || serviceResponse?.id || null;
      if (!renderServiceId) throw stageError('Render did not return a service ID.', 'render_service_create', 502, serviceResponse);

      const deployResponse = await renderApiService.triggerDeploy(renderServiceId);
      const renderDeployId = deployResponse?.deploy?.id || deployResponse?.id || null;
      if (!renderDeployId) throw stageError('Render did not return a deploy ID.', 'render_deploy_trigger', 502, deployResponse);

      await addLog(deployment.deploymentId, `Render deploy ${renderDeployId} started.`, 'ok', { renderServiceId });
      return updateDeployment(deployment.deploymentId, { ...baseUpdate, status: 'building', buildStatus: 'queued', currentStep: 'Queued in Render', renderServiceId, renderDeployId, providerStatus: deployResponse?.deploy?.status || deployResponse?.status || 'created', liveUrl: serviceUrl(serviceResponse), render: { serviceResponse, deployResponse }, errorMessage: null });
    } catch (error) {
      await addLog(deployment.deploymentId, error.message || 'ZIP deploy failed.', 'error', error.details || null);
      return updateDeployment(deployment.deploymentId, { status: 'failed', buildStatus: 'failed', currentStep: stageToStep(error.stage || 'zip_upload'), errorMessage: error.message || 'ZIP deploy failed.', errorDetails: error.details || null });
    }
  }
}

async function createDeploymentRecord(input = {}) {
  const now = nowIso();
  const deploymentId = makeId('dep');
  const deploymentSessionId = makeId('session');
  const deployment = {
    deploymentId, id: deploymentId, deploymentSessionId, userId: input.userId, siteId: input.siteId || null,
    projectId: input.projectId || input.siteId || null, renderServiceId: null, renderDeployId: null,
    serviceName: input.serviceName || 'glondia-site', serviceType: input.serviceType || 'static_site', provider: 'render',
    providerStatus: 'accepted', status: input.status || 'preparing', buildStatus: input.buildStatus || 'queued', currentStep: input.currentStep || 'Preparing',
    liveUrl: null, verifiedUrl: null, urlReachable: false, errorMessage: null,
    repoUrl: input.repoUrl || null, githubRepo: input.repoUrl || null, githubBranch: input.githubBranch || 'main',
    source: 'zip-upload', sourceReference: input.sourceReference || null, generatedSite: input.generatedSite || null,
    environmentVariablesMetadata: [], diskMetadata: [], domainMetadata: [], deploymentLogsReference: deploymentId,
    render: null, createdAt: now, updatedAt: now, lastDeployedAt: null,
    environmentConfiguration: input.environmentConfiguration || {},
  };
  const session = { deploymentSessionId, deploymentId, userId: input.userId, projectId: input.projectId || input.siteId || null, status: 'started', animationState: 'deploying', createdAt: now, updatedAt: now };
  return mutateHostingStore((store) => {
    store.sessions.unshift(session);
    store.deployments.unshift(deployment);
    store.logs[deploymentId] = [makeLog('Deployment session created.', 'info')];
    return deployment;
  });
}

async function updateDeployment(deploymentId, patch = {}) {
  return mutateHostingStore((store) => {
    const deployment = store.deployments.find((item) => item.deploymentId === deploymentId || item.id === deploymentId);
    if (!deployment) return null;
    Object.assign(deployment, patch, { updatedAt: nowIso() });
    return deployment;
  });
}

async function addLog(deploymentId, message, level = 'info', details = null) {
  return mutateHostingStore((store) => {
    store.logs[deploymentId] = [{ id: makeId('log'), level, message, details: details || undefined, timestamp: nowIso(), createdAt: nowIso() }, ...(store.logs[deploymentId] || [])];
    return store.logs[deploymentId][0];
  });
}

function renderSafeName(value) {
  return String(value || 'glondia-site').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'glondia-site';
}

function requestError(message, status, stage) {
  const error = new Error(message);
  error.status = status;
  error.stage = stage;
  error.expose = true;
  return error;
}

function stageError(message, stage, status, details) {
  const error = new Error(message);
  error.status = status;
  error.stage = stage;
  error.details = details;
  error.expose = true;
  return error;
}

function serviceUrl(serviceResponse) {
  return serviceResponse?.service?.serviceDetails?.url || serviceResponse?.serviceDetails?.url || serviceResponse?.service?.url || serviceResponse?.url || null;
}

function stageToStep(stage) {
  const map = { zip_upload: 'ZIP upload failed', zip_validation: 'ZIP validation failed', zip_extract: 'ZIP extraction failed', project_detection: 'Project detection failed', github_push: 'GitHub publish failed', render_service_create: 'Render service creation failed', render_deploy_trigger: 'Render deploy trigger failed' };
  return map[stage] || 'Failed';
}

export default new ZipDeploymentService();
