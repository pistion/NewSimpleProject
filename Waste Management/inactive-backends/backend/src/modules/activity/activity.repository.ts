import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ActivityRepository {
  constructor(private readonly prisma: PrismaService) {}

  listActivity(organizationId: string, take = 50) {
    return this.prisma.activityLog.findMany({
      where: { organizationId },
      include: { actor: true },
      orderBy: { createdAt: 'desc' },
      take
    });
  }

  listAudit(organizationId: string, take = 50) {
    return this.prisma.auditLog.findMany({
      where: { organizationId },
      include: { actor: true },
      orderBy: { createdAt: 'desc' },
      take
    });
  }
}
