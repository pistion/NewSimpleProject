import { Injectable } from '@nestjs/common';
import { jsonToDb } from '../../common/json-field';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  listForUser(userId: string, organizationId: string, take = 50) {
    return this.prisma.notification.findMany({
      where: { userId, organizationId },
      orderBy: { createdAt: 'desc' },
      take
    });
  }

  countUnread(userId: string, organizationId: string) {
    return this.prisma.notification.count({
      where: { userId, organizationId, readAt: null }
    });
  }

  markRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() }
    });
  }

  markAllRead(userId: string, organizationId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, organizationId, readAt: null },
      data: { readAt: new Date() }
    });
  }

  getPreferences(userId: string, organizationId: string) {
    return this.prisma.notificationPreference.findMany({
      where: { userId, organizationId }
    });
  }

  upsertPreference(data: {
    userId: string;
    organizationId: string;
    eventType: string;
    channel: string;
    enabled: boolean;
  }) {
    return this.prisma.notificationPreference.upsert({
      where: {
        userId_organizationId_eventType_channel: {
          userId: data.userId,
          organizationId: data.organizationId,
          eventType: data.eventType,
          channel: data.channel
        }
      },
      update: { enabled: data.enabled },
      create: data
    });
  }

  createNotification(data: {
    userId: string;
    organizationId: string;
    type: string;
    title: string;
    body?: string | null;
    actionUrl?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    return this.prisma.notification.create({
      data: {
        userId: data.userId,
        organizationId: data.organizationId,
        type: data.type,
        title: data.title,
        body: data.body ?? null,
        actionUrl: data.actionUrl ?? null,
        metadata: jsonToDb(data.metadata, {})
      }
    });
  }
}
