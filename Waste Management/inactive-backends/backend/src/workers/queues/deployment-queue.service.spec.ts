import { DeploymentQueueService } from './deployment-queue.service';
import { PROCESS_DEPLOYMENT_BUILD_JOB } from './queue.constants';

const addMock = jest.fn().mockResolvedValue({ id: 'job_1' });
const closeMock = jest.fn().mockResolvedValue(undefined);
const disconnectMock = jest.fn();

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: addMock,
    close: closeMock
  }))
}));

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    disconnect: disconnectMock
  }))
}));

describe('DeploymentQueueService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('enqueues deployment builds with stable job ids', async () => {
    const service = new DeploymentQueueService({
      getOrThrow: () => 'redis://localhost:6379'
    } as never);

    await service.enqueueBuild({
      version: 1,
      organizationId: 'org_1',
      deploymentId: 'deployment_1',
      requestedByUserId: 'user_1'
    });

    expect(addMock).toHaveBeenCalledWith(
      PROCESS_DEPLOYMENT_BUILD_JOB,
      {
        version: 1,
        organizationId: 'org_1',
        deploymentId: 'deployment_1',
        requestedByUserId: 'user_1'
      },
      {
        jobId: `${PROCESS_DEPLOYMENT_BUILD_JOB}:deployment_1`
      }
    );
  });
});
