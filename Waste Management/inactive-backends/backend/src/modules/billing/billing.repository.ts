import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class BillingRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCurrentSubscription(organizationId: string) {
    return this.prisma.billingSubscription.findFirst({
      where: { organizationId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  findSubscriptionByProviderId(providerSubscriptionId: string) {
    return this.prisma.billingSubscription.findFirst({
      where: { providerSubscriptionId }
    });
  }

  async upsertSubscription(data: {
    organizationId: string;
    planId: string;
    provider: string;
    providerSubscriptionId: string;
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
  }) {
    const existing = await this.findSubscriptionByProviderId(data.providerSubscriptionId);
    if (existing) {
      return this.prisma.billingSubscription.update({
        where: { id: existing.id },
        data: {
          status: data.status as any,
          currentPeriodStart: data.currentPeriodStart,
          currentPeriodEnd: data.currentPeriodEnd,
          cancelAtPeriodEnd: data.cancelAtPeriodEnd,
          planId: data.planId
        }
      });
    }

    return this.prisma.billingSubscription.create({
      data: {
        organizationId: data.organizationId,
        planId: data.planId,
        provider: data.provider,
        providerSubscriptionId: data.providerSubscriptionId,
        status: data.status as any,
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd
      }
    });
  }

  updateSubscription(id: string, data: {
    status?: string;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
    cancelAtPeriodEnd?: boolean;
  }) {
    return this.prisma.billingSubscription.update({
      where: { id },
      data: data as any
    });
  }

  listInvoices(organizationId: string) {
    return this.prisma.billingInvoice.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
  }

  createInvoice(data: {
    organizationId: string;
    providerInvoiceId?: string;
    status: string;
    amountCents: number;
    currency: string;
    paidAt?: Date;
  }) {
    return this.prisma.billingInvoice.create({
      data: {
        organizationId: data.organizationId,
        providerInvoiceId: data.providerInvoiceId,
        status: data.status as any,
        currency: data.currency,
        amountPaidCents: data.status === 'paid' ? data.amountCents : 0,
        amountDueCents: data.amountCents,
        paidAt: data.paidAt
      }
    });
  }

  listUsage(organizationId: string) {
    return this.prisma.billingUsageRecord.findMany({
      where: { organizationId },
      orderBy: { metricKey: 'asc' }
    });
  }

  async getWorkspaceCounts(organizationId: string) {
    const [projects, teamMembers] = await Promise.all([
      this.prisma.project.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.organizationMember.count({ where: { organizationId, status: 'active' } })
    ]);
    return { projects, teamMembers };
  }

  findPlanByKey(key: string) {
    return this.prisma.billingPlan.findUnique({ where: { key } });
  }

  findOrganizationById(id: string) {
    return this.prisma.organization.findUnique({ where: { id } });
  }

}
