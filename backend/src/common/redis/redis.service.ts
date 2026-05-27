import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: IORedis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('REDIS_URL', '');
    if (!url) {
      this.logger.warn('REDIS_URL not set — Redis features disabled.');
      return;
    }
    this.client = new IORedis(url, { maxRetriesPerRequest: 3, lazyConnect: true });
    this.client.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));
  }

  async onModuleDestroy() {
    await this.client?.quit().catch(() => {});
  }

  get isConnected(): boolean {
    return !!this.client;
  }

  // ─── JWT blacklist ───────────────────────────────────────────────────────────

  async blacklistToken(jti: string, ttlSeconds: number): Promise<void> {
    if (!this.client) return;
    await this.client.set(`jwt:bl:${jti}`, '1', 'EX', ttlSeconds);
  }

  async isTokenBlacklisted(jti: string): Promise<boolean> {
    if (!this.client) return false;
    const val = await this.client.get(`jwt:bl:${jti}`);
    return val !== null;
  }

  // ─── Session blacklist (all tokens for a session) ────────────────────────────

  async blacklistSession(sessionId: string, ttlSeconds: number): Promise<void> {
    if (!this.client) return;
    await this.client.set(`session:bl:${sessionId}`, '1', 'EX', ttlSeconds);
  }

  async isSessionBlacklisted(sessionId: string): Promise<boolean> {
    if (!this.client) return false;
    const val = await this.client.get(`session:bl:${sessionId}`);
    return val !== null;
  }

  // ─── Generic get/set ─────────────────────────────────────────────────────────

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.client) return;
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client) return;
    await this.client.del(key);
  }

  async ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}
