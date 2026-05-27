import { HealthService } from './health.service';

describe('HealthService', () => {
  const redis = {
    isConnected: true,
    ping: jest.fn().mockResolvedValue(true),
  } as never;

  it('reports ok when the database and redis are up', async () => {
    const service = new HealthService(
      {
        getOrThrow: (key: string) => ({
          'app.name': 'glondia-backend',
          'app.nodeEnv': 'test'
        })[key],
        get: (_key: string, fallback?: unknown) => fallback,
      } as never,
      {
        $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }])
      } as never,
      redis
    );

    await expect(service.getHealth()).resolves.toMatchObject({
      status: 'ok',
      app: 'glondia-backend',
      environment: 'test',
      dependencies: {
        database: 'up',
        redis: 'up',
      }
    });
  });
});
