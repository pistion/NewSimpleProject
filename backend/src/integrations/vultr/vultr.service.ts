import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface VultrRegion {
  id: string;
  city: string;
  country: string;
  continent: string;
  options: string[];
}

export interface VultrPlan {
  id: string;
  vcpu_count: number;
  ram: number;
  disk: number;
  bandwidth: number;
  monthly_cost: number;
  type: string;
  locations: string[];
}

export interface VultrOs {
  id: number;
  name: string;
  arch: string;
  family: string;
}

export interface VultrSshKey {
  id: string;
  name: string;
  ssh_key: string;
}

export interface VultrInstance {
  id: string;
  os: string;
  os_id: number;
  ram: number;
  disk: number;
  main_ip: string;
  vcpu_count: number;
  region: string;
  status: string;
  power_status: string;
  server_status: string;
  plan: string;
  label: string;
  hostname: string;
  monthly_cost: number;
  date_created: string;
  tag: string;
  tags: string[];
  features: string[];
}

export interface CreateInstanceOptions {
  region: string;
  plan: string;
  os_id: number;
  label?: string;
  hostname?: string;
  sshkey_id?: string[];
  user_data?: string;
  tags?: string[];
  backups?: 'enabled' | 'disabled';
}

@Injectable()
export class VultrService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return this.getApiKey().length > 0;
  }

  async listRegions(): Promise<VultrRegion[]> {
    const data = await this.request<{ regions: VultrRegion[] }>('/regions?per_page=500');
    return data.regions ?? [];
  }

  async listPlans(type?: string): Promise<VultrPlan[]> {
    const qs = type ? `?type=${encodeURIComponent(type)}&per_page=500` : '?per_page=500';
    const data = await this.request<{ plans: VultrPlan[] }>(`/plans${qs}`);
    return data.plans ?? [];
  }

  async listOperatingSystems(): Promise<VultrOs[]> {
    const data = await this.request<{ os: VultrOs[] }>('/os?per_page=500');
    return data.os ?? [];
  }

  async listSshKeys(): Promise<VultrSshKey[]> {
    const data = await this.request<{ ssh_keys: VultrSshKey[] }>('/ssh-keys');
    return data.ssh_keys ?? [];
  }

  async createSshKey(name: string, publicKey: string): Promise<VultrSshKey> {
    const data = await this.request<{ ssh_key: VultrSshKey }>('/ssh-keys', {
      method: 'POST',
      body: JSON.stringify({ name, ssh_key: publicKey }),
    });
    return data.ssh_key;
  }

  async listInstances(): Promise<VultrInstance[]> {
    const data = await this.request<{ instances: VultrInstance[] }>('/instances?per_page=500');
    return data.instances ?? [];
  }

  async createInstance(options: CreateInstanceOptions): Promise<VultrInstance> {
    const data = await this.request<{ instance: VultrInstance }>('/instances', {
      method: 'POST',
      body: JSON.stringify(options),
    });
    return data.instance;
  }

  async getInstance(instanceId: string): Promise<VultrInstance> {
    const data = await this.request<{ instance: VultrInstance }>(`/instances/${encodeURIComponent(instanceId)}`);
    return data.instance;
  }

  async deleteInstance(instanceId: string): Promise<void> {
    await this.request(`/instances/${encodeURIComponent(instanceId)}`, { method: 'DELETE' });
  }

  async haltInstance(instanceId: string): Promise<void> {
    await this.request(`/instances/${encodeURIComponent(instanceId)}/halt`, { method: 'POST' });
  }

  async rebootInstance(instanceId: string): Promise<void> {
    await this.request(`/instances/${encodeURIComponent(instanceId)}/reboot`, { method: 'POST' });
  }

  async startInstance(instanceId: string): Promise<void> {
    await this.request(`/instances/${encodeURIComponent(instanceId)}/start`, { method: 'POST' });
  }

  async updateInstance(instanceId: string, payload: Record<string, unknown>): Promise<VultrInstance> {
    const data = await this.request<{ instance: VultrInstance }>(`/instances/${encodeURIComponent(instanceId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return data.instance;
  }

  private getApiKey(): string {
    return this.config.get<string>('VULTR_API_KEY') ?? '';
  }

  private getBaseUrl(): string {
    return this.config.get<string>('VULTR_API_BASE_URL') ?? 'https://api.vultr.com/v2';
  }

  private async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new ServiceUnavailableException('Vultr API key is not configured. Set VULTR_API_KEY in environment variables.');
    }

    const url = `${this.getBaseUrl()}${path}`;
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init.headers as Record<string, string> | undefined),
      },
    });

    if (response.status === 204) return {} as T;

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = json?.error ?? json?.message ?? `Vultr API error (${response.status})`;
      throw new Error(message);
    }
    return json as T;
  }
}
