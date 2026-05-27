import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const configValues: Record<string, unknown> = {
    JWT_ACCESS_SECRET: 'test_access_secret_value',
    ACCESS_TOKEN_TTL_MINUTES: 15,
    REFRESH_TOKEN_TTL_DAYS: 30
  };

  const config = {
    getOrThrow: (key: string) => configValues[key],
    get: (key: string, fallback?: unknown) => configValues[key] ?? fallback,
  } as ConfigService;

  const jwtService = {
    sign: jest.fn().mockReturnValue('access.jwt.token')
  } as unknown as JwtService;

  const redis = {
    blacklistSession: jest.fn().mockResolvedValue(undefined),
    isTokenBlacklisted: jest.fn().mockResolvedValue(false),
    isSessionBlacklisted: jest.fn().mockResolvedValue(false),
  } as never;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers a user with a default organization and session', async () => {
    const created = buildCreatedRecords();
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null)
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue(null)
      },
      $transaction: jest.fn(async (callback) => callback({
        role: {
          findFirst: jest.fn().mockResolvedValue({ id: 'role_owner' })
        },
        user: {
          create: jest.fn().mockResolvedValue(created.user)
        },
        organization: {
          create: jest.fn().mockResolvedValue(created.organization)
        },
        organizationMember: {
          create: jest.fn().mockResolvedValue(created.membership)
        },
        session: {
          create: jest.fn().mockResolvedValue(created.session)
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({})
        }
      }))
    };

    const service = new AuthService(config, jwtService, prisma as never, redis);
    const result = await service.register({
      name: 'Matilda Karowal',
      email: 'MATILDA@GLONDIA.APP',
      password: 'verysecurepassword',
      organizationName: 'Glondia'
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'matilda@glondia.app' } });
    expect(result.user.email).toBe('matilda@glondia.app');
    expect(result.organization.slug).toBe('glondia');
    expect(result.tokens.accessToken).toBe('access.jwt.token');
    expect(result.tokens.refreshToken).toEqual(expect.any(String));
  });

  it('rejects duplicate registration emails', async () => {
    const service = new AuthService(config, jwtService, {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user_1' })
      }
    } as never, redis);

    await expect(service.register({
      name: 'Existing User',
      email: 'existing@glondia.app',
      password: 'verysecurepassword'
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('rotates a valid refresh token', async () => {
    const records = buildCreatedRecords();
    const refreshTokenHash = await bcrypt.hash('current-refresh-token-value', 4);
    const prisma = {
      session: {
        findUnique: jest.fn().mockResolvedValue({
          ...records.session,
          refreshTokenHash,
          revokedAt: null,
          user: {
            ...records.user,
            status: 'active',
            memberships: [{
              ...records.membership,
              organization: records.organization,
              role: { id: 'role_owner' }
            }]
          }
        }),
        update: jest.fn().mockResolvedValue({
          ...records.session,
          expiresAt: new Date('2026-07-20T00:00:00.000Z')
        })
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({})
      }
    };

    const service = new AuthService(config, jwtService, prisma as never, redis);
    const result = await service.refresh({
      sessionId: records.session.id,
      refreshToken: 'current-refresh-token-value'
    });

    expect(prisma.session.update).toHaveBeenCalled();
    expect(result.tokens.accessToken).toBe('access.jwt.token');
    expect(result.tokens.refreshToken).not.toBe('current-refresh-token-value');
  });

  it('revokes a valid logout session', async () => {
    const records = buildCreatedRecords();
    const refreshTokenHash = await bcrypt.hash('current-refresh-token-value', 4);
    const prisma = {
      session: {
        findUnique: jest.fn().mockResolvedValue({
          ...records.session,
          userId: records.user.id,
          refreshTokenHash,
          revokedAt: null,
          user: records.user
        }),
        update: jest.fn().mockResolvedValue({})
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({})
      },
      $transaction: jest.fn().mockResolvedValue([])
    };

    const service = new AuthService(config, jwtService, prisma as never, redis);
    const result = await service.logout({
      sessionId: records.session.id,
      refreshToken: 'current-refresh-token-value'
    });

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(result).toEqual({ revoked: true });
  });
});

function buildCreatedRecords() {
  return {
    user: {
      id: 'user_1',
      email: 'matilda@glondia.app',
      name: 'Matilda Karowal',
      avatarUrl: null
    },
    organization: {
      id: 'org_1',
      name: 'Glondia',
      slug: 'glondia'
    },
    membership: {
      id: 'member_1',
      roleId: 'role_owner'
    },
    session: {
      id: 'session_1',
      expiresAt: new Date('2026-06-20T00:00:00.000Z')
    }
  };
}
