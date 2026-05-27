import { randomUUID } from 'crypto';
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { jsonToDb } from '../../common/json-field';
import { UserStatus } from '../../common/prisma-enums';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';

interface ClientContext {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  private readonly passwordHashRounds = 12;
  private readonly refreshTokenHashRounds = 12;

  constructor(
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {}

  async register(dto: RegisterDto, context: ClientContext = {}) {
    const email = this.normalizeEmail(dto.email);
    const existingUser = await this.prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      throw new ConflictException('Email is already registered.');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.passwordHashRounds);
    const organizationName = dto.organizationName?.trim() || `${dto.name.trim()}'s Workspace`;
    const organizationSlug = await this.createUniqueOrganizationSlug(organizationName);
    const refreshToken = this.createOpaqueToken();
    const refreshTokenHash = await bcrypt.hash(refreshToken, this.refreshTokenHashRounds);
    const expiresAt = this.getRefreshTokenExpiry();

    const result = await this.prisma.$transaction(async (tx) => {
      const ownerRole = await this.findOrCreateOwnerRole(tx);
      const user = await tx.user.create({
        data: {
          email,
          name: dto.name.trim(),
          passwordHash,
          status: UserStatus.active
        }
      });
      const organization = await tx.organization.create({
        data: {
          name: organizationName,
          slug: organizationSlug,
          billingEmail: email,
          createdByUserId: user.id
        }
      });
      const membership = await tx.organizationMember.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          roleId: ownerRole.id,
          status: 'active',
          joinedAt: new Date()
        }
      });
      const session = await tx.session.create({
        data: {
          userId: user.id,
          refreshTokenHash,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          expiresAt
        }
      });

      await tx.auditLog.create({
        data: {
          organizationId: organization.id,
          actorUserId: user.id,
          action: 'auth.register',
          resourceType: 'user',
          resourceId: user.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadata: jsonToDb({ sessionId: session.id })
        }
      });

      return { user, organization, membership, session };
    });

    return this.toAuthResponse(result, refreshToken);
  }

  async login(dto: LoginDto, context: ClientContext = {}) {
    const email = this.normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          where: { status: 'active' },
          include: { organization: true, role: true },
          orderBy: { createdAt: 'asc' },
          take: 1
        }
      }
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches || user.status !== UserStatus.active) {
      await this.recordLoginFailure(user.id, context);
      throw new UnauthorizedException('Invalid email or password.');
    }

    const membership = user.memberships[0];
    if (!membership) {
      throw new UnauthorizedException('No active organization membership found.');
    }

    const refreshToken = this.createOpaqueToken();
    const refreshTokenHash = await bcrypt.hash(refreshToken, this.refreshTokenHashRounds);
    const expiresAt = this.getRefreshTokenExpiry();

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        expiresAt
      }
    });

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      }),
      this.prisma.auditLog.create({
        data: {
          organizationId: membership.organization.id,
          actorUserId: user.id,
          action: 'auth.login_success',
          resourceType: 'session',
          resourceId: session.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadata: jsonToDb({})
        }
      })
    ]);

    return this.toAuthResponse({
      user,
      organization: membership.organization,
      membership,
      session
    }, refreshToken);
  }

  async refresh(dto: RefreshTokenDto, context: ClientContext = {}) {
    const session = await this.prisma.session.findUnique({
      where: { id: dto.sessionId },
      include: {
        user: {
          include: {
            memberships: {
              where: { status: 'active' },
              include: { organization: true, role: true },
              orderBy: { createdAt: 'asc' },
              take: 1
            }
          }
        }
      }
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Invalid refresh session.');
    }

    const tokenMatches = await bcrypt.compare(dto.refreshToken, session.refreshTokenHash);
    if (!tokenMatches || session.user.status !== UserStatus.active) {
      throw new UnauthorizedException('Invalid refresh session.');
    }

    const membership = session.user.memberships[0];
    if (!membership) {
      throw new UnauthorizedException('No active organization membership found.');
    }

    const refreshToken = this.createOpaqueToken();
    const refreshTokenHash = await bcrypt.hash(refreshToken, this.refreshTokenHashRounds);
    const expiresAt = this.getRefreshTokenExpiry();

    const updatedSession = await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash,
        expiresAt,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      }
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: membership.organization.id,
        actorUserId: session.user.id,
        action: 'auth.refresh',
        resourceType: 'session',
        resourceId: session.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: jsonToDb({})
      }
    });

    return this.toAuthResponse({
      user: session.user,
      organization: membership.organization,
      membership,
      session: updatedSession
    }, refreshToken);
  }

  async logout(dto: LogoutDto, context: ClientContext = {}) {
    const session = await this.prisma.session.findUnique({
      where: { id: dto.sessionId },
      include: { user: true }
    });

    if (!session || session.revokedAt) {
      return { revoked: true };
    }

    const tokenMatches = await bcrypt.compare(dto.refreshToken, session.refreshTokenHash);
    if (!tokenMatches) {
      throw new UnauthorizedException('Invalid refresh session.');
    }

    await this.prisma.$transaction([
      this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() }
      }),
      this.prisma.auditLog.create({
        data: {
          actorUserId: session.userId,
          action: 'auth.logout',
          resourceType: 'session',
          resourceId: session.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadata: jsonToDb({})
        }
      })
    ]);

    // Blacklist the session in Redis for the access token TTL so in-flight tokens
    // are immediately rejected without waiting for the DB revokedAt propagation.
    const ttlSeconds = this.config.get<number>('ACCESS_TOKEN_TTL_MINUTES', 15) * 60;
    await this.redis.blacklistSession(session.id, ttlSeconds);

    return { revoked: true };
  }

  /** Called from POST /auth/invites/:token/accept — the user is already authenticated. */
  async acceptInvite(token: string, userId: string) {
    const invite = await this.prisma.organizationInvite.findUnique({ where: { token } });

    if (!invite) {
      throw new UnauthorizedException('Invite not found or already used.');
    }
    if (invite.revokedAt || invite.acceptedAt) {
      throw new UnauthorizedException('This invite has already been used or revoked.');
    }
    if (invite.expiresAt < new Date()) {
      throw new UnauthorizedException('This invite has expired.');
    }

    const role = await this.prisma.role.findFirst({
      where: { key: invite.roleKey, isSystem: true, organizationId: null }
    });
    if (!role) {
      throw new UnauthorizedException('Invite role no longer exists.');
    }

    const existing = await this.prisma.organizationMember.findFirst({
      where: { userId, organizationId: invite.organizationId, status: 'active' }
    });
    if (existing) {
      throw new UnauthorizedException('You are already a member of this organization.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedInvite = await tx.organizationInvite.update({
        where: { token },
        data: { acceptedAt: new Date(), acceptedByUserId: userId }
      });
      const member = await tx.organizationMember.create({
        data: {
          organizationId: invite.organizationId,
          userId,
          roleId: role.id,
          status: 'active',
          joinedAt: new Date()
        }
      });
      return { invite: updatedInvite, member };
    });

    return result;
  }

  private async recordLoginFailure(userId: string, context: ClientContext) {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: userId,
        action: 'auth.login_failed',
        resourceType: 'user',
        resourceId: userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: jsonToDb({})
      }
    });
  }

  private async findOrCreateOwnerRole(tx: Prisma.TransactionClient) {
    const existing = await tx.role.findFirst({
      where: {
        organizationId: null,
        key: 'owner',
        isSystem: true
      }
    });

    if (existing) {
      return existing;
    }

    return tx.role.create({
      data: {
        key: 'owner',
        name: 'Owner',
        isSystem: true
      }
    });
  }

  private async createUniqueOrganizationSlug(name: string) {
    const baseSlug = this.slugify(name) || 'workspace';
    let slug = baseSlug;
    let suffix = 1;

    while (await this.prisma.organization.findUnique({ where: { slug } })) {
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }

    return slug;
  }

  private toAuthResponse(data: {
    user: { id: string; email: string; name: string | null; avatarUrl?: string | null };
    organization: { id: string; name: string; slug: string };
    membership: { id: string; roleId: string };
    session: { id: string; expiresAt: Date };
  }, refreshToken: string) {
    const accessToken = this.jwtService.sign({
      sub: data.user.id,
      organizationId: data.organization.id,
      membershipId: data.membership.id,
      sessionId: data.session.id,
      jti: randomUUID()
    }, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: `${this.config.getOrThrow<number>('ACCESS_TOKEN_TTL_MINUTES')}m`
    });

    return {
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        avatarUrl: data.user.avatarUrl ?? null
      },
      organization: data.organization,
      membership: {
        id: data.membership.id,
        roleId: data.membership.roleId
      },
      session: {
        id: data.session.id,
        expiresAt: data.session.expiresAt
      },
      tokens: {
        accessToken,
        refreshToken,
        tokenType: 'Bearer'
      }
    };
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private slugify(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
  }

  private createOpaqueToken() {
    return randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
  }

  private getRefreshTokenExpiry() {
    const ttlDays = this.config.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + ttlDays);
    return expiresAt;
  }
}
