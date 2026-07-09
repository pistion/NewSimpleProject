import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProjectsService } from './projects.service';

describe('ProjectsService', () => {
  const context = {
    userId: 'user_1',
    organizationId: 'org_1'
  };
  const crypto = {
    encrypt: jest.fn((value: string) => `encrypted:${value}`)
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a project with a generated slug and activity log', async () => {
    const project = {
      id: 'project_1',
      organizationId: 'org_1',
      name: 'Ema Store',
      slug: 'ema-store'
    };
    const repository = {
      findBySlugForOrganization: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(project)
    };
    const prisma = {
      activityLog: {
        create: jest.fn().mockResolvedValue({})
      }
    };
    const service = new ProjectsService(repository as never, crypto as never, prisma as never);

    await expect(service.create({ name: 'Ema Store' }, context)).resolves.toMatchObject(project);
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org_1',
      createdByUserId: 'user_1',
      slug: 'ema-store'
    }));
    expect(prisma.activityLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organizationId: 'org_1',
        entityId: 'project_1',
        action: 'project.created'
      })
    }));
  });

  it('rejects duplicate slugs inside an organization', async () => {
    const repository = {
      findBySlugForOrganization: jest.fn().mockResolvedValue({ id: 'project_existing' })
    };
    const service = new ProjectsService(repository as never, crypto as never, {} as never);

    await expect(service.create({ name: 'Ema Store' }, context)).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws not found when reading outside the current organization', async () => {
    const repository = {
      findByIdForOrganization: jest.fn().mockResolvedValue(null)
    };
    const service = new ProjectsService(repository as never, crypto as never, {} as never);

    await expect(service.get('project_1', context)).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.findByIdForOrganization).toHaveBeenCalledWith('project_1', 'org_1');
  });

  it('creates encrypted environment variables without returning raw values', async () => {
    const project = {
      id: 'project_1',
      organizationId: 'org_1',
      name: 'Ema Store',
      slug: 'ema-store'
    };
    const envVar = {
      id: 'env_1',
      key: 'API_TOKEN',
      environment: 'production',
      createdAt: new Date('2026-05-21T00:00:00.000Z'),
      updatedAt: new Date('2026-05-21T00:00:00.000Z')
    };
    const repository = {
      findByIdForOrganization: jest.fn().mockResolvedValue(project),
      findEnvVarByKey: jest.fn().mockResolvedValue(null),
      createEnvVar: jest.fn().mockResolvedValue(envVar)
    };
    const prisma = {
      activityLog: {
        create: jest.fn().mockResolvedValue({})
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({})
      }
    };
    const service = new ProjectsService(repository as never, crypto as never, prisma as never);

    const result = await service.createEnvVar('project_1', {
      key: 'API_TOKEN',
      value: 'super-secret',
      environment: 'production'
    }, context);

    expect(repository.createEnvVar).toHaveBeenCalledWith(expect.objectContaining({
      valueEncrypted: 'encrypted:super-secret'
    }));
    expect(result).toMatchObject({
      id: 'env_1',
      key: 'API_TOKEN',
      value: '********'
    });
  });
});
