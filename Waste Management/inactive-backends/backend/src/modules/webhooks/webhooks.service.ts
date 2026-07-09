import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import * as https from 'https';
import * as http from 'http';
import { jsonFromDb } from '../../common/json-field';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { WebhooksRepository } from './webhooks.repository';

interface ActorContext {
  userId: string;
  organizationId: string;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly repo: WebhooksRepository) {}

  // ─── Endpoint management ─────────────────────────────────────────────────────

  listEndpoints(context: ActorContext) {
    return this.repo.listEndpoints(context.organizationId);
  }

  async getEndpoint(endpointId: string, context: ActorContext) {
    const endpoint = await this.repo.findEndpointById(endpointId, context.organizationId);
    if (!endpoint) throw new NotFoundException('Webhook endpoint not found.');
    return endpoint;
  }

  createEndpoint(dto: CreateWebhookDto, context: ActorContext) {
    return this.repo.createEndpoint({
      organizationId: context.organizationId,
      createdByUserId: context.userId,
      url: dto.url,
      events: dto.events ?? ['*'],
      secret: dto.secret ?? null
    });
  }

  async updateEndpoint(endpointId: string, dto: UpdateWebhookDto, context: ActorContext) {
    await this.getEndpoint(endpointId, context);
    return this.repo.updateEndpoint(endpointId, {
      url: dto.url,
      events: dto.events,
      secret: dto.secret,
      isActive: dto.isActive
    });
  }

  async deleteEndpoint(endpointId: string, context: ActorContext) {
    await this.getEndpoint(endpointId, context);
    return this.repo.archiveEndpoint(endpointId);
  }

  // ─── Deliveries ──────────────────────────────────────────────────────────────

  async listDeliveries(endpointId: string, context: ActorContext) {
    await this.getEndpoint(endpointId, context);
    return this.repo.listDeliveries(endpointId, context.organizationId);
  }

  async retryDelivery(deliveryId: string, context: ActorContext) {
    const delivery = await this.repo.findDeliveryById(deliveryId, context.organizationId);
    if (!delivery) throw new NotFoundException('Delivery not found.');

    return this.dispatch(
      delivery.id,
      delivery.endpointUrl,
      delivery.endpoint.secret,
      delivery.eventType,
      jsonFromDb<Record<string, unknown>>(delivery.payload, {})
    );
  }

  // ─── Fan-out (called internally by other modules) ────────────────────────────

  async fanOut(organizationId: string, eventType: string, payload: Record<string, unknown>) {
    const endpoints = await this.repo.findActiveEndpointsForEvent(organizationId, eventType);
    await Promise.allSettled(
      endpoints.map(async (endpoint) => {
        const delivery = await this.repo.createDelivery({
          organizationId,
          endpointId: endpoint.id,
          endpointUrl: endpoint.url,
          eventType,
          payload
        });
        return this.dispatch(delivery.id, endpoint.url, endpoint.secret, eventType, payload);
      })
    );
  }

  // ─── HTTP dispatch ───────────────────────────────────────────────────────────

  private async dispatch(
    deliveryId: string,
    url: string,
    secret: string | null,
    eventType: string,
    payload: Record<string, unknown>
  ) {
    const body = JSON.stringify({ event: eventType, data: payload, deliveryId });
    const timestamp = Date.now().toString();
    const signature = secret
      ? `t=${timestamp},v1=${crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`
      : null;

    await this.repo.updateDelivery(deliveryId, { status: 'pending', attemptCount: 1 });

    try {
      const { statusCode, responseBody } = await this.httpPost(url, body, signature);
      const ok = statusCode >= 200 && statusCode < 300;

      await this.repo.updateDelivery(deliveryId, {
        status: ok ? 'delivered' : 'failed',
        statusCode,
        responseBody: responseBody.slice(0, 2000),
        deliveredAt: ok ? new Date() : null
      });
    } catch (err) {
      const message = (err as Error).message;
      this.logger.warn(`Webhook delivery ${deliveryId} failed: ${message}`);
      await this.repo.updateDelivery(deliveryId, {
        status: 'failed',
        errorMessage: message
      });
    }
  }

  private httpPost(url: string, body: string, signature: string | null): Promise<{ statusCode: number; responseBody: string }> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const lib = parsed.protocol === 'https:' ? https : http;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body).toString(),
        'User-Agent': 'Glondia-Webhooks/1.0'
      };
      if (signature) headers['X-Glondia-Signature'] = signature;

      const req = lib.request(
        {
          hostname: parsed.hostname,
          port: parsed.port,
          path: parsed.pathname + parsed.search,
          method: 'POST',
          headers,
          timeout: 10000
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, responseBody: data }));
        }
      );

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
      req.write(body);
      req.end();
    });
  }
}
