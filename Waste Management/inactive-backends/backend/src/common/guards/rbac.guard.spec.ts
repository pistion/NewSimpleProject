import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacGuard } from './rbac.guard';

describe('RbacGuard', () => {
  it('allows requests with all required permissions', () => {
    const guard = new RbacGuard({
      getAllAndOverride: jest.fn().mockReturnValue(['project:read'])
    } as unknown as Reflector);

    expect(guard.canActivate(buildContext(['project:read', 'activity:read']) as never)).toBe(true);
  });

  it('rejects requests missing required permissions', () => {
    const guard = new RbacGuard({
      getAllAndOverride: jest.fn().mockReturnValue(['billing:manage'])
    } as unknown as Reflector);

    expect(() => guard.canActivate(buildContext(['billing:read']) as never)).toThrow(ForbiddenException);
  });

  it('allows routes without declared permissions', () => {
    const guard = new RbacGuard({
      getAllAndOverride: jest.fn().mockReturnValue(undefined)
    } as unknown as Reflector);

    expect(guard.canActivate(buildContext([]) as never)).toBe(true);
  });
});

function buildContext(permissions: string[]) {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({
        auth: { permissions }
      })
    })
  };
}
