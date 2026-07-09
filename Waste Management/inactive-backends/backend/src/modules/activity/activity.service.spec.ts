import { ActivityService } from './activity.service';

describe('ActivityService', () => {
  const context = {
    organizationId: 'org_1'
  };

  it('lists activity for the current organization with a bounded limit', async () => {
    const repository = {
      listActivity: jest.fn().mockResolvedValue([{ id: 'activity_1' }])
    };
    const service = new ActivityService(repository as never);

    await expect(service.listActivity(context, 250)).resolves.toEqual([{ id: 'activity_1' }]);
    expect(repository.listActivity).toHaveBeenCalledWith('org_1', 100);
  });

  it('lists audit rows for the current organization with a default limit', async () => {
    const repository = {
      listAudit: jest.fn().mockResolvedValue([{ id: 'audit_1' }])
    };
    const service = new ActivityService(repository as never);

    await expect(service.listAudit(context, Number.NaN)).resolves.toEqual([{ id: 'audit_1' }]);
    expect(repository.listAudit).toHaveBeenCalledWith('org_1', 50);
  });
});
