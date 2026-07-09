import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { RequestWithContext } from '../../../common/types/request-with-context';

interface AccessTokenPayload {
  sub: string;
  organizationId: string;
  membershipId: string;
  sessionId: string;
  jti?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {}

  async canActivate(context: ExecutionContext) {
    // ⚠️  AUTH BYPASS — set AUTH_DISABLED=true in .env for local service testing ONLY.
    // Never enable this in production.
    if (process.env.AUTH_DISABLED === 'true') {
      const request = context.switchToHttp().getRequest<RequestWithContext>();
      request.auth = {
        user:       { id: 'dev-user-1', email: 'dev@glondia.app', name: 'Dev User', avatarUrl: null, status: 'active' },
        organization: { id: 'dev-org-1', name: 'Dev Org', slug: 'dev-org' },
        membership: { id: 'dev-member-1', roleId: 'dev-role-owner', roleKey: 'owner' },
        session:    { id: 'dev-session-1' },
        permissions: ['organization:read','organization:update','project:create','project:read',
          'project:update','project:delete','deployment:create','deployment:read','domain:create',
          'domain:read','billing:read','billing:manage','builder:create','builder:read',
          'builder:update','builder:publish','admin:access']
      };
      return true;
    }

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

    // Redis blacklist check — immediate revocation without waiting for token expiry
    const blacklistKey = payload.jti ?? payload.sessionId;
    if (await this.redis.isTokenBlacklisted(blacklistKey)) {
      throw new UnauthorizedException('Token has been revoked.');
    }
    if (await this.redis.isSessionBlacklisted(payload.sessionId)) {
      throw new UnauthorizedException('Session has been revoked.');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
      include: { user: true }
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
      where: { userId: payload.sub, organizationId, status: 'active' },
      include: {
        organization: true,
        role: { include: { rolePermissions: { include: { permission: true } } } }
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
      session: { id: session.id },
      permissions: membership.role.rolePermissions.map((rp) => rp.permission.key)
    };

    return true;
  }

  private getBearerToken(request: RequestWithContext) {
    const authorization = request.header('authorization');
    if (!authorization) return null;
    const [scheme, token] = authorization.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : null;
  }

  private resolveOrganizationId(request: RequestWithContext, tokenOrganizationId: string) {
    const headerValue = request.header('x-organization-id')?.trim();
    return headerValue && headerValue.length > 0 ? headerValue : tokenOrganizationId;
  }
}
