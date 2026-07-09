import { Injectable, NotFoundException } from '@nestjs/common';
import { UpsertPreferenceDto } from './dto/upsert-preference.dto';
import { NotificationsRepository } from './notifications.repository';

interface ActorContext {
  userId: string;
  organizationId: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly repo: NotificationsRepository) {}

  async list(context: ActorContext) {
    const [notifications, unread] = await Promise.all([
      this.repo.listForUser(context.userId, context.organizationId),
      this.repo.countUnread(context.userId, context.organizationId)
    ]);
    return { notifications, unread };
  }

  async markRead(notificationId: string, context: ActorContext) {
    const count = await this.repo.markRead(notificationId, context.userId);
    if (count.count === 0) {
      throw new NotFoundException('Notification not found.');
    }
    return { updated: true };
  }

  async markAllRead(context: ActorContext) {
    await this.repo.markAllRead(context.userId, context.organizationId);
    return { updated: true };
  }

  getPreferences(context: ActorContext) {
    return this.repo.getPreferences(context.userId, context.organizationId);
  }

  upsertPreference(dto: UpsertPreferenceDto, context: ActorContext) {
    return this.repo.upsertPreference({
      userId: context.userId,
      organizationId: context.organizationId,
      eventType: dto.eventType,
      channel: dto.channel,
      enabled: dto.enabled
    });
  }

  /** Internal helper — other modules call this to create notifications */
  create(data: {
    userId: string;
    organizationId: string;
    type: string;
    title: string;
    body?: string;
    actionUrl?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.repo.createNotification(data);
  }
}
