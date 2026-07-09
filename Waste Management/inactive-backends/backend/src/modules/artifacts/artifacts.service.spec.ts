import { NotFoundException } from '@nestjs/common';
import { ArtifactsService } from './artifacts.service';

describe('ArtifactsService', () => {
  const context = { organizationId: 'org_1' };

  it('lists artifacts only after the project belongs to the organization', async () => {
    const artifacts = [{ id: 'artifact_1' }];
    const repository = {
      findProjectForOrganization: jest.fn().mockResolvedValue({ id: 'project_1' }),
      listForProject: jest.fn().mockResolvedValue(artifacts)
    };
    const service = new ArtifactsService(repository as never);

    await expect(service.listForProject('project_1', context)).resolves.toEqual(artifacts);
    expect(repository.findProjectForOrganization).toHaveBeenCalledWith('project_1', 'org_1');
    expect(repository.listForProject).toHaveBeenCalledWith('project_1', 'org_1');
  });

  it('rejects artifact listing for projects outside the organization', async () => {
    const repository = {
      findProjectForOrganization: jest.fn().mockResolvedValue(null)
    };
    const service = new ArtifactsService(repository as never);

    await expect(service.listForProject('project_1', context)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws not found for artifacts outside the organization', async () => {
    const repository = {
      findByIdForOrganization: jest.fn().mockResolvedValue(null)
    };
    const service = new ArtifactsService(repository as never);

    await expect(service.get('artifact_1', context)).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.findByIdForOrganization).toHaveBeenCalledWith('artifact_1', 'org_1');
  });
});
