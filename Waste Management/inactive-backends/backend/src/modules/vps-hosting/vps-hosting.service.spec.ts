import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VpsHostingService } from './vps-hosting.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    PAYPAL_CLIENT_ID: 'pp_client',
    PAYPAL_CLIENT_SECRET: 'pp_secret',
    PAYPAL_SANDBOX: 'true',
    FRONTEND_URL: 'http://localhost:5173',
    PLATFORM_MARKUP_PERCENT: 30,
    ...overrides,
  };
  return {
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
  } as unknown as ConfigService;
}

function makeVultr(overrides: Partial<{
  isConfigured: () => boolean;
  listPlans: () => Promise<unknown[]>;
  createInstance: () => Promise<unknown>;
  getInstance: () => Promise<unknown>;
  startInstance: () => Promise<void>;
  haltInstance: () => Promise<void>;
  rebootInstance: () => Promise<void>;
  deleteInstance: () => Promise<void>;
}> = {}) {
  return {
    isConfigured:       jest.fn().mockReturnValue(true),
    listRegions:        jest.fn().mockResolvedValue([]),
    listPlans:          jest.fn().mockResolvedValue([{ id: 'vc2-1c-1gb', monthly_cost: 6 }]),
    listOperatingSystems: jest.fn().mockResolvedValue([]),
    createInstance:     jest.fn().mockResolvedValue({
      id: 'vultr-inst-abc',
      status: 'pending',
      main_ip: '1.2.3.4',
      vcpu_count: 1,
      ram: 1024,
      disk: 25,
    }),
    getInstance:        jest.fn().mockResolvedValue({ status: 'active', main_ip: '1.2.3.4' }),
    startInstance:      jest.fn().mockResolvedValue(undefined),
    haltInstance:       jest.fn().mockResolvedValue(undefined),
    rebootInstance:     jest.fn().mockResolvedValue(undefined),
    deleteInstance:     jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeQueue() {
  return {
    enqueueProvision: jest.fn().mockResolvedValue(undefined),
    enqueueRefund:    jest.fn().mockResolvedValue(undefined),
  };
}

function makePricing(markup = 30) {
  return {
    getVpsMarkup:    jest.fn().mockReturnValue(markup),
    getDomainMarkup: jest.fn().mockReturnValue(15),
  };
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    vpsService: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(buildVpsRecord()),
      update: jest.fn().mockResolvedValue(buildVpsRecord()),
    },
    vpsActionLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
}

function buildVpsRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'vps_1',
    organizationId: 'org_1',
    providerInstanceId: 'vultr-inst-abc',
    label: 'my-server',
    hostname: 'my-server.glondia.co',
    region: 'ewr',
    plan: 'vc2-1c-1gb',
    osId: 387,
    status: 'pending',
    mainIp: null,
    vcpuCount: 1,
    ramMb: 1024,
    diskGb: 25,
    monthlyCostCents: 600,
    markupPercent: 30,
    markupAmountCents: 180,
    totalPriceCents: 780,
    currency: 'USD',
    paypalOrderId: 'pp_order_1',
    paypalCaptureId: null,
    paymentStatus: 'completed',
    metadata: '{}',
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

const actor = { userId: 'user_1', organizationId: 'org_1' };

function mockPaypalTokenFetch(fetchMock: jest.Mock) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ access_token: 'pp_token', expires_in: 3600 }),
  } as unknown as Response);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('VpsHostingService', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── getSettings ──────────────────────────────────────────────────────────────

  describe('getSettings', () => {
    it('reports vultr configured when api key is present', () => {
      const vultr = makeVultr({ isConfigured: () => true });
      const svc = new VpsHostingService(makePrisma() as never, vultr as never, makeQueue() as never, makePricing() as never, makeConfig());
      expect(svc.getSettings().vultrConfigured).toBe(true);
    });

    it('reports vultr not configured when api key is missing', () => {
      const vultr = makeVultr({ isConfigured: () => false });
      const svc = new VpsHostingService(makePrisma() as never, vultr as never, makeQueue() as never, makePricing() as never, makeConfig());
      expect(svc.getSettings().vultrConfigured).toBe(false);
    });

    it('reports paypal configured when both credentials are present', () => {
      const svc = new VpsHostingService(makePrisma() as never, makeVultr() as never, makeQueue() as never, makePricing() as never, makeConfig());
      expect(svc.getSettings().paypalConfigured).toBe(true);
    });

    it('reports paypal not configured when credentials are missing', () => {
      const svc = new VpsHostingService(
        makePrisma() as never,
        makeVultr() as never,
        makeQueue() as never,
        makePricing() as never,
        makeConfig({ PAYPAL_CLIENT_ID: '', PAYPAL_CLIENT_SECRET: '' }),
      );
      expect(svc.getSettings().paypalConfigured).toBe(false);
    });

    it('returns markup percent from pricing service', () => {
      const svc = new VpsHostingService(
        makePrisma() as never,
        makeVultr() as never,
        makeQueue() as never,
        makePricing(25) as never,
        makeConfig(),
      );
      expect(svc.getSettings().markupPercent).toBe(25);
    });

    it('defaults markup to 30 when pricing service returns default', () => {
      const svc = new VpsHostingService(
        makePrisma() as never,
        makeVultr() as never,
        makeQueue() as never,
        makePricing(30) as never,
        makeConfig(),
      );
      expect(svc.getSettings().markupPercent).toBe(30);
    });
  });

  // ── getQuote ──────────────────────────────────────────────────────────────────

  describe('getQuote', () => {
    it('calculates 30% markup correctly on a $6/mo plan', async () => {
      const vultr = makeVultr({
        listPlans: async () => [{ id: 'vc2-1c-1gb', monthly_cost: 6 }],
      });
      const svc = new VpsHostingService(makePrisma() as never, vultr as never, makeQueue() as never, makePricing(30) as never, makeConfig());

      const quote = await svc.getQuote({ plan: 'vc2-1c-1gb', region: 'ewr', osId: 387 });

      expect(quote.baseMonthlyCostCents).toBe(600);
      expect(quote.markupAmountCents).toBe(180);
      expect(quote.totalMonthlyCostCents).toBe(780);
      expect(quote.markupPercent).toBe(30);
      expect(quote.breakdown.total).toBe('$7.80');
    });

    it('applies a custom markup percent from pricing service', async () => {
      const vultr = makeVultr({
        listPlans: async () => [{ id: 'vc2-1c-1gb', monthly_cost: 10 }],
      });
      const svc = new VpsHostingService(
        makePrisma() as never,
        vultr as never,
        makeQueue() as never,
        makePricing(20) as never,
        makeConfig(),
      );

      const quote = await svc.getQuote({ plan: 'vc2-1c-1gb', region: 'ewr', osId: 387 });

      expect(quote.baseMonthlyCostCents).toBe(1000);
      expect(quote.markupAmountCents).toBe(200);
      expect(quote.totalMonthlyCostCents).toBe(1200);
    });

    it('throws NotFoundException for an unknown plan id', async () => {
      const vultr = makeVultr({
        listPlans: async () => [{ id: 'vc2-1c-1gb', monthly_cost: 6 }],
      });
      const svc = new VpsHostingService(makePrisma() as never, vultr as never, makeQueue() as never, makePricing() as never, makeConfig());

      await expect(svc.getQuote({ plan: 'does-not-exist', region: 'ewr', osId: 387 }))
        .rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── capturePayPalOrder ────────────────────────────────────────────────────────

  describe('capturePayPalOrder', () => {
    const provision = {
      region: 'ewr',
      plan: 'vc2-1c-1gb',
      osId: 387,
      label: 'my-server',
      hostname: 'my-server',
    };

    it('returns the existing VPS record on duplicate capture (idempotent)', async () => {
      const existing = buildVpsRecord({ paypalOrderId: 'pp_order_1' });
      const prisma = makePrisma({
        vpsService: {
          findFirst: jest.fn().mockResolvedValue(existing),
          findMany: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
      });
      const svc = new VpsHostingService(prisma as never, makeVultr() as never, makeQueue() as never, makePricing() as never, makeConfig());

      const result = await svc.capturePayPalOrder({ orderId: 'pp_order_1' }, provision, actor);

      expect(result.id).toBe('vps_1');
      expect(prisma.vpsService.create).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when PayPal capture status is not COMPLETED', async () => {
      const prisma = makePrisma();
      const vultr = makeVultr();
      const svc = new VpsHostingService(prisma as never, vultr as never, makeQueue() as never, makePricing() as never, makeConfig());

      // PayPal token
      mockPaypalTokenFetch(fetchMock);
      // PayPal capture response — PENDING status
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'pp_order_1',
          status: 'PENDING',
          purchase_units: [{ payments: { captures: [{ id: 'cap_1', status: 'PENDING', amount: { value: '7.80', currency_code: 'USD' } }] } }],
        }),
      } as unknown as Response);

      await expect(svc.capturePayPalOrder({ orderId: 'pp_order_1' }, provision, actor))
        .rejects.toBeInstanceOf(BadRequestException);

      expect(vultr.createInstance).not.toHaveBeenCalled();
    });

    it('creates a pending VPS record and enqueues provisioning after a COMPLETED capture', async () => {
      const prisma = makePrisma();
      const vultr = makeVultr();
      const queue = makeQueue();
      const svc = new VpsHostingService(prisma as never, vultr as never, queue as never, makePricing() as never, makeConfig());

      // PayPal token
      mockPaypalTokenFetch(fetchMock);
      // PayPal capture — COMPLETED
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'pp_order_1',
          status: 'COMPLETED',
          purchase_units: [{ payments: { captures: [{ id: 'cap_1', status: 'COMPLETED', amount: { value: '7.80', currency_code: 'USD' } }] } }],
        }),
      } as unknown as Response);

      await svc.capturePayPalOrder({ orderId: 'pp_order_1' }, provision, actor);

      expect(prisma.vpsService.create).toHaveBeenCalled();
      expect(queue.enqueueProvision).toHaveBeenCalled();
      expect(vultr.createInstance).not.toHaveBeenCalled();
    });

    it('does not enqueue a second provision on duplicate capture', async () => {
      // First call — no existing VPS
      const prisma = makePrisma();
      const vultr = makeVultr();
      const queue = makeQueue();
      const svc = new VpsHostingService(prisma as never, vultr as never, queue as never, makePricing() as never, makeConfig());

      mockPaypalTokenFetch(fetchMock);
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'pp_order_1',
          status: 'COMPLETED',
          purchase_units: [{ payments: { captures: [{ id: 'cap_1', status: 'COMPLETED', amount: { value: '7.80', currency_code: 'USD' } }] } }],
        }),
      } as unknown as Response);
      await svc.capturePayPalOrder({ orderId: 'pp_order_1' }, provision, actor);

      // Second call — prisma.vpsService.findFirst now returns the created record
      const created = buildVpsRecord({ paypalOrderId: 'pp_order_1' });
      (prisma.vpsService.findFirst as jest.Mock).mockResolvedValue(created);

      const result = await svc.capturePayPalOrder({ orderId: 'pp_order_1' }, provision, actor);

      expect(queue.enqueueProvision).toHaveBeenCalledTimes(1); // not called again
      expect(result.id).toBe('vps_1');
    });

    it('throws BadRequestException when PayPal is not configured', async () => {
      const svc = new VpsHostingService(
        makePrisma() as never,
        makeVultr() as never,
        makeQueue() as never,
        makePricing() as never,
        makeConfig({ PAYPAL_CLIENT_ID: '', PAYPAL_CLIENT_SECRET: '' }),
      );

      await expect(svc.capturePayPalOrder({ orderId: 'pp_order_1' }, provision, actor))
        .rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── listServices ──────────────────────────────────────────────────────────────

  describe('listServices', () => {
    it('only returns services belonging to the requesting organization', async () => {
      const records = [
        buildVpsRecord({ id: 'vps_1', organizationId: 'org_1' }),
        buildVpsRecord({ id: 'vps_2', organizationId: 'org_1' }),
      ];
      const prisma = makePrisma({
        vpsService: {
          findMany: jest.fn().mockResolvedValue(records),
          findFirst: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
      });
      const svc = new VpsHostingService(prisma as never, makeVultr() as never, makeQueue() as never, makePricing() as never, makeConfig());

      const result = await svc.listServices(actor);

      expect(prisma.vpsService.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org_1' }) }),
      );
      expect(result).toHaveLength(2);
    });
  });

  // ── access control ────────────────────────────────────────────────────────────

  describe('access control', () => {
    it('throws ForbiddenException when org A tries to access org B VPS', async () => {
      const orgBRecord = buildVpsRecord({ organizationId: 'org_B' });
      const prisma = makePrisma({
        vpsService: {
          findFirst: jest.fn().mockResolvedValue(orgBRecord),
          findMany: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
      });
      const svc = new VpsHostingService(prisma as never, makeVultr() as never, makeQueue() as never, makePricing() as never, makeConfig());

      await expect(svc.startService('vps_1', { userId: 'user_A', organizationId: 'org_A' }))
        .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFoundException when VPS does not exist', async () => {
      const prisma = makePrisma({
        vpsService: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
      });
      const svc = new VpsHostingService(prisma as never, makeVultr() as never, makeQueue() as never, makePricing() as never, makeConfig());

      await expect(svc.startService('missing', actor))
        .rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── instance actions ──────────────────────────────────────────────────────────

  describe('instance actions', () => {
    function prismaWithOwned(record = buildVpsRecord()) {
      return makePrisma({
        vpsService: {
          findFirst: jest.fn().mockResolvedValue(record),
          findMany: jest.fn(),
          create: jest.fn(),
          update: jest.fn().mockResolvedValue(record),
        },
      });
    }

    it('startService calls vultr.startInstance with the provider instance id', async () => {
      const vultr = makeVultr();
      const svc = new VpsHostingService(prismaWithOwned() as never, vultr as never, makeQueue() as never, makePricing() as never, makeConfig());

      const result = await svc.startService('vps_1', actor);

      expect(vultr.startInstance).toHaveBeenCalledWith('vultr-inst-abc');
      expect(result).toEqual({ ok: true });
    });

    it('haltService calls vultr.haltInstance', async () => {
      const vultr = makeVultr();
      const svc = new VpsHostingService(prismaWithOwned() as never, vultr as never, makeQueue() as never, makePricing() as never, makeConfig());

      await svc.haltService('vps_1', actor);

      expect(vultr.haltInstance).toHaveBeenCalledWith('vultr-inst-abc');
    });

    it('rebootService calls vultr.rebootInstance', async () => {
      const vultr = makeVultr();
      const svc = new VpsHostingService(prismaWithOwned() as never, vultr as never, makeQueue() as never, makePricing() as never, makeConfig());

      await svc.rebootService('vps_1', actor);

      expect(vultr.rebootInstance).toHaveBeenCalledWith('vultr-inst-abc');
    });

    it('destroyService calls vultr.deleteInstance and marks record deleted', async () => {
      const vultr = makeVultr();
      const prisma = prismaWithOwned();
      const svc = new VpsHostingService(prisma as never, vultr as never, makeQueue() as never, makePricing() as never, makeConfig());

      await svc.destroyService('vps_1', actor);

      expect(vultr.deleteInstance).toHaveBeenCalledWith('vultr-inst-abc');
      expect(prisma.vpsService.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'vps_1' },
          data: expect.objectContaining({ status: 'destroyed' }),
        }),
      );
    });
  });
});
