import { ConflictException, NotFoundException } from '@nestjs/common';
import { DomainsService } from './domains.service';

describe('DomainsService', () => {
  const context = { userId: 'user_1', organizationId: 'org_1' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates normalized domains and records activity/audit events', async () => {
    const domain = {
      id: 'domain_1',
      organizationId: 'org_1',
      hostname: 'emakora.co'
    };
    const repository = {
      findDomainByHostnameAny: jest.fn().mockResolvedValue(null),
      createDomain: jest.fn().mockResolvedValue(domain),
      findProjectForOrganization: jest.fn()
    };
    const prisma = mockPrisma();
    const service = new DomainsService(repository as never, prisma as never);

    await expect(service.create({ hostname: 'EmaKora.Co.' }, context)).resolves.toMatchObject(domain);
    expect(repository.createDomain).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org_1',
      hostname: 'emakora.co',
      createdByUserId: 'user_1'
    }));
    expect(prisma.activityLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        entityType: 'domain',
        entityId: 'domain_1',
        action: 'domain.created'
      })
    }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'domain.created',
        resourceType: 'domain',
        resourceId: 'domain_1'
      })
    }));
  });

  it('rejects active domains already managed anywhere', async () => {
    const repository = {
      findDomainByHostnameAny: jest.fn().mockResolvedValue({ id: 'domain_existing', deletedAt: null })
    };
    const service = new DomainsService(repository as never, mockPrisma() as never);

    await expect(service.create({ hostname: 'emakora.co' }, context)).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws not found when reading a domain outside the organization', async () => {
    const repository = {
      findDomainById: jest.fn().mockResolvedValue(null)
    };
    const service = new DomainsService(repository as never, mockPrisma() as never);

    await expect(service.get('domain_1', context)).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.findDomainById).toHaveBeenCalledWith('domain_1', 'org_1');
  });

  it('creates DNS records only after the domain belongs to the organization', async () => {
    const domain = { id: 'domain_1', organizationId: 'org_1', hostname: 'emakora.co' };
    const record = { id: 'record_1', domainId: 'domain_1', type: 'A', name: '@', value: '203.0.113.10' };
    const repository = {
      findDomainById: jest.fn().mockResolvedValue(domain),
      createRecord: jest.fn().mockResolvedValue(record)
    };
    const prisma = mockPrisma();
    const service = new DomainsService(repository as never, prisma as never);

    await expect(service.createRecord('domain_1', {
      type: 'A',
      name: '',
      value: '203.0.113.10'
    }, context)).resolves.toMatchObject(record);
    expect(repository.createRecord).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org_1',
      domainId: 'domain_1',
      type: 'A',
      name: '@',
      ttl: 3600
    }));
  });

  it('deletes DNS records only within the current domain and organization', async () => {
    const domain = { id: 'domain_1', organizationId: 'org_1', hostname: 'emakora.co' };
    const record = { id: 'record_1', type: 'TXT', name: '@' };
    const repository = {
      findDomainById: jest.fn().mockResolvedValue(domain),
      findRecordById: jest.fn().mockResolvedValue(record),
      deleteRecord: jest.fn().mockResolvedValue(record)
    };
    const service = new DomainsService(repository as never, mockPrisma() as never);

    await expect(service.deleteRecord('domain_1', 'record_1', context)).resolves.toEqual({ deleted: true });
    expect(repository.findRecordById).toHaveBeenCalledWith('record_1', 'domain_1', 'org_1');
    expect(repository.deleteRecord).toHaveBeenCalledWith('record_1');
  });
});

function mockPrisma() {
  return {
    activityLog: { create: jest.fn().mockResolvedValue({}) },
    auditLog: { create: jest.fn().mockResolvedValue({}) }
  };
}
