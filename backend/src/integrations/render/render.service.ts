import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface RenderDeploy {
  id: string;
  status?: string;
  commit?: {
    id?: string;
    message?: string;
  };
}

export interface RenderCreateServicePayload {
  type: 'static_site' | 'web_service';
  name: string;
  repo: string;
  branch?: string;
  rootDirectory?: string;
  buildCommand?: string;
  startCommand?: string;
  outputDirectory?: string;
  envVars?: Array<{ key: string; value: string }>;
}

@Injectable()
export class RenderService {
  constructor(private readonly config: ConfigService) {}

  isConfigured() {
    return this.getApiKey().length > 0 && this.getOwnerId().length > 0;
  }

  async listServices() {
    return this.request('/services');
  }

  async createService(payload: RenderCreateServicePayload) {
    const body = this.buildServicePayload(payload);
    return this.request('/services', {
      method: 'POST',
      body: JSON.stringify(body)
    }) as Promise<{ service?: { id?: string; serviceDetails?: { url?: string } }; id?: string; deployId?: string }>;
  }

  async triggerDeploy(serviceId: string, options: { clearCache?: string; commitId?: string } = {}): Promise<RenderDeploy> {
    const response = await this.request(`/services/${encodeURIComponent(serviceId)}/deploys`, {
      method: 'POST',
      body: JSON.stringify({
        clearCache: options.clearCache ?? 'do_not_clear',
        deployMode: 'build_and_deploy',
        ...(options.commitId ? { commitId: options.commitId } : {})
      })
    });

    return response as RenderDeploy;
  }

  async getService(serviceId: string) {
    return this.request(`/services/${encodeURIComponent(serviceId)}`);
  }

  async getDeploy(serviceId: string, deployId: string): Promise<RenderDeploy> {
    return this.request(`/services/${encodeURIComponent(serviceId)}/deploys/${encodeURIComponent(deployId)}`) as Promise<RenderDeploy>;
  }

  async listDeploys(serviceId: string) {
    return this.request(`/services/${encodeURIComponent(serviceId)}/deploys?limit=20`) as Promise<Array<RenderDeploy | { deploy: RenderDeploy }>>;
  }

  async updateService(serviceId: string, payload: Record<string, unknown>) {
    return this.request(`/services/${encodeURIComponent(serviceId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  }

  async suspendService(serviceId: string) {
    return this.request(`/services/${encodeURIComponent(serviceId)}/suspend`, {
      method: 'POST',
      body: JSON.stringify({})
    });
  }

  async deleteService(serviceId: string) {
    return this.request(`/services/${encodeURIComponent(serviceId)}`, { method: 'DELETE' });
  }

  private async request(path: string, init: RequestInit = {}) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new ServiceUnavailableException('Render API key and RENDER_OWNER_ID are required.');
    }

    const response = await fetch(`${this.config.getOrThrow<string>('RENDER_API_BASE_URL')}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...init.headers
      }
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new BadGatewayException(payload?.message || `Render API request failed with ${response.status}.`);
    }

    return payload;
  }

  private getApiKey() {
    return this.config.get<string>('RENDER_API_KEY') ?? '';
  }

  private getOwnerId() {
    return this.config.get<string>('RENDER_OWNER_ID') ?? '';
  }

  private buildServicePayload(input: RenderCreateServicePayload) {
    const serviceDetails = input.type === 'static_site'
      ? {
          buildCommand: input.buildCommand || 'npm run build',
          publishPath: input.outputDirectory || 'dist',
          pullRequestPreviewsEnabled: 'no'
        }
      : {
          env: 'node',
          buildCommand: input.buildCommand || 'npm ci && npm run build',
          startCommand: input.startCommand || 'npm start',
          plan: 'starter'
        };
    return {
      type: input.type,
      name: input.name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60),
      ownerId: this.getOwnerId(),
      repo: input.repo,
      branch: input.branch || 'main',
      rootDir: input.rootDirectory || undefined,
      serviceDetails,
      envVars: input.envVars?.length ? input.envVars : undefined
    };
  }
}
