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
          makeLog('Preparing Render hosting environment.'),
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
      deployment.liveUrl ||= `https://${slugify(deployment.serviceName)}.onrender.com`;
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
      return method === 'DELETE' ? { deleted: true } : disk;
    }

    const hostingDomainsMatch = cleanPath.match(/^\/hosting\/([^/]+)\/domains$/);
    if (hostingDomainsMatch) {
      const serviceId = hostingDomainsMatch[1];
      ensureHostingCollections(db);
      if (method === 'POST') {
        const domain = makeHostingDomain(body);
        db.hostingDomains[serviceId] = [domain, ...(db.hostingDomains[serviceId] || [])];
        syncHostingMetadata(db, serviceId);
        writeLocalDb(db);
        return domain;
      }
      return db.hostingDomains[serviceId] || [];
    }

    const hostingDomainStatusMatch = cleanPath.match(/^\/hosting\/([^/]+)\/domains\/([^/]+)\/status$/);
    if (hostingDomainStatusMatch) {
      const serviceId = hostingDomainStatusMatch[1];
      ensureHostingCollections(db);
      const domainId = hostingDomainStatusMatch[2];
      const domain = (db.hostingDomains[serviceId] || []).find((item) => item.domainId === domainId);
      if (!domain) throw new Error('Domain not found.');
      domain.verificationStatus = 'verified';
      domain.sslStatus = 'issued';
      domain.status = 'active';
      domain.updatedAt = new Date().toISOString();
      syncHostingMetadata(db, serviceId);
      writeLocalDb(db);
      return domain;
    }

    const hostingDomainVerifyMatch = cleanPath.match(/^\/hosting\/([^/]+)\/domains\/([^/]+)\/verify$/);
    if (hostingDomainVerifyMatch && method === 'POST') {
      const serviceId = hostingDomainVerifyMatch[1];
      ensureHostingCollections(db);
      const domainId = hostingDomainVerifyMatch[2];
      const domain = (db.hostingDomains[serviceId] || []).find((item) => item.domainId === domainId);
      if (!domain) throw new Error('Domain not found.');
      domain.verificationStatus = 'verified';
      domain.sslStatus = 'issued';
      domain.status = 'active';
      domain.updatedAt = new Date().toISOString();
      syncHostingMetadata(db, serviceId);
      writeLocalDb(db);
      return domain;
    }

    const hostingDomainDeleteMatch = cleanPath.match(/^\/hosting\/([^/]+)\/domains\/([^/]+)$/);
    if (hostingDomainDeleteMatch && method === 'DELETE') {
      const serviceId = hostingDomainDeleteMatch[1];
      ensureHostingCollections(db);
      const domainId = hostingDomainDeleteMatch[2];
      db.hostingDomains[serviceId] = (db.hostingDomains[serviceId] || []).filter((item) => item.domainId !== domainId);
      syncHostingMetadata(db, serviceId);
      writeLocalDb(db);
      return { deleted: true };
    }

    const artifactsMatch = cleanPath.match(/^\/projects\/([^/]+)\/artifacts$/);
    if (artifactsMatch) return db.artifacts.filter((item) => item.projectId === artifactsMatch[1]);

    const envVarsMatch = cleanPath.match(/^\/projects\/([^/]+)\/env-vars$/);
    if (envVarsMatch) {
      if (method === 'POST') {
        const envVar = makeEnvVar(envVarsMatch[1], body);
        db.envVars.unshift(envVar);
        writeLocalDb(db);
        return envVar;
      }
      return db.envVars.filter((item) => item.projectId === envVarsMatch[1]);
    }

    const envVarMatch = cleanPath.match(/^\/projects\/([^/]+)\/env-vars\/([^/]+)$/);
    if (envVarMatch) {
      const envVar = db.envVars.find((item) => item.id === envVarMatch[2]);
      if (!envVar) throw new Error('Environment variable not found.');
      if (method === 'PATCH') Object.assign(envVar, body, { updatedAt: new Date().toISOString() });
      if (method === 'DELETE') db.envVars = db.envVars.filter((item) => item.id !== envVar.id);
      writeLocalDb(db);
      return method === 'DELETE' ? { deleted: true } : envVar;
    }

    if (cleanPath.includes('/env-vars/export')) {
      const projectId = cleanPath.split('/')[2];
      return db.envVars.filter((item) => item.projectId === projectId);
    }

    if (cleanPath === '/domains') {
      if (method === 'POST') {
        const domain = makeDomain(body);
        db.domains.unshift(domain);
        db.dnsRecords[domain.id] = defaultDnsRecords(domain.hostname);
        writeLocalDb(db);
        return domain;
      }
      return db.domains;
    }

    const domainMatch = cleanPath.match(/^\/domains\/([^/]+)$/);
    if (domainMatch) {
      const domain = db.domains.find((item) => item.id === domainMatch[1]);
      if (!domain) throw new Error('Domain not found.');
      if (method === 'PATCH') Object.assign(domain, body, { updatedAt: new Date().toISOString() });
      if (method === 'DELETE') domain.status = 'disabled';
      writeLocalDb(db);
      return domain;
    }

    const verifyDomainMatch = cleanPath.match(/^\/domains\/([^/]+)\/verify$/);
    if (verifyDomainMatch) {
      const domain = db.domains.find((item) => item.id === verifyDomainMatch[1]);
      if (!domain) throw new Error('Domain not found.');
      Object.assign(domain, { status: 'verified', verifiedAt: new Date().toISOString() });
      writeLocalDb(db);
      return { verified: true, ...domain };
    }

    const dnsRecordsMatch = cleanPath.match(/^\/domains\/([^/]+)\/dns-records$/);
    if (dnsRecordsMatch) {
      const domainId = dnsRecordsMatch[1];
      if (method === 'POST') {
        const record = makeDnsRecord(body);
        db.dnsRecords[domainId] = [record, ...(db.dnsRecords[domainId] || [])];
        writeLocalDb(db);
        return record;
      }
      if (method === 'DELETE') {
        const ids = body.recordIds || [];
        db.dnsRecords[domainId] = (db.dnsRecords[domainId] || []).filter((item) => !ids.includes(item.id));
        writeLocalDb(db);
        return { deleted: ids.length };
      }
      return db.dnsRecords[domainId] || [];
    }

    const dnsRecordMatch = cleanPath.match(/^\/domains\/([^/]+)\/dns-records\/([^/]+)$/);
    if (dnsRecordMatch) {
      const records = db.dnsRecords[dnsRecordMatch[1]] || [];
      const record = records.find((item) => item.id === dnsRecordMatch[2]);
      if (!record) throw new Error('DNS record not found.');
      if (method === 'PATCH') Object.assign(record, body);
      if (method === 'DELETE') db.dnsRecords[dnsRecordMatch[1]] = records.filter((item) => item.id !== record.id);
      writeLocalDb(db);
      return method === 'DELETE' ? { deleted: true } : record;
    }

    if (cleanPath.includes('/dns-records/export')) {
      const domainId = cleanPath.split('/')[2];
      const domain = db.domains.find((item) => item.id === domainId);
      const records = db.dnsRecords[domainId] || [];
      return { hostname: domain?.hostname || 'example.com', content: records.map((r) => `${r.name} ${r.ttl} IN ${r.type} ${r.value}`).join('\n') };
    }

    if (cleanPath === '/billing/summary') return db.billing;
    if (cleanPath.startsWith('/activity')) return db.activity;
    if (cleanPath.startsWith('/audit')) return db.audit;
    if (cleanPath === '/render/services') return db.renderServices;

    if (cleanPath === '/builder/sites') {
      if (method === 'POST') {
        const site = makeBuilderSite(body);
        db.sites.unshift(site);
        writeLocalDb(db);
        return site;
      }
      return db.sites;
    }

    const builderSiteMatch = cleanPath.match(/^\/builder\/sites\/([^/]+)$/);
    if (builderSiteMatch) {
      const site = db.sites.find((item) => item.id === builderSiteMatch[1]);
      if (!site) throw new Error('Builder site not found.');
      if (method === 'PATCH') Object.assign(site, body, { updatedAt: new Date().toISOString() });
      if (method === 'DELETE') site.status = 'archived';
      writeLocalDb(db);
      return site;
    }

    const builderPagesMatch = cleanPath.match(/^\/builder\/sites\/([^/]+)\/pages$/);
    if (builderPagesMatch) {
      const site = db.sites.find((item) => item.id === builderPagesMatch[1]);
      if (!site) throw new Error('Builder site not found.');
      if (method === 'POST') {
        const page = makeBuilderPage(body);
        site.pages.push(page);
        writeLocalDb(db);
        return page;
      }
      return site.pages;
    }

    const builderPageMatch = cleanPath.match(/^\/builder\/sites\/([^/]+)\/pages\/([^/]+)$/);
    if (builderPageMatch) {
      const site = db.sites.find((item) => item.id === builderPageMatch[1]);
      const page = site?.pages.find((item) => item.id === builderPageMatch[2]);
      if (!site || !page) throw new Error('Builder page not found.');
      if (method === 'PATCH') Object.assign(page, body, { updatedAt: new Date().toISOString() });
      if (method === 'DELETE') page.status = 'archived';
      writeLocalDb(db);
      return page;
    }

    if (cleanPath.includes('/versions')) return [];
    if (cleanPath.includes('/publish')) {
      const siteId = cleanPath.split('/')[3];
      const site = db.sites.find((item) => item.id === siteId);
      if (!site) throw new Error('Builder site not found.');
      site.status = 'published';
      site.publishedAt = new Date().toISOString();
      writeLocalDb(db);
      return site;
    }

    return null;
  }

  function readLocalDb() {
    const stored = safeParseJson(window.localStorage.getItem(LOCAL_DB_KEY));
    if (stored) return stored;
    const seeded = seedLocalDb();
    writeLocalDb(seeded);
    return seeded;
  }

  function writeLocalDb(db) {
    window.localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(db));
  }

  function seedLocalDb() {
    const project = makeProject({
      name: 'Glondia Sites',
      slug: 'glondia-sites',
      framework: 'Vite + React',
      productionBranch: 'main',
    });
    const deployment = makeDeployment(project.id, { environment: 'production', source: 'manual', commitMessage: 'Clean Vite React deployment' });
    const domain = makeDomain({ hostname: 'glondiasites.com', projectId: project.id });
    return {
      projects: [project],
      deployments: [deployment],
      logs: {
        [deployment.id]: [makeLog('npm ci'), makeLog('npm run build'), makeLog('Static app served from dist.')],
      },
      envVars: [makeEnvVar(project.id, { key: 'VITE_APP_MODE', value: 'demo', environment: 'production' })],
      artifacts: [makeArtifact(project.id, deployment.id)],
      domains: [domain],
      dnsRecords: { [domain.id]: defaultDnsRecords(domain.hostname) },
      sites: [makeBuilderSite({ name: 'Scalatone', templateId: 'scalatone-html', source: 'template' })],
      activity: [makeActivity('app.ready', 'Clean Vite React workspace is ready.', 'workspace', 'local-org')],
      audit: [],
      renderServices: [{ id: 'local-static', name: 'Glondia Static App', type: 'web_service', region: 'oregon' }],
      hostingServices: [],
      hostingEnv: {},
      hostingDisks: {},
      hostingDomains: {},
      billing: {
        subscription: {
          status: 'active',
          seats: 1,
          currentPeriodEnd: '2026-06-24T00:00:00.000Z',
          plan: { name: 'Local SSD', priceMonthlyCents: 0, currency: 'USD' },
        },
        invoices: [],
        usage: [
          { metric: 'build_minutes', value: 0, limit: 1000 },
          { metric: 'bandwidth_gb', value: 0, limit: 1024 },
          { metric: 'projects', value: 1, limit: 10 },
          { metric: 'team_members', value: 1, limit: 5 },
        ],
        paymentMethod: null,
      },
    };
  }

  return {
    createId,
    handleLocalApi,
    makeActivity,
    makeBuilderSite,
    makeProject,
    readLocalDb,
    slugify,
    writeLocalDb,
  };

  function makeProject(input = {}) {
    const now = new Date().toISOString();
    const slug = input.slug || slugify(input.name || 'local-site');
    return {
      id: input.id || createId('project'),
      organizationId: 'local-org',
      name: input.name || 'Local Site',
      slug,
      framework: input.framework || 'Vite + React',
      status: input.status || 'active',
      repositoryProvider: input.repositoryProvider || null,
      repositoryOwner: input.repositoryOwner || null,
      repositoryName: input.repositoryName || null,
      repositoryId: input.repositoryId || null,
      repositoryUrl: input.repositoryUrl || null,
      rootDirectory: input.rootDirectory || './',
      installCommand: input.installCommand || 'npm ci',
      buildCommand: input.buildCommand || 'npm run build',
      outputDirectory: input.outputDirectory || 'dist',
      productionBranch: input.productionBranch || 'main',
      renderServiceId: input.renderServiceId || null,
      renderConfig: input.renderConfig || null,
      domain: `${slug}.glondia.app`,
      createdAt: now,
      updatedAt: now,
    };
  }

  function makeDeployment(projectId, input = {}) {
    const now = new Date().toISOString();
    return {
      id: input.id || createId('dep'),
      projectId,
      organizationId: 'local-org',
      environment: input.environment || 'production',
      source: input.source || 'manual',
      status: input.status || 'deployed',
      commitMessage: input.commitMessage || 'Local Vite build',
      commitSha: input.commitSha || 'localbuild',
      branch: input.branch || 'main',
      durationMs: 18000,
      provider: 'render',
      providerServiceId: 'local-static',
      providerDeployId: null,
      providerStatus: 'live',
      createdAt: now,
      finishedAt: now,
      artifacts: [makeArtifact(projectId)],
    };
  }

  function makeRenderDeployment(input = {}) {
    const now = new Date().toISOString();
    const serviceName = input.serviceName || input.name || input.slug || 'Glondia site';
    const deploymentId = input.deploymentId || createId('dep');
    const serviceType = input.serviceType || (input.startCommand ? 'web_service' : 'static_site');
    const serviceSlug = slugify(serviceName);
    return {
      id: deploymentId,
      deploymentId,
      userId: 'local-user',
      projectId: input.projectId || input.siteId || null,
      renderServiceId: input.renderServiceId || createId('render_srv'),
      renderDeployId: createId('render_deploy'),
      deploymentSessionId: createId('session'),
      serviceName,
      serviceType,
      environment: input.environment || 'production',
      source: input.source || 'builder',
      status: 'building',
      buildStatus: 'queued',
      currentStep: 'Queued',
      liveUrl: input.liveUrl || `https://${serviceSlug}.onrender.com`,
      verifiedUrl: null,
      urlReachable: false,
      errorMessage: null,
      repoUrl: input.repoUrl || input.repositoryUrl || null,
      githubRepo: input.githubRepo || input.repoUrl || input.repositoryUrl || null,
      githubBranch: input.branch || input.productionBranch || 'main',
      sourceReference: input.sourceReference || input.siteId || input.repoUrl || 'builder',
      commitMessage: input.commitMessage || `Deploy ${serviceName}`,
      commitSha: 'renderlocal',
      branch: input.branch || input.productionBranch || 'main',
      durationMs: 0,
      provider: 'render',
      providerServiceId: input.renderServiceId || null,
      providerDeployId: null,
      providerStatus: 'building',
      environmentVariablesMetadata: [],
      diskMetadata: [],
      domainMetadata: [],
      deploymentLogsReference: deploymentId,
      environmentConfiguration: {
        branch: input.branch || input.productionBranch || 'main',
        rootDirectory: input.rootDirectory || '',
        buildCommand: input.buildCommand || null,
        startCommand: input.startCommand || null,
        outputDirectory: input.outputDirectory || null,
      },
      createdAt: now,
      updatedAt: now,
      lastDeployedAt: null,
      artifacts: [makeArtifact(input.projectId || input.siteId || 'builder', deploymentId)],
    };
  }

  function makeHostingServiceFromDeployment(deployment) {
    return {
      serviceId: deployment.renderServiceId,
      deploymentId: deployment.deploymentId,
      projectId: deployment.projectId,
      serviceName: deployment.serviceName,
      serviceType: deployment.serviceType,
      status: deployment.status,
      buildStatus: deployment.buildStatus,
      currentStep: deployment.currentStep,
      liveUrl: deployment.liveUrl,
      verifiedUrl: deployment.verifiedUrl,
      urlReachable: deployment.urlReachable,
      errorMessage: deployment.errorMessage,
      renderServiceId: deployment.renderServiceId,
      renderDeployId: deployment.renderDeployId,
      githubRepo: deployment.githubRepo,
      githubBranch: deployment.githubBranch,
      environmentConfiguration: deployment.environmentConfiguration,
      environmentVariablesMetadata: deployment.environmentVariablesMetadata,
      diskMetadata: deployment.diskMetadata,
      domainMetadata: deployment.domainMetadata,
      createdAt: deployment.createdAt,
      updatedAt: deployment.updatedAt,
      lastDeployedAt: deployment.lastDeployedAt,
    };
  }

  function makeArtifact(projectId, deploymentId = createId('dep')) {
    return {
      id: createId('artifact'),
      projectId,
      deploymentId,
      bucket: 'local-dist',
      objectKey: 'dist/index.html',
      sizeBytes: 512000,
      checksum: 'local',
      status: 'ready',
      createdAt: new Date().toISOString(),
    };
  }

  function makeEnvVar(projectId, input = {}) {
    return {
      id: input.id || createId('env'),
      projectId,
      key: String(input.key || 'VITE_APP_MODE').toUpperCase(),
      value: input.value || 'demo',
      environment: input.environment || 'production',
      updatedAt: new Date().toISOString(),
    };
  }

  function makeHostingEnvVar(input = {}) {
    const key = String(input.key || 'VITE_APP_MODE').trim().toUpperCase();
    return {
      id: input.id || createId('env'),
      key,
      valuePreview: redact(input.value || input.valuePreview || ''),
      environment: input.environment || 'production',
      encrypted: input.secret !== false,
      renderSynced: true,
      requiresRedeploy: true,
      updatedAt: new Date().toISOString(),
    };
  }

  function makeHostingDisk(input = {}) {
    return {
      diskId: input.diskId || createId('disk'),
      name: input.name || input.diskName || 'data',
      mountPath: input.mountPath || '/var/data',
      sizeGB: Number(input.sizeGB || input.size || 1),
      status: 'attached',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function makeHostingDomain(input = {}) {
    const name = String(input.domain || input.name || input.hostname || 'example.com').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    return {
      domainId: input.domainId || createId('domain'),
      name,
      status: 'pending_verification',
      verificationStatus: 'pending',
      sslStatus: 'pending',
      dnsRecords: [
        { type: 'A', name: '@', value: '216.24.57.1', ttl: 300 },
        { type: 'CNAME', name: 'www', value: `${slugify(name)}.onrender.com`, ttl: 300 },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function makeDomain(input = {}) {
    const hostname = String(input.hostname || input.name || 'example.com').toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    return {
      id: input.id || createId('domain'),
      organizationId: 'local-org',
      projectId: input.projectId || null,
      hostname,
      rootDomain: hostname.split('.').slice(-2).join('.'),
      status: input.status || 'active',
      verificationToken: `glondia-verify=${createId('token')}`,
      verifiedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
  }

  function makeDnsRecord(input = {}) {
    return {
      id: input.id || createId('dns'),
      type: input.type || 'A',
      name: input.name || input.host || '@',
      value: input.value || '216.24.57.1',
      ttl: ttlToSeconds(input.ttl || input.ttlSeconds || 3600),
      priority: input.priority ?? null,
      proxied: !!input.proxied || !!input.proxy,
      status: input.status || 'active',
    };
  }

  function defaultDnsRecords(hostname) {
    return [
      makeDnsRecord({ type: 'A', name: '@', value: '216.24.57.1' }),
      makeDnsRecord({ type: 'CNAME', name: 'www', value: hostname }),
    ];
  }

  function findHostingService(db, serviceId) {
    return (db.hostingServices || []).find((item) => item.serviceId === serviceId || item.deploymentId === serviceId);
  }

  function ensureHostingCollections(db) {
    db.hostingServices ||= [];
    db.hostingEnv ||= {};
    db.hostingDisks ||= {};
    db.hostingDomains ||= {};
  }

  function syncDeploymentFromHosting(db, service) {
    const deployment = db.deployments.find((item) => item.deploymentId === service.deploymentId || item.renderServiceId === service.serviceId);
    if (!deployment) return;
    Object.assign(deployment, {
      status: service.status,
      buildStatus: service.buildStatus,
      liveUrl: service.liveUrl,
      verifiedUrl: service.verifiedUrl,
      urlReachable: service.urlReachable,
      errorMessage: service.errorMessage,
      currentStep: service.currentStep,
      suspendedAt: service.suspendedAt,
      deletedAt: service.deletedAt,
      environmentConfiguration: service.environmentConfiguration,
      environmentVariablesMetadata: service.environmentVariablesMetadata,
      diskMetadata: service.diskMetadata,
      domainMetadata: service.domainMetadata,
      updatedAt: new Date().toISOString(),
    });
  }

  function syncHostingServiceFromDeployment(db, deployment) {
    const service = findHostingService(db, deployment.deploymentId || deployment.renderServiceId);
    if (!service) return;
    Object.assign(service, makeHostingServiceFromDeployment(deployment), {
      environmentVariablesMetadata: service.environmentVariablesMetadata,
      diskMetadata: service.diskMetadata,
      domainMetadata: service.domainMetadata,
    });
  }

  function syncHostingMetadata(db, serviceId) {
    const service = findHostingService(db, serviceId);
    if (!service) return;
    service.environmentVariablesMetadata = (db.hostingEnv[serviceId] || []).map(publicHostingEnvVar);
    service.diskMetadata = db.hostingDisks[serviceId] || [];
    service.domainMetadata = db.hostingDomains[serviceId] || [];
    service.updatedAt = new Date().toISOString();
    syncDeploymentFromHosting(db, service);
  }

  function publicHostingEnvVar(item = {}) {
    const { value, valueCiphertext, valuePlaintext, ...safe } = item;
    return safe;
  }

  function pickDeploymentStatus(deployment) {
    return {
      deploymentId: deployment.deploymentId,
      deploymentSessionId: deployment.deploymentSessionId,
      status: deployment.status,
      buildStatus: deployment.buildStatus,
      currentStep: deployment.currentStep,
      liveUrl: deployment.liveUrl,
      renderServiceId: deployment.renderServiceId,
      renderDeployId: deployment.renderDeployId,
      verifiedUrl: deployment.verifiedUrl,
      urlReachable: deployment.urlReachable,
      errorMessage: deployment.errorMessage,
      updatedAt: deployment.updatedAt,
    };
  }

  function redact(value) {
    const text = String(value || '');
    return text.length <= 4 ? '****' : `${text.slice(0, 2)}******`;
  }

  function makeBuilderSite(input = {}) {
    const now = new Date().toISOString();
    const siteId = input.id || createId('site');
    return {
      id: siteId,
      organizationId: 'local-org',
      name: input.name || 'Local Site',
      slug: slugify(input.name || 'local-site'),
      projectId: input.projectId || null,
      templateId: input.templateId || null,
      status: input.status || 'draft',
      source: input.source || 'local',
      filename: input.filename || null,
      repositoryProvider: input.repositoryProvider || null,
      repositoryOwner: input.repositoryOwner || null,
      repositoryName: input.repositoryName || null,
      repositoryUrl: input.repositoryUrl || null,
      branch: input.branch || null,
      rootDirectory: input.rootDirectory || '',
      framework: input.framework || null,
      installCommand: input.installCommand || null,
      buildCommand: input.buildCommand || null,
      outputDirectory: input.outputDirectory || null,
      createdAt: now,
      updatedAt: now,
      pages: [makeBuilderPage({ siteId, title: 'Home', path: '/', content: input.content || {} })],
    };
  }

  function makeBuilderPage(input = {}) {
    return {
      id: input.id || createId('page'),
      siteId: input.siteId || null,
      title: input.title || 'Untitled',
      path: input.path || '/',
      status: input.status || 'draft',
      sortOrder: input.sortOrder || 0,
      content: input.content || {},
      updatedAt: new Date().toISOString(),
    };
  }

  function makeActivity(action, message, entityType, entityId) {
    return {
      id: createId('activity'),
      action,
      message,
      entityType,
      entityId,
      actor: { name: 'Glondia' },
      createdAt: new Date().toISOString(),
    };
  }

  function makeLog(message, level = 'info') {
    return { id: createId('log'), message, level, createdAt: new Date().toISOString() };
  }

  function parseBody(body) {
    if (!body) return {};
    if (typeof body !== 'string') return body;
    return safeParseJson(body) || {};
  }

  function createId(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function slugify(value) {
    return String(value || 'item').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
  }

  function safeParseJson(value) {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
}
