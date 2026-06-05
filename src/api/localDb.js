import { pulseWorksTemplate } from '../features/builder/templates/html/pulse-works';
import { forgeTemplate } from '../features/builder/templates/html/forge';

const HTML_TEMPLATES = {
  'pulse-works': pulseWorksTemplate,
  forge: forgeTemplate,
};

const LOCAL_DB_KEY = "glondia.localDb.v1";

export function createLocalDbRuntime({ makeSession, ttlToSeconds }) {
  function handleLocalApi(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const body = parseBody(options.body);
    const db = readLocalDb();
    const cleanPath = path.split('?')[0];

    if (cleanPath === '/auth/login' || cleanPath === '/auth/register') return makeSession(body);
    if (cleanPath === '/projects') {
      if (method === 'POST') {
        const project = makeProject(body);
        db.projects.unshift(project);
        db.activity.unshift(makeActivity('project.created', `Created project ${project.name}.`, 'project', project.id));
        writeLocalDb(db);
        return project;
      }
      return db.projects;
    }

    const projectMatch = cleanPath.match(/^\/projects\/([^/]+)$/);
    if (projectMatch) {
      const project = db.projects.find((item) => item.id === projectMatch[1]);
      if (!project) throw new Error('Project not found.');
      if (method === 'PATCH') Object.assign(project, body, { updatedAt: new Date().toISOString() });
      if (method === 'DELETE') Object.assign(project, { status: 'archived', updatedAt: new Date().toISOString() });
      writeLocalDb(db);
      return project;
    }

    const deploymentsMatch = cleanPath.match(/^\/projects\/([^/]+)\/deployments$/);
    if (deploymentsMatch) {
      if (method === 'POST') {
        const deployment = makeDeployment(deploymentsMatch[1], body);
        db.deployments.unshift(deployment);
        db.logs[deployment.id] = [makeLog('Deployment queued.'), makeLog('npm run build completed.'), makeLog('Static artifact ready.')];
        writeLocalDb(db);
        return deployment;
      }
      return db.deployments.filter((item) => item.projectId === deploymentsMatch[1]);
    }

    const deploymentActionMatch = cleanPath.match(/^\/deployments\/([^/]+)\/(cancel|rollback)$/);
    if (deploymentActionMatch) {
      const deployment = db.deployments.find((item) => item.id === deploymentActionMatch[1]);
      if (!deployment) throw new Error('Deployment not found.');
      deployment.status = deploymentActionMatch[2] === 'cancel' ? 'cancelled' : 'rolled_back';
      writeLocalDb(db);
      return deployment;
    }

    const deploymentLogsMatch = cleanPath.match(/^\/deployments\/([^/]+)\/logs$/);
    if (deploymentLogsMatch) return db.logs[deploymentLogsMatch[1]] || [];

    if (cleanPath === '/deployments') {
      if (method === 'POST') {
        ensureHostingCollections(db);
        const deployment = makeRenderDeployment(body);
        db.deployments.unshift(deployment);
        db.hostingServices.unshift(makeHostingServiceFromDeployment(deployment));
        db.logs[deployment.id] = [
          makeLog('Deployment session created.'),
          makeLog('Preparing Glondia hosting environment.'),
          makeLog(`Build queued for ${deployment.serviceName}.`),
        ];
        const site = body.siteId ? db.sites.find((item) => item.id === body.siteId) : null;
        if (site) {
          site.status = 'published';
          site.renderServiceId = deployment.renderServiceId;
          site.liveUrl = deployment.liveUrl;
          site.deploymentSessionId = deployment.deploymentSessionId;
          site.updatedAt = new Date().toISOString();
        }
        writeLocalDb(db);
        return deployment;
      }
      return db.deployments;
    }

    const renderDeploymentMatch = cleanPath.match(/^\/deployments\/([^/]+)$/);
    if (renderDeploymentMatch) {
      const deployment = db.deployments.find((item) => item.id === renderDeploymentMatch[1] || item.deploymentId === renderDeploymentMatch[1]);
      if (!deployment) throw new Error('Deployment not found.');
      return deployment;
    }

    const renderDeploymentStatusMatch = cleanPath.match(/^\/deployments\/([^/]+)\/status$/);
    if (renderDeploymentStatusMatch) {
      const deployment = db.deployments.find((item) => item.id === renderDeploymentStatusMatch[1] || item.deploymentId === renderDeploymentStatusMatch[1]);
      if (!deployment) throw new Error('Deployment not found.');
      deployment.status = deployment.status === 'queued' ? 'building' : deployment.status === 'building' ? 'deployed' : deployment.status;
      deployment.buildStatus = deployment.status === 'deployed' ? 'succeeded' : deployment.status;
      deployment.updatedAt = new Date().toISOString();
      syncHostingServiceFromDeployment(db, deployment);
      writeLocalDb(db);
      return pickDeploymentStatus(deployment);
    }

    const renderVerifyUrlMatch = cleanPath.match(/^\/deployments\/([^/]+)\/verify-url$/);
    if (renderVerifyUrlMatch) {
      const deployment = db.deployments.find((item) => item.id === renderVerifyUrlMatch[1] || item.deploymentId === renderVerifyUrlMatch[1]);
      if (!deployment) throw new Error('Deployment not found.');
      deployment.liveUrl ||= `https://${slugify(deployment.serviceName)}.glondiasites.com`;
      deployment.verifiedUrl = deployment.liveUrl;
      deployment.urlReachable = true;
      deployment.status = 'live';
      deployment.currentStep = 'Live';
      deployment.buildStatus = 'succeeded';
      deployment.errorMessage = null;
      deployment.lastDeployedAt = new Date().toISOString();
      deployment.updatedAt = new Date().toISOString();
      syncHostingServiceFromDeployment(db, deployment);
      writeLocalDb(db);
      return deployment;
    }

    const renderRedeployMatch = cleanPath.match(/^\/deployments\/([^/]+)\/redeploy$/);
    if (renderRedeployMatch) {
      const deployment = db.deployments.find((item) => item.id === renderRedeployMatch[1] || item.deploymentId === renderRedeployMatch[1]);
      if (!deployment) throw new Error('Deployment not found.');
      deployment.status = 'building';
      deployment.buildStatus = 'queued';
      deployment.currentStep = 'Queued';
      deployment.errorMessage = null;
      deployment.renderDeployId = createId('render_deploy');
      deployment.updatedAt = new Date().toISOString();
      deployment.lastDeployedAt = null;
      db.logs[deployment.id] = [makeLog('Redeploy requested.'), ...(db.logs[deployment.id] || [])];
      writeLocalDb(db);
      return deployment;
    }

    if (cleanPath === '/hosting') {
      ensureHostingCollections(db);
      return db.hostingServices || [];
    }

    const hostingServiceMatch = cleanPath.match(/^\/hosting\/([^/]+)$/);
    if (hostingServiceMatch) {
      const service = findHostingService(db, hostingServiceMatch[1]);
      if (!service) throw new Error('Hosting service not found.');
      return service;
    }

    const hostingSettingsMatch = cleanPath.match(/^\/hosting\/([^/]+)\/settings$/);
    if (hostingSettingsMatch) {
      const service = findHostingService(db, hostingSettingsMatch[1]);
      if (!service) throw new Error('Hosting service not found.');
      Object.assign(service.environmentConfiguration, body, { updatedAt: new Date().toISOString() });
      syncDeploymentFromHosting(db, service);
      writeLocalDb(db);
      return service;
    }

    const hostingSuspendMatch = cleanPath.match(/^\/hosting\/([^/]+)\/suspend$/);
    if (hostingSuspendMatch && method === 'POST') {
      const service = findHostingService(db, hostingSuspendMatch[1]);
      if (!service) throw new Error('Hosting service not found.');
      service.status = 'suspended';
      service.currentStep = 'Suspended';
      service.suspendedAt = new Date().toISOString();
      service.updatedAt = new Date().toISOString();
      syncDeploymentFromHosting(db, service);
      writeLocalDb(db);
      return service;
    }

    const hostingDeleteMatch = cleanPath.match(/^\/hosting\/([^/]+)$/);
    if (hostingDeleteMatch && method === 'DELETE') {
      const service = findHostingService(db, hostingDeleteMatch[1]);
      if (!service) throw new Error('Hosting service not found.');
      service.status = 'deleted';
      service.currentStep = 'Deleted';
      service.deletedAt = new Date().toISOString();
      service.updatedAt = new Date().toISOString();
      syncDeploymentFromHosting(db, service);
      writeLocalDb(db);
      return { deleted: true, deploymentId: service.deploymentId };
    }

    const hostingEnvMatch = cleanPath.match(/^\/hosting\/([^/]+)\/env$/);
    if (hostingEnvMatch) {
      const serviceId = hostingEnvMatch[1];
      ensureHostingCollections(db);
      if (method === 'POST') {
        const env = makeHostingEnvVar(body);
        db.hostingEnv[serviceId] = [env, ...(db.hostingEnv[serviceId] || []).filter((item) => item.key !== env.key)];
        syncHostingMetadata(db, serviceId);
        writeLocalDb(db);
        return publicHostingEnvVar(env);
      }
      return (db.hostingEnv[serviceId] || []).map(publicHostingEnvVar);
    }

    const hostingEnvKeyMatch = cleanPath.match(/^\/hosting\/([^/]+)\/env\/([^/]+)$/);
    if (hostingEnvKeyMatch) {
      const serviceId = hostingEnvKeyMatch[1];
      ensureHostingCollections(db);
      const key = decodeURIComponent(hostingEnvKeyMatch[2]).toUpperCase();
      const rows = db.hostingEnv[serviceId] || [];
      const row = rows.find((item) => item.key === key);
      if (method === 'PATCH') {
        const next = makeHostingEnvVar({ ...row, ...body, key });
        db.hostingEnv[serviceId] = [next, ...rows.filter((item) => item.key !== key)];
        syncHostingMetadata(db, serviceId);
        writeLocalDb(db);
        return publicHostingEnvVar(next);
      }
      if (method === 'DELETE') {
        db.hostingEnv[serviceId] = rows.filter((item) => item.key !== key);
        syncHostingMetadata(db, serviceId);
        writeLocalDb(db);
        return { deleted: true };
      }
    }

    const hostingEnvSyncMatch = cleanPath.match(/^\/hosting\/([^/]+)\/env\/sync$/);
    if (hostingEnvSyncMatch && method === 'POST') {
      const serviceId = hostingEnvSyncMatch[1];
      ensureHostingCollections(db);
      db.hostingEnv[serviceId] = (db.hostingEnv[serviceId] || []).map((item) => ({ ...item, renderSynced: true, requiresRedeploy: true, updatedAt: new Date().toISOString() }));
      syncHostingMetadata(db, serviceId);
      writeLocalDb(db);
      return { synced: db.hostingEnv[serviceId].length, requiresRedeploy: db.hostingEnv[serviceId].some((item) => item.requiresRedeploy) };
    }

    const hostingDiskMatch = cleanPath.match(/^\/hosting\/([^/]+)\/disk$/);
    if (hostingDiskMatch) {
      const serviceId = hostingDiskMatch[1];
      ensureHostingCollections(db);
      if (method === 'GET') return db.hostingDisks[serviceId] || [];
      const service = findHostingService(db, serviceId);
      if (service?.serviceType !== 'web_service') throw new Error('Persistent disks are available for web apps, not static sites.');
      const disk = makeHostingDisk(body);
      db.hostingDisks[serviceId] = [disk, ...(db.hostingDisks[serviceId] || [])];
      syncHostingMetadata(db, serviceId);
      writeLocalDb(db);
      return disk;
    }

    const hostingDiskIdMatch = cleanPath.match(/^\/hosting\/([^/]+)\/disk\/([^/]+)$/);
    if (hostingDiskIdMatch) {
      const serviceId = hostingDiskIdMatch[1];
      ensureHostingCollections(db);
      const diskId = hostingDiskIdMatch[2];
      const rows = db.hostingDisks[serviceId] || [];
      const disk = rows.find((item) => item.diskId === diskId);
      if (method === 'PATCH') Object.assign(disk, body, { updatedAt: new Date().toISOString() });
      if (method === 'DELETE') db.hostingDisks[serviceId] = rows.filter((item) => item.diskId !== diskId);
      syncHostingMetadata(db, serviceId);
      writeLocalDb(db);
      return { deleted: method === 'DELETE' };
    }

    const templatesMatch = cleanPath.match(/^\/templates(?:\/([^/]+))?$/);
    if (templatesMatch) {
      const id = templatesMatch[1];
      if (!id) return Object.values(HTML_TEMPLATES);
      const tpl = HTML_TEMPLATES[id];
      if (!tpl) throw new Error('Template not found.');
      return tpl;
    }

    throw new Error(`No local route for ${method} ${cleanPath}`);
  }

  return { handleLocalApi };
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return body;
}

function readLocalDb() {
  try {
    const raw = localStorage.getItem(LOCAL_DB_KEY);
    return raw ? JSON.parse(raw) : seedLocalDb();
  } catch {
    return seedLocalDb();
  }
}

function writeLocalDb(db) {
  localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(db));
}

function seedLocalDb() {
  return {
    projects: [],
    deployments: [],
    logs: {},
    activity: [],
    sites: [],
    hostingServices: [],
    hostingEnv: {},
    hostingDisks: {},
  };
}

function makeProject(body = {}) {
  return {
    id: createId('proj'),
    name: body.name || 'Untitled project',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeDeployment(projectId, body = {}) {
  return {
    id: createId('dep'),
    projectId,
    status: 'queued',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...body,
  };
}

function makeRenderDeployment(body = {}) {
  const name = body.name || body.serviceName || 'glondia-site';
  const serviceName = slugify(name);
  const id = createId('dep');
  return {
    id,
    deploymentId: id,
    siteId: body.siteId || null,
    projectId: body.projectId || body.siteId || id,
    serviceName,
    status: 'queued',
    buildStatus: 'queued',
    currentStep: 'Queued',
    serviceType: body.serviceType || 'static_site',
    sourceReference: body.sourceReference || 'builder',
    environment: body.environment || 'production',
    renderServiceId: createId('render_svc'),
    renderDeployId: createId('render_deploy'),
    deploymentSessionId: createId('session'),
    liveUrl: `https://${serviceName}.glondiasites.com`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeHostingServiceFromDeployment(deployment) {
  return {
    id: deployment.renderServiceId,
    deploymentId: deployment.deploymentId,
    serviceName: deployment.serviceName,
    serviceType: deployment.serviceType,
    status: deployment.status,
    currentStep: deployment.currentStep,
    liveUrl: deployment.liveUrl,
    environmentConfiguration: {},
    createdAt: deployment.createdAt,
    updatedAt: deployment.updatedAt,
  };
}

function syncHostingServiceFromDeployment(db, deployment) {
  ensureHostingCollections(db);
  const service = db.hostingServices.find((item) => item.deploymentId === deployment.deploymentId || item.id === deployment.renderServiceId);
  if (service) {
    service.status = deployment.status;
    service.currentStep = deployment.currentStep;
    service.liveUrl = deployment.liveUrl;
    service.updatedAt = deployment.updatedAt;
  }
}

function syncDeploymentFromHosting(db, service) {
  const deployment = db.deployments.find((item) => item.deploymentId === service.deploymentId || item.renderServiceId === service.id);
  if (deployment) {
    deployment.status = service.status;
    deployment.currentStep = service.currentStep;
    deployment.liveUrl = service.liveUrl;
    deployment.updatedAt = service.updatedAt;
  }
}

function syncHostingMetadata(db, serviceId) {
  const service = findHostingService(db, serviceId);
  if (!service) return;
  service.environmentConfiguration ||= {};
  service.environmentConfiguration.envCount = (db.hostingEnv[serviceId] || []).length;
  service.environmentConfiguration.diskCount = (db.hostingDisks[serviceId] || []).length;
  service.updatedAt = new Date().toISOString();
}

function findHostingService(db, id) {
  ensureHostingCollections(db);
  return db.hostingServices.find((item) => item.id === id || item.deploymentId === id);
}

function ensureHostingCollections(db) {
  db.hostingServices ||= [];
  db.hostingEnv ||= {};
  db.hostingDisks ||= {};
}

function makeHostingEnvVar(body = {}) {
  return {
    id: createId('env'),
    key: String(body.key || '').toUpperCase(),
    value: body.value || '',
    environment: body.environment || 'production',
    isSecret: Boolean(body.isSecret),
    renderSynced: false,
    requiresRedeploy: true,
    updatedAt: new Date().toISOString(),
  };
}

function makeHostingDisk(body = {}) {
  return {
    diskId: createId('disk'),
    name: body.name || 'data',
    mountPath: body.mountPath || '/var/data',
    sizeGb: Number(body.sizeGb || 1),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function publicHostingEnvVar(env) {
  return {
    ...env,
    value: env.isSecret ? '••••••••' : env.value,
  };
}

function pickDeploymentStatus(deployment) {
  return {
    deploymentId: deployment.deploymentId,
    status: deployment.status,
    buildStatus: deployment.buildStatus,
    currentStep: deployment.currentStep,
    liveUrl: deployment.liveUrl,
    errorMessage: deployment.errorMessage || null,
  };
}

function makeActivity(type, message, resourceType, resourceId) {
  return {
    id: createId('act'),
    type,
    message,
    resourceType,
    resourceId,
    createdAt: new Date().toISOString(),
  };
}

function createId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function slugify(value) {
  return String(value || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site';
}
