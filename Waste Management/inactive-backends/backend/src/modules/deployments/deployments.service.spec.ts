import { ConflictException, NotFoundException } from '@nestjs/common';
import { DeploymentsService } from './deployments.service';

describe('DeploymentsService', () => {
  const context = {
    userId: 'user_1',
    organizationId: 'org_1'
  };
  const queue = {
    enqueueBuild: jest.fn().mockResolvedValue({ id: 'job_1' })
  };
  const render = {
    isConfigured: jest.fn().mockReturnValue(false),
    triggerDeploy: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a queued deployment, first log line, and activity event', async () => {
    const project = {
      id: 'project_1',
      name: 'Ema Store'
    };
    const deployment = {
      id: 'deployment_1',
      organizationId: 'org_1',
      projectId: 'project_1',
      environment: 'production',
      source: 'manual',
      status: 'queued'
    };
    const repository = {
      findProjectForOrganization: jest.fn().mockResolvedValue(project),
      create: jest.fn().mockResolvedValue(deployment),
      createLog: jest.fn().mockResolvedValue({})
    };
    const prisma = {
      activityLog: {
        create: jest.fn().mockResolvedValue({})
      }
    };
    const service = new DeploymentsService(repository as never, queue as never, prisma as never, render as never);

    await expect(service.create('project_1', { environment: 'production' }, context))
      .resolves.toMatchObject(deployment);
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org_1',
      projectId: 'project_1',
      triggeredByUserId: 'user_1'
    }));
    expect(repository.createLog).toHaveBeenCalledWith(expect.objectContaining({
      deploymentId: 'deployment_1',
      sequence: 1,
      message: 'Deployment queued.'
    }));
    expect(prisma.activityLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        entityType: 'deployment',
        entityId: 'deployment_1',
        action: 'deployment.queued'
      })
    }));
    expect(queue.enqueueBuild).toHaveBeenCalledWith({
      version: 1,
      organizationId: 'org_1',
      deploymentId: 'deployment_1',
      requestedByUserId: 'user_1'
    });
  });

  it('triggers Render when the project has a Render service ID', async () => {
    const project = {
      id: 'project_1',
      name: 'Ema Store',
      renderServiceId: 'srv_123'
    };
    const deployment = {
      id: 'deployment_1',
      organizationId: 'org_1',
      projectId: 'project_1',
      environment: 'production',
      source: 'manual',
      status: 'queued'
    };
    const repository = {
      findProjectForOrganization: jest.fn().mockResolvedValue(project),
      create: jest.fn().mockResolvedValue(deployment),
      createLog: jest.fn().mockResolvedValue({}),
      updateProvider: jest.fn().mockResolvedValue({
        ...deployment,
        provider: 'render',
        providerServiceId: 'srv_123',
        providerDeployId: 'dep_123'
      })
    };
    const prisma = {
      activityLog: {
        create: jest.fn().mockResolvedValue({})
      }
    };
    const renderConfigured = {
      isConfigured: jest.fn().mockReturnValue(true),
      triggerDeploy: jest.fn().mockResolvedValue({ id: 'dep_123', status: 'build_in_progress' })
    };
    const service = new DeploymentsService(repository as never, queue as never, prisma as never, renderConfigured as never);

    await expect(service.create('project_1', { environment: 'production' }, context))
      .resolves.toMatchObject({ provider: 'render', providerDeployId: 'dep_123' });
    expect(renderConfigured.triggerDeploy).toHaveBeenCalledWith('srv_123');
    expect(repository.updateProvider).toHaveBeenCalledWith('deployment_1', expect.objectContaining({
      provider: 'render',
      providerServiceId: 'srv_123',
      providerDeployId: 'dep_123',
      providerStatus: 'build_in_progress'
    }));
    expect(queue.enqueueBuild).not.toHaveBeenCalled();
  });

  it('rejects deployment creation for projects outside the organization', async () => {
    const service = new DeploymentsService({
      findProjectForOrganization: jest.fn().mockResolvedValue(null)
    } as never, queue as never, {} as never, render as never);

    await expect(service.create('project_1', { environment: 'preview' }, context))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists logs only after the deployment belongs to the organization', async () => {
    const logs = [{ id: 'log_1', sequence: 1, message: 'Deployment queued.' }];
    const repository = {
      findByIdForOrganization: jest.fn().mockResolvedValue({ id: 'deployment_1' }),
      listLogs: jest.fn().mockResolvedValue(logs)
    };
    const service = new DeploymentsService(repository as never, queue as never, {} as never, render as never);

    await expect(service.listLogs('deployment_1', context)).resolves.toEqual(logs);
    expect(repository.findByIdForOrganization).toHaveBeenCalledWith('deployment_1', 'org_1');
    expect(repository.listLogs).toHaveBeenCalledWith('deployment_1', 'org_1');
  });

  it('cancels queued deployments and appends a log', async () => {
    const deployment = {
      id: 'deployment_1',
      organizationId: 'org_1',
      projectId: 'project_1',
      status: 'queued'
    };
    const cancelled = { ...deployment, status: 'cancelled' };
    const repository = {
      findByIdForOrganization: jest.fn().mockResolvedValue(deployment),
      updateStatus: jest.fn().mockResolvedValue(cancelled),
      getNextLogSequence: jest.fn().mockResolvedValue(2),
      createLog: jest.fn().mockResolvedValue({})
    };
    const prisma = {
      activityLog: {
        create: jest.fn().mockResolvedValue({})
      }
    };
    const service = new DeploymentsService(repository as never, queue as never, prisma as never, render as never);

    await expect(service.cancel('deployment_1', context)).resolves.toMatchObject(cancelled);
    expect(repository.updateStatus).toHaveBeenCalledWith('deployment_1', expect.objectContaining({
      status: 'cancelled'
    }));
    expect(repository.createLog).toHaveBeenCalledWith(expect.objectContaining({
      sequence: 2,
      level: 'warn',
      message: 'Deployment cancelled by user.'
    }));
  });

  it('rejects rollback unless deployment is deployed', async () => {
    const repository = {
      findByIdForOrganization: jest.fn().mockResolvedValue({
        id: 'deployment_1',
        organizationId: 'org_1',
        projectId: 'project_1',
        status: 'queued'
      })
    };
    const service = new DeploymentsService(repository as never, queue as never, {} as never, render as never);

    await expect(service.rollback('deployment_1', context)).rejects.toBeInstanceOf(ConflictException);
  });
});
