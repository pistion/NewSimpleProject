import { DeploymentStatus } from '../../common/prisma-enums';
import { DeploymentProcessor } from './deployment.processor';
import { PROCESS_DEPLOYMENT_BUILD_JOB } from '../queues/queue.constants';

describe('DeploymentProcessor', () => {
  it('moves queued deployments through build, upload, and deployed states', async () => {
    let status: DeploymentStatus = DeploymentStatus.queued;
    let sequence = 1;
    const updates: DeploymentStatus[] = [];
    const logs: string[] = [];
    const artifacts: unknown[] = [];
    const storage = {
      createDeploymentArtifactObject: jest.fn().mockReturnValue({
        bucket: 'glondia-artifacts',
        objectKey: 'organizations/org_1/projects/project_1/deployments/deployment_1/artifact.zip',
        publicUrl: null
      })
    };
    const buildRunner = {
      run: jest.fn().mockResolvedValue({
        outputDirectory: 'dist',
        sizeBytes: 42,
        checksum: 'sha256:abc',
        logs: ['Build runner started.', 'Build runner completed.']
      })
    };
    const tx = {
      deployment: {
        findFirst: jest.fn().mockImplementation(() => ({
          id: 'deployment_1',
          organizationId: 'org_1',
          projectId: 'project_1',
          project: {
            installCommand: 'npm install',
            buildCommand: 'npm run build',
            outputDirectory: 'dist',
            rootDirectory: null
          },
          status
        })),
        update: jest.fn().mockImplementation(({ data }) => {
          if (data.status) {
            status = data.status;
            updates.push(data.status);
          }
          return { id: 'deployment_1', status };
        })
      },
      artifact: {
        create: jest.fn().mockImplementation(({ data }) => {
          const artifact = { id: 'artifact_1', ...data };
          artifacts.push(artifact);
          return artifact;
        })
      },
      deploymentLog: {
        count: jest.fn().mockImplementation(() => sequence++),
        create: jest.fn().mockImplementation(({ data }) => {
          logs.push(data.message);
          return data;
        })
      }
    };
    const prisma = {
      deployment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'deployment_1',
          organizationId: 'org_1',
          projectId: 'project_1',
          project: {
            installCommand: 'npm install',
            buildCommand: 'npm run build',
            outputDirectory: 'dist',
            rootDirectory: null
          },
          status: DeploymentStatus.queued
        })
      },
      $transaction: jest.fn((callback) => callback(tx))
    };
    const processor = new DeploymentProcessor(
      { get: jest.fn() } as never,
      buildRunner as never,
      storage as never,
      prisma as never
    );

    await (processor as unknown as { process: (job: unknown) => Promise<void> }).process({
      id: 'job_1',
      name: PROCESS_DEPLOYMENT_BUILD_JOB,
      data: {
        version: 1,
        organizationId: 'org_1',
        deploymentId: 'deployment_1',
        requestedByUserId: 'user_1'
      }
    });

    expect(updates).toEqual([
      DeploymentStatus.building,
      DeploymentStatus.uploading,
      DeploymentStatus.deployed
    ]);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({
      sizeBytes: 42,
      checksum: 'sha256:abc'
    });
    expect(buildRunner.run).toHaveBeenCalledWith({
      organizationId: 'org_1',
      projectId: 'project_1',
      deploymentId: 'deployment_1',
      installCommand: 'npm install',
      buildCommand: 'npm run build',
      outputDirectory: 'dist',
      rootDirectory: null
    });
    expect(storage.createDeploymentArtifactObject).toHaveBeenCalledWith({
      organizationId: 'org_1',
      projectId: 'project_1',
      deploymentId: 'deployment_1'
    });
    expect(logs).toEqual([
      'Deployment worker picked up the build.',
      'Build runner started.',
      'Build runner completed.',
      'Build completed. Recording deployment artifact.',
      'Deployment artifact recorded.',
      'Deployment published.'
    ]);
  });

  it('does not advance deployments that are no longer queued', async () => {
    const prisma = {
      deployment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'deployment_1',
          organizationId: 'org_1',
          status: DeploymentStatus.cancelled
        })
      },
      $transaction: jest.fn()
    };
    const processor = new DeploymentProcessor({ get: jest.fn() } as never, {} as never, {} as never, prisma as never);

    await (processor as unknown as { process: (job: unknown) => Promise<void> }).process({
      id: 'job_1',
      name: PROCESS_DEPLOYMENT_BUILD_JOB,
      data: {
        version: 1,
        organizationId: 'org_1',
        deploymentId: 'deployment_1',
        requestedByUserId: 'user_1'
      }
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
