import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { RequestWithContext } from '../../../common/types/request-with-context';

interface AccessTokenPayload {
  sub: string;
  organizationId: string;
  membershipId: string;
  sessionId: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const token = this.getBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET')
      });
    } catch {
      throw new UnauthorizedException('Invalid bearer token.');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
      include: {
        user: true
      }
    });

    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== 'active'
    ) {
      throw new UnauthorizedException('Invalid authenticated session.');
    }

    const organizationId = this.resolveOrganizationId(request, payload.organizationId);
    const membership = await this.prisma.organizationMember.findFirst({
      where: {
        userId: payload.sub,
        organizationId,
        status: 'active'
      },
      include: {
        organization: true,
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true
              }
            }
          }
        }
      }
    });

    if (!membership) {
      throw new UnauthorizedException('No active organization membership found.');
    }

    request.auth = {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        avatarUrl: session.user.avatarUrl,
        status: session.user.status
      },
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug
      },
      membership: {
        id: membership.id,
        roleId: membership.roleId,
        roleKey: membership.role.key
      },
      session: {
        id: session.id
      },
      permissions: membership.role.rolePermissions.map((rolePermission) => rolePermission.permission.key)
    };

    return true;
  }

  private getBearerToken(request: RequestWithContext) {
    const authorization = request.header('authorization');
    if (!authorization) {
      return null;
    }

    const [scheme, token] = authorization.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : null;
  }

  private resolveOrganizationId(request: RequestWithContext, tokenOrganizationId: string) {
    const headerValue = request.header('x-organization-id')?.trim();
    return headerValue && headerValue.length > 0 ? headerValue : tokenOrganizationId;
  }
}
