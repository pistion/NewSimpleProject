import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

describe('StorageService', () => {
  it('builds deterministic deployment artifact object descriptors', () => {
    const service = new StorageService({
      get: (key: string, fallback?: string) => key === 'S3_ARTIFACTS_BUCKET' ? 'glondia-artifacts' : fallback,
      getOrThrow: () => 'glondia-artifacts'
    } as unknown as ConfigService);

    expect(service.createDeploymentArtifactObject({
      organizationId: 'org_1',
      projectId: 'project_1',
      deploymentId: 'deployment_1'
    })).toEqual({
      bucket: 'glondia-artifacts',
      objectKey: 'organizations/org_1/projects/project_1/deployments/deployment_1/artifact.zip',
      publicUrl: null
    });
  });
});
