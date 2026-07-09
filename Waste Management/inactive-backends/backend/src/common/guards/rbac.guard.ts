import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { RequestWithContext } from '../types/request-with-context';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()]
    ) ?? [];

    if (requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const grantedPermissions = new Set(request.auth?.permissions ?? []);
    const missingPermissions = requiredPermissions.filter((permission) => !grantedPermissions.has(permission));

    if (missingPermissions.length > 0) {
      throw new ForbiddenException({
        code: 'MISSING_PERMISSION',
        message: 'You do not have permission to access this resource.',
        missingPermissions
      });
    }

    return true;
  }
}
