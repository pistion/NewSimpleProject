const RENDER_BASE_URL = process.env.RENDER_API_BASE_URL || 'https://api.render.com/v1';

class RenderApiService {
  configured() {
    if (String(process.env.RENDER_API_DISABLED || '').toLowerCase() === 'true') return false;
    return Boolean(process.env.RENDER_API_KEY && process.env.RENDER_OWNER_ID);
  }

  settings() {
    return {
      provider: 'render',
      configured: this.configured(),
      ownerIdPresent: Boolean(process.env.RENDER_OWNER_ID),
      required: ['RENDER_API_KEY', 'RENDER_OWNER_ID'].filter((key) => !process.env[key]),
    };
  }

  async createService(input = {}) {
    this.assertConfigured('create_service');
    const body = this.buildServicePayload(input);
    return this.request('/services', { method: 'POST', body });
  }

  async getService(serviceId) {
    this.assertConfigured('get_service');
    return this.request(`/services/${encodeURIComponent(serviceId)}`);
  }

  async updateService(serviceId, settings = {}) {
    this.assertConfigured('update_service');
    return this.request(`/services/${encodeURIComponent(serviceId)}`, { method: 'PATCH', body: settings });
  }

  async suspendService(serviceId) {
    this.assertConfigured('suspend_service');
    return this.request(`/services/${encodeURIComponent(serviceId)}/suspend`, { method: 'POST', body: {} });
  }

  async deleteService(serviceId) {
    this.assertConfigured('delete_service');
    return this.request(`/services/${encodeURIComponent(serviceId)}`, { method: 'DELETE' });
  }

  async triggerDeploy(serviceId, input = {}) {
    this.assertConfigured('trigger_deploy');
    return this.request(`/services/${encodeURIComponent(serviceId)}/deploys`, {
      method: 'POST',
      body: {
        clearCache: input.clearCache || 'do_not_clear',
        deployMode: input.deployMode || 'build_and_deploy',
        ...(input.commitId ? { commitId: input.commitId } : {}),
      },
    });
  }

  async getDeploy(serviceId, deployId) {
    this.assertConfigured('get_deploy');
    return this.request(`/services/${encodeURIComponent(serviceId)}/deploys/${encodeURIComponent(deployId)}`);
  }

  async listDeploys(serviceId, limit = 20) {
    this.assertConfigured('list_deploys');
    return this.request(`/services/${encodeURIComponent(serviceId)}/deploys?limit=${encodeURIComponent(limit)}`);
  }

  async listEnvVars(serviceId) {
    if (!this.configured()) return this.configurationRequired('list_env_vars');
    return this.request(`/services/${encodeURIComponent(serviceId)}/env-vars?limit=100`);
  }

  async upsertEnvVars(serviceId, envVars = []) {
    if (!this.configured()) return this.configurationRequired('upsert_env_vars');
    const results = [];
    for (const envVar of envVars) {
      results.push(await this.request(`/services/${encodeURIComponent(serviceId)}/env-vars/${encodeURIComponent(envVar.key)}`, {
        method: 'PUT',
        body: { value: envVar.value },
      }));
    }
    return { envVars: results };
  }

  async deleteEnvVar(serviceId, key) {
    if (!this.configured()) return this.configurationRequired('delete_env_var');
    return this.request(`/services/${encodeURIComponent(serviceId)}/env-vars/${encodeURIComponent(key)}`, { method: 'DELETE' });
  }

  async createDisk(serviceId, disk = {}) {
    if (!this.configured()) return this.configurationRequired('create_disk');
    return this.request(`/services/${encodeURIComponent(serviceId)}/disks`, {
      method: 'POST',
      body: {
        name: disk.name,
        mountPath: disk.mountPath,
        sizeGB: Number(disk.sizeGB || disk.size || 1),
      },
    });
  }

  async updateDisk(serviceId, diskId, disk = {}) {
    if (!this.configured()) return this.configurationRequired('update_disk');
    return this.request(`/services/${encodeURIComponent(serviceId)}/disks/${encodeURIComponent(diskId)}`, {
      method: 'PATCH',
      body: disk,
    });
  }

  async deleteDisk(serviceId, diskId) {
    if (!this.configured()) return this.configurationRequired('delete_disk');
    return this.request(`/services/${encodeURIComponent(serviceId)}/disks/${encodeURIComponent(diskId)}`, { method: 'DELETE' });
  }

  async addCustomDomain(serviceId, domainName) {
    if (!this.configured()) return this.configurationRequired('add_custom_domain');
    return this.request(`/services/${encodeURIComponent(serviceId)}/custom-domains`, {
      method: 'POST',
      body: { name: domainName },
    });
  }

  async listCustomDomains(serviceId) {
    if (!this.configured()) return this.configurationRequired('list_custom_domains');
    return this.request(`/services/${encodeURIComponent(serviceId)}/custom-domains?limit=100`);
  }

  async getCustomDomain(serviceId, domainId) {
    if (!this.configured()) return this.configurationRequired('get_custom_domain');
    return this.request(`/services/${encodeURIComponent(serviceId)}/custom-domains/${encodeURIComponent(domainId)}`);
  }

  async deleteCustomDomain(serviceId, domainId) {
    if (!this.configured()) return this.configurationRequired('delete_custom_domain');
    return this.request(`/services/${encodeURIComponent(serviceId)}/custom-domains/${encodeURIComponent(domainId)}`, { method: 'DELETE' });
  }

  async request(path, options = {}) {
    const response = await fetch(`${RENDER_BASE_URL}${path}`, {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${process.env.RENDER_API_KEY}`,
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
    if (!response.ok) {
      const error = new Error(body?.message || body?.error || `Render API returned ${response.status}.`);
      error.status = response.status === 401 ? 401 : response.status >= 500 ? 502 : response.status;
      error.details = body;
      error.expose = true;
      throw error;
    }
    return body;
  }

  buildServicePayload(input = {}) {
    const serviceType = input.serviceType || inferServiceType(input);
    const details = serviceType === 'static_site'
      ? {
          buildCommand: input.buildCommand || 'npm run build',
          publishPath: input.outputDirectory || 'dist',
          pullRequestPreviewsEnabled: 'no',
        }
      : {
          env: input.runtime || 'node',
          buildCommand: input.buildCommand || 'npm ci && npm run build',
          startCommand: input.startCommand || 'npm start',
          plan: input.plan || 'starter',
          region: input.region || 'oregon',
        };
    return {
      type: serviceType,
      name: renderSafeName(input.serviceName || input.name || input.slug || 'glondia-site'),
      ownerId: input.ownerId || process.env.RENDER_OWNER_ID,
      repo: input.repoUrl || input.repositoryUrl || input.sourceReference,
      branch: input.branch || input.productionBranch || 'main',
      rootDir: input.rootDirectory || undefined,
      serviceDetails: details,
      envVars: input.envVars || undefined,
    };
  }

  assertConfigured(action = 'render_api') {
    if (this.configured()) return;
    const error = new Error(this.configurationRequired(action).message);
    error.status = 503;
    error.code = 'RENDER_CONFIGURATION_REQUIRED';
    error.expose = true;
    error.details = this.settings();
    throw error;
  }

  configurationRequired(action) {
    return {
      status: 'configuration_required',
      action,
      provider: 'render',
      settings: this.settings(),
      message: 'Render API credentials are not configured. Add RENDER_API_KEY and RENDER_OWNER_ID to enable live Render changes.',
    };
  }
}

function inferServiceType(input = {}) {
  return input.startCommand || input.framework === 'Express' || input.framework === 'Node'
    ? 'web_service'
    : 'static_site';
}

function renderSafeName(value) {
  return String(value || 'glondia-site').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'glondia-site';
}

export default new RenderApiService();
