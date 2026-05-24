import { Injectable } from '@nestjs/common';
import { jsonFromDb, jsonToDb } from '../../common/json-field';
import { WebhookDeliveryStatus } from '../../common/prisma-enums';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class WebhooksRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Endpoints ───────────────────────────────────────────────────────────────

  listEndpoints(organizationId: string) {
    return this.prisma.outgoingWebhookEndpoint.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: 'desc' }
    });
  }

  findEndpointById(id: string, organizationId: string) {
    return this.prisma.outgoingWebhookEndpoint.findFirst({
      where: { id, organizationId, deletedAt: null }
    });
  }

  createEndpoint(data: {
    organizationId: string;
    createdByUserId: string;
    url: string;
    events: string[];
    secret?: string | null;
  }) {
    return this.prisma.outgoingWebhookEndpoint.create({
      data: {
        organizationId: data.organizationId,
        createdByUserId: data.createdByUserId,
        url: data.url,
        events: jsonToDb(data.events, []),
        secret: data.secret ?? null,
        isActive: true
      }
    });
  }

  updateEndpoint(id: string, data: {
    url?: string;
    events?: string[];
    secret?: string | null;
    isActive?: boolean;
  }) {
    return this.prisma.outgoingWebhookEndpoint.update({
      where: { id },
      data: {
        ...data,
        events: data.events === undefined ? undefined : jsonToDb(data.events, [])
      }
    });
  }

  archiveEndpoint(id: string) {
    return this.prisma.outgoingWebhookEndpoint.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false }
    });
  }

  // ─── Deliveries ──────────────────────────────────────────────────────────────

  listDeliveries(endpointId: string, organizationId: string, take = 50) {
    return this.prisma.outgoingWebhookDelivery.findMany({
      where: { endpointId, organizationId },
      orderBy: { createdAt: 'desc' },
      take
    });
  }

  createDelivery(data: {
    organizationId: string;
    endpointId: string;
    endpointUrl: string;
    eventType: string;
    payload: Record<string, unknown>;
  }) {
    return this.prisma.outgoingWebhookDelivery.create({
      data: {
        organizationId: data.organizationId,
        endpointId: data.endpointId,
        endpointUrl: data.endpointUrl,
        eventType: data.eventType,
        payload: jsonToDb(data.payload, {}),
        status: WebhookDeliveryStatus.pending,
        attemptCount: 0
      }
    });
  }

  updateDelivery(id: string, data: {
    status: WebhookDeliveryStatus | string;
    statusCode?: number | null;
    responseBody?: string | null;
    errorMessage?: string | null;
    deliveredAt?: Date | null;
    attemptCount?: number;
  }) {
    return this.prisma.outgoingWebhookDelivery.update({
      where: { id },
      data: { ...data, status: data.status as WebhookDeliveryStatus }
    });
  }

  findDeliveryById(id: string, organizationId: string) {
    return this.prisma.outgoingWebhookDelivery.findFirst({
      where: { id, organizationId },
      include: { endpoint: true }
    });
  }

  async findActiveEndpointsForEvent(organizationId: string, eventType: string) {
    const endpoints = await this.prisma.outgoingWebhookEndpoint.findMany({
      where: {
        organizationId,
        isActive: true,
        deletedAt: null
      }
    });
    return endpoints.filter((endpoint) => {
      const events = jsonFromDb<string[]>(endpoint.events, []);
      return events.includes('*') || events.includes(eventType);
    });
  }
}
