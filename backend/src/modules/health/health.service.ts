import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../common/redis/redis.service';

type DepStatus = 'up' | 'down' | 'unconfigured';

@Injectable()
export class HealthService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {}

  async getHealth() {
    const [database, redis, vultr, render] = await Promise.all([
      this.getDatabaseStatus(),
      this.getRedisStatus(),
      this.getVultrStatus(),
      this.getRenderStatus()
    ]);

    const critical = [database, redis];
    const overallOk = critical.every((s) => s === 'up');

    return {
      status: overallOk ? 'ok' : 'degraded',
      app: this.config.getOrThrow<string>('app.name'),
      environment: this.config.getOrThrow<string>('app.nodeEnv'),
      uptimeSeconds: Math.round(process.uptime()),
      dependencies: { database, redis, vultr, render }
    };
  }

  private async getDatabaseStatus(): Promise<DepStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async getRedisStatus(): Promise<DepStatus> {
    if (!this.redis.isConnected) return 'unconfigured';
    return (await this.redis.ping()) ? 'up' : 'down';
  }

  private async getVultrStatus(): Promise<DepStatus> {
    const apiKey = this.config.get<string>('VULTR_API_KEY', '');
    if (!apiKey) return 'unconfigured';
    try {
      const res = await fetch('https://api.vultr.com/v2/regions?per_page=1', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5000)
      });
      return res.ok ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }

  private async getRenderStatus(): Promise<DepStatus> {
    const apiKey = this.config.get<string>('RENDER_API_KEY', '');
    if (!apiKey) return 'unconfigured';
    try {
      const baseUrl = this.config.get<string>('RENDER_API_BASE_URL', 'https://api.render.com/v1');
      const res = await fetch(`${baseUrl}/services?limit=1`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(5000)
      });
      return res.ok ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }
}
