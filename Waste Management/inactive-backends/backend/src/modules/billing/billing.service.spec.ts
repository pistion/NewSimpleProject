import { BillingService } from './billing.service';

describe('BillingService', () => {
  const context = { userId: 'user_1', organizationId: 'org_1' };

  it('returns a free-plan summary when no subscription exists', async () => {
    const repository = {
      findCurrentSubscription: jest.fn().mockResolvedValue(null),
      listInvoices:            jest.fn().mockResolvedValue([]),
      listUsage:               jest.fn().mockResolvedValue([]),
      getWorkspaceCounts:      jest.fn().mockResolvedValue({ projects: 2, teamMembers: 1 })
    };
    const service = new BillingService(repository as never);

    await expect(service.getSummary(context)).resolves.toMatchObject({
      subscription: {
        status: 'active',
        plan: { key: 'free', name: 'Free' }
      },
      invoices: [],
      usage: expect.arrayContaining([
        expect.objectContaining({ metric: 'projects',     value: 2 }),
        expect.objectContaining({ metric: 'team_members', value: 1 })
      ])
    });
  });

  it('returns subscription, invoices, and stored usage records', async () => {
    const subscription = {
      id: 'sub_1',
      status: 'active',
      currentPeriodStart: new Date('2026-05-01T00:00:00.000Z'),
      currentPeriodEnd:   new Date('2026-06-01T00:00:00.000Z'),
      cancelAtPeriodEnd:  false,
      plan: {
        key: 'pro', name: 'Pro', priceMonthlyCents: 1900, currency: 'USD',
        limits: { buildMinutesPerMonth: 2000, bandwidthGbPerMonth: 100, projects: 20, teamMembers: 5 },
        features: {}
      }
    };
    const repository = {
      findCurrentSubscription: jest.fn().mockResolvedValue(subscription),
      listInvoices:            jest.fn().mockResolvedValue([{ id: 'inv_1' }]),
      listUsage:               jest.fn().mockResolvedValue([{ metricKey: 'build_minutes', quantity: 184 }]),
      getWorkspaceCounts:      jest.fn().mockResolvedValue({ projects: 4, teamMembers: 3 })
    };
    const service = new BillingService(repository as never);

    await expect(service.getSummary(context)).resolves.toMatchObject({
      subscription: { id: 'sub_1', plan: { key: 'pro', name: 'Pro' } },
      invoices: [{ id: 'inv_1' }],
      usage: expect.arrayContaining([
        expect.objectContaining({ metric: 'build_minutes', value: 184 })
      ])
    });
  });
});
