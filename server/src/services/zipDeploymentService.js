import fs from 'node:fs/promises';
import path from 'node:path';
import renderApiService from './renderApiService.js';
import { extractZipSafely } from './zipExtractor.js';
import { detectProject } from './projectDetector.js';
import { writeRenderBuildScript, writeRootDispatcherScript } from './buildScriptWriter.js';
import { publishDirectoryToGithub } from './githubPublisher.js';
import { getRuntimeConfig, hasRealValue, normalizeRoot } from './runtimeConfig.js';
import { addDeploymentLog, createDeploymentRecord, renderSafeName, serviceUrl, updateDeploymentRecord } from './deploymentRecordStore.js';

const dataDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), '.glondia-data'));

class ZipDeploymentService {
  async create({ file, fields = {} } = {}, context = {}) {
    if (!file?.buffer) throw stageError('A ZIP file is required. Send multipart/form-data with field name zip or file.', 'zip_upload', 400);

    const cfg = getRuntimeConfig();
    const siteName = fields.serviceName || fields.siteName || String(file.originalname || 'uploaded-site').replace(/\.zip$/i, '');
    const slug = fields.slug || renderSafeName(siteName);
    const uploadId = `zip_${Date.now()}`;
    const siteDir = path.resolve(dataDir, 'uploaded-sites', uploadId);
    const targetRoot = normalizeRoot(fields.rootDirectory || path.posix.join(cfg.generatedSitesRootDir, slug)) || path.posix.join('uploaded-sites', slug);
    const sourceRepo = fields.repoUrl || fields.repositoryUrl || cfg.generatedSitesRepo;
    const branch = fields.branch || process.env.GITHUB_DEFAULT_BRANCH || 'main';

    const deployment = await createDeploymentRecord({
      userId: context.userId,
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
      generatedSite: { uploadId, uploadedFileName: file.originalname, uploadedBytes: file.size, siteDir, githubTargetRoot: targetRoot },
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
      const renderInput = buildRenderInput(fields, siteName, serviceType, sourceRepo, branch, targetRoot, shell, outputDirectory, detected);
      const baseUpdate = buildBaseUpdate(deployment, serviceType, sourceRepo, branch, targetRoot, renderInput, detected, extracted, manifest);

      await addDeploymentLog(deployment.deploymentId, `Detected ${detected.framework} (${detected.type}) and prepared ${extracted.files.length} deployable files.`, 'info');

      if (!hasRealValue(sourceRepo)) return ready(deployment.deploymentId, baseUpdate, 'Ready — missing generated-sites repo', 'Configure RENDER_GENERATED_SITES_REPO_URL before Render can deploy ZIP source.');
      if (!cfg.githubPublisherConfigured) return ready(deployment.deploymentId, baseUpdate, 'Ready — missing GitHub publisher token', `Configure ${cfg.missingGithubPublisher.join(', ')} before Render can deploy ZIP source.`);

      const githubPublish = await publishDirectoryToGithub({ directory: siteDir, targetRoot, repoUrl: sourceRepo, branch, token: cfg.githubPublisherToken, rootDispatcher: writeRootDispatcherScript });
      baseUpdate.generatedSite.githubPublish = githubPublish;
      await addDeploymentLog(deployment.deploymentId, `Published ${githubPublish.published.length} files to GitHub.`, 'ok');

      if (!renderApiService.configured()) return ready(deployment.deploymentId, baseUpdate, 'Ready — missing Render credentials', `Configure ${cfg.missingRender.join(', ')} to start Render deployment.`);

      // Pass site slug so Render service gets GLONDIA_SITE_SLUG env var —
      // the root dispatcher uses it if rootDir is ever missing on the service.
      const serviceResponse = await renderApiService.createService({ ...renderInput, siteSlug: slug });
      const renderServiceId = serviceResponse?.service?.id || serviceResponse?.id || null;
      if (!renderServiceId) throw stageError('Render did not return a service ID.', 'render_service_create', 502, serviceResponse);

      const deployResponse = await renderApiService.triggerDeploy(renderServiceId);
      const renderDeployId = deployResponse?.deploy?.id || deployResponse?.id || null;
      if (!renderDeployId) throw stageError('Render did not return a deploy ID.', 'render_deploy_trigger', 502, deployResponse);

      await addDeploymentLog(deployment.deploymentId, `Render deploy ${renderDeployId} started.`, 'ok');
      return updateDeploymentRecord(deployment.deploymentId, {
        ...baseUpdate,
        status: 'building',
        buildStatus: 'queued',
        currentStep: 'Queued in Render',
        renderServiceId,
        renderDeployId,
        providerStatus: deployResponse?.deploy?.status || deployResponse?.status || 'created',
        liveUrl: serviceUrl(serviceResponse),
        render: { serviceResponse, deployResponse },
        errorMessage: null,
      });
    } catch (error) {
      await addDeploymentLog(deployment.deploymentId, error.message || 'ZIP deploy failed.', 'error', error.details || null);
      return updateDeploymentRecord(deployment.deploymentId, { status: 'failed', buildStatus: 'failed', currentStep: stageToStep(error.stage), errorMessage: error.message || 'ZIP deploy failed.', errorDetails: error.details || null });
    }
  }
}

function buildRenderInput(fields, siteName, serviceType, sourceRepo, branch, targetRoot, shell, outputDirectory, detected) {
  return { serviceName: renderSafeName(siteName), serviceType, repoUrl: sourceRepo, repositoryUrl: sourceRepo, sourceReference: sourceRepo, branch, rootDirectory: targetRoot, buildCommand: fields.buildCommand || shell.buildCommand, outputDirectory, publishDirectory: outputDirectory, startCommand: fields.startCommand || detected.startCommand || detected.detectedStartCommand || '', runtime: fields.runtime || detected.runtime || '', plan: fields.plan || 'starter', region: fields.region || 'oregon', framework: detected.framework };
}

function buildBaseUpdate(deployment, serviceType, sourceRepo, branch, targetRoot, renderInput, detected, extracted, manifest) {
  return { serviceType, repoUrl: sourceRepo || null, githubRepo: sourceRepo || null, githubBranch: branch, generatedSite: { ...deployment.generatedSite, framework: detected.framework, projectType: detected.type, files: extracted.files, ignoredFiles: extracted.ignoredFiles, sourceArtifact: manifest }, environmentConfiguration: { sourceRepository: sourceRepo || '', branch, rootDirectory: targetRoot, buildCommand: renderInput.buildCommand, outputDirectory: renderInput.outputDirectory, startCommand: renderInput.startCommand || '', runtime: renderInput.runtime || '', plan: renderInput.plan, region: renderInput.region } };
}

async function writeManifest(siteDir, deploymentId, uploadId, originalName, targetRoot, sourceRepo, branch, detected, extracted) {
  const manifest = { deploymentId, uploadId, source: 'zip-upload', originalName, targetRoot, sourceRepo, branch, detected, files: extracted.files, ignoredCount: extracted.ignoredFiles.length, createdAt: new Date().toISOString() };
  await fs.writeFile(path.join(siteDir, 'glondia-upload-artifact.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

async function ready(deploymentId, baseUpdate, step, message) {
  await addDeploymentLog(deploymentId, message, 'warn');
  return updateDeploymentRecord(deploymentId, { ...baseUpdate, status: 'ready', buildStatus: 'configuration_required', currentStep: step, errorMessage: message });
}

function stageError(message, stage, status = 400, details = null) {
  const error = new Error(message);
  error.status = status;
  error.stage = stage;
  error.details = details;
  error.expose = true;
  return error;
}

function stageToStep(stage) {
  return { zip_upload: 'ZIP upload failed', zip_validation: 'ZIP validation failed', zip_extract: 'ZIP extraction failed', project_detection: 'Project detection failed', github_push: 'GitHub publish failed', render_service_create: 'Render service creation failed', render_deploy_trigger: 'Render deploy trigger failed' }[stage] || 'Failed';
}

export default new ZipDeploymentService();
