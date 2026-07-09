import { Injectable } from '@nestjs/common';
import { ActivityRepository } from './activity.repository';

interface ActorContext {
  organizationId: string;
}

@Injectable()
export class ActivityService {
  constructor(private readonly activityRepository: ActivityRepository) {}

  listActivity(context: ActorContext, limit?: number) {
    return this.activityRepository.listActivity(context.organizationId, this.normalizeLimit(limit));
  }

  listAudit(context: ActorContext, limit?: number) {
    return this.activityRepository.listAudit(context.organizationId, this.normalizeLimit(limit));
  }

  private normalizeLimit(limit?: number) {
    if (!limit || Number.isNaN(limit)) return 50;
    return Math.min(100, Math.max(1, limit));
  }
}
