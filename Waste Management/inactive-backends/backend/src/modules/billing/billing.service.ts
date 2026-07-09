import { Injectable, Logger } from '@nestjs/common';
import { jsonFromDb } from '../../common/json-field';
import { BillingRepository } from './billing.repository';

interface ActorContext {
  userId: string;
  organizationId: string;
  userEmail?: string;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(private readonly billingRepository: BillingRepository) {}

  async getSummary(context: ActorContext) {
    const [subscription, invoices, usageRecords, counts] = await Promise.all([
      this.billingRepository.findCurrentSubscription(context.organizationId),
      this.billingRepository.listInvoices(context.organizationId),
      this.billingRepository.listUsage(context.organizationId),
      this.billingRepository.getWorkspaceCounts(context.organizationId)
    ]);

    const plan = subscription?.plan ?? {
      key: 'free',
      name: 'Free',
      priceMonthlyCents: 0,
      limits: { projects: 3, teamMembers: 1, buildMinutesPerMonth: 300, bandwidthGbPerMonth: 10 },
      features: {}
    };

    const limits = jsonFromDb<Record<string, unknown>>((plan as { limits?: unknown }).limits, {});

    return {
      subscription: {
        id:                 subscription?.id ?? null,
        status:             subscription?.status ?? 'active',
        currentPeriodStart: subscription?.currentPeriodStart ?? null,
        currentPeriodEnd:   subscription?.currentPeriodEnd ?? null,
        cancelAtPeriodEnd:  subscription?.cancelAtPeriodEnd ?? false,
        plan
      },
      invoices,
      usage: this.buildUsage(usageRecords, limits, counts),
      paymentMethod: null
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private buildUsage(
    usageRecords: Array<{ metricKey: string; quantity: number }>,
    limits: Record<string, unknown>,
    counts: { projects: number; teamMembers: number }
  ) {
    const aggregated = new Map<string, number>();
    for (const r of usageRecords) {
      aggregated.set(r.metricKey, (aggregated.get(r.metricKey) ?? 0) + r.quantity);
    }

    return [
      { metric: 'build_minutes', value: aggregated.get('build_minutes') ?? 0, limit: limits.buildMinutesPerMonth ?? -1 },
      { metric: 'bandwidth_gb',  value: aggregated.get('bandwidth_gb')  ?? 0, limit: limits.bandwidthGbPerMonth  ?? -1 },
      { metric: 'projects',      value: counts.projects,                       limit: limits.projects             ?? -1 },
      { metric: 'team_members',  value: counts.teamMembers,                    limit: limits.teamMembers          ?? -1 }
    ];
  }
}
