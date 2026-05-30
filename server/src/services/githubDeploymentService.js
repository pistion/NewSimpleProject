import renderApiService from './renderApiService.js';
import { makeId, mutateHostingStore, nowIso } from './hostingStore.js';

class GithubDeploymentService {
  async create(input = {}, context = {}) {
    const repoUrl = input.repoUrl || input.repositoryUrl || input.sourceRepository || input.sourceReference;
    if (!repoUrl) throw requestError('repoUrl is required.', 400, 'github_repo_validate');

    const serviceName = renderSafeName(input.serviceName || input.name || repoName(repoUrl));
    const serviceType = input.serviceType || (input.startCommand ? 'web_service' : 'static_site');
    const branch = input.branch || input.productionBranch || 'main';
    const deployment = await createDeploymentRecord({ userId: context.userId, siteId: input.siteId, projectId: input.projectId || input.siteId, serviceName, serviceType, repoUrl, githubBranch: branch, environmentConfiguration: { sourceRepository: repoUrl, branch, rootDirectory: input.rootDirectory || '', buildCommand: input.buildCommand || null, startCommand: input.startCommand || null, outputDirectory: input.outputDirectory || input.publishDirectory || null, runtime: input.runtime || input.env || null, plan: input.plan || 'starter', region: input.region || 'oregon' } });
    await addLog(deployment.deploymentId, `Creating Render service from GitHub source: ${repoUrl}.`, 'info');

    try {
      if (!renderApiService.configured()) {
        const settings = renderApiService.settings();
        return updateDeployment(deployment.deploymentId, { status: 'ready', buildStatus: 'configuration_required', currentStep: 'Ready — missing Render credentials', errorMessage: `Configure ${settings.required.join(', ')} to deploy this GitHub repo to Render.`, errorDetails: settings });
      }
      const serviceResponse = await renderApiService.createService({ ...input, serviceName, serviceType, repoUrl, repositoryUrl: repoUrl, sourceReference: repoUrl, branch });
      const renderServiceId = serviceResponse?.service?.id || serviceResponse?.id || null;
      if (!renderServiceId) throw stageError('Render did not return a service ID.', 'render_service_create', 502, serviceResponse);
      const deployResponse = await renderApiService.triggerDeploy(renderServiceId, input);
      const renderDeployId = deployResponse?.deploy?.id || deployResponse?.id || null;
      if (!renderDeployId) throw stageError('Render did not return a deploy ID.', 'render_deploy_trigger', 502, deployResponse);
      await addLog(deployment.deploymentId, `Render deploy ${renderDeployId} started.`, 'ok', { renderServiceId });
      return updateDeployment(deployment.deploymentId, { renderServiceId, renderDeployId, render: { serviceResponse, deployResponse }, providerStatus: deployResponse?.deploy?.status || deployResponse?.status || 'created', status: 'building', buildStatus: 'queued', currentStep: 'Queued in Render', liveUrl: serviceUrl(serviceResponse), errorMessage: null });
    } catch (error) {
      await addLog(deployment.deploymentId, error.message || 'GitHub deployment failed.', 'error', error.details || null);
      return updateDeployment(deployment.deploymentId, { status: 'failed', buildStatus: 'failed', currentStep: stageToStep(error.stage || 'render_service_create'), errorMessage: error.message || 'GitHub deployment failed.', errorDetails: error.details || null });
    }
  }
}

async function createDeploymentRecord(input = {}) {
  const now = nowIso();
  const deploymentId = makeId('dep');
  const deploymentSessionId = makeId('session');
  const deployment = { deploymentId, id: deploymentId, deploymentSessionId, userId: input.userId, siteId: input.siteId || null, projectId: input.projectId || input.siteId || null, renderServiceId: null, renderDeployId: null, serviceName: input.serviceName || 'glondia-site', serviceType: input.serviceType || 'static_site', provider: 'render', providerStatus: 'accepted', status: 'preparing', buildStatus: 'queued', currentStep: 'Creating Render service', liveUrl: null, verifiedUrl: null, urlReachable: false, errorMessage: null, repoUrl: input.repoUrl || null, githubRepo: input.repoUrl || null, githubBranch: input.githubBranch || 'main', source: 'github', sourceReference: input.repoUrl || null, platformDeployed: true, environmentVariablesMetadata: [], diskMetadata: [], domainMetadata: [], deploymentLogsReference: deploymentId, render: null, createdAt: now, updatedAt: now, lastDeployedAt: null, environmentConfiguration: input.environmentConfiguration || {} };
  const session = { deploymentSessionId, deploymentId, userId: input.userId, projectId: input.projectId || input.siteId || null, status: 'started', animationState: 'deploying', createdAt: now, updatedAt: now };
  return mutateHostingStore((store) => { store.sessions.unshift(session); store.deployments.unshift(deployment); store.logs[deploymentId] = [makeLog('Deployment session created.', 'info')]; return deployment; });
}
async function updateDeployment(deploymentId, patch = {}) { return mutateHostingStore((store) => { const deployment = store.deployments.find((item) => item.deploymentId === deploymentId || item.id === deploymentId); if (!deployment) return null; Object.assign(deployment, patch, { updatedAt: nowIso() }); return deployment; }); }
async function addLog(deploymentId, message, level = 'info', details = null) { return mutateHostingStore((store) => { store.logs[deploymentId] = [makeLog(message, level, details), ...(store.logs[deploymentId] || [])]; return store.logs[deploymentId][0]; }); }
function makeLog(message, level = 'info', details = null) { return { id: makeId('log'), level, message, details: details || undefined, timestamp: nowIso(), createdAt: nowIso() }; }
function renderSafeName(value) { return String(value || 'glondia-site').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'glondia-site'; }
function repoName(url) { return (String(url || '').match(/github\.com[:/]([^/]+)\/([^/.#?]+)/i)?.[2] || 'glondia-github-site').replace(/\.git$/i, ''); }
function requestError(message, status, stage) { const error = new Error(message); error.status = status; error.stage = stage; error.expose = true; return error; }
function stageError(message, stage, status, details) { const error = new Error(message); error.status = status; error.stage = stage; error.details = details; error.expose = true; return error; }
function serviceUrl(serviceResponse) { return serviceResponse?.service?.serviceDetails?.url || serviceResponse?.serviceDetails?.url || serviceResponse?.service?.url || serviceResponse?.url || null; }
function stageToStep(stage) { return { github_repo_validate: 'GitHub repo validation failed', render_service_create: 'Render service creation failed', render_deploy_trigger: 'Render deploy trigger failed' }[stage] || 'Failed'; }
export default new GithubDeploymentService();
