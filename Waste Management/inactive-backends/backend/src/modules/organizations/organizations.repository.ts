import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class OrganizationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOrganizationById(id: string) {
    return this.prisma.organization.findUnique({ where: { id } });
  }

  listMembers(organizationId: string) {
    return this.prisma.organizationMember.findMany({
      where: { organizationId, status: 'active' },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true, createdAt: true } },
        role: { select: { id: true, key: true, name: true } }
      },
      orderBy: { createdAt: 'asc' }
    });
  }

  findMemberById(memberId: string, organizationId: string) {
    return this.prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId },
      include: { user: true, role: true }
    });
  }

  findMemberByUserId(userId: string, organizationId: string) {
    return this.prisma.organizationMember.findFirst({
      where: { userId, organizationId }
    });
  }

  findRoleByKey(key: string) {
    return this.prisma.role.findFirst({
      where: { key, isSystem: true, organizationId: null }
    });
  }

  updateMemberRole(memberId: string, roleId: string) {
    return this.prisma.organizationMember.update({
      where: { id: memberId },
      data: { roleId }
    });
  }

  removeMember(memberId: string) {
    return this.prisma.organizationMember.update({
      where: { id: memberId },
      data: { status: 'removed', removedAt: new Date() }
    });
  }

  listInvites(organizationId: string) {
    return this.prisma.organizationInvite.findMany({
      where: { organizationId, acceptedAt: null, revokedAt: null },
      orderBy: { createdAt: 'desc' }
    });
  }

  findInviteByToken(token: string) {
    return this.prisma.organizationInvite.findUnique({ where: { token } });
  }

  findInviteById(id: string) {
    return this.prisma.organizationInvite.findUnique({ where: { id } });
  }

  findActiveInviteByEmail(email: string, organizationId: string) {
    return this.prisma.organizationInvite.findFirst({
      where: { email, organizationId, acceptedAt: null, revokedAt: null }
    });
  }

  createInvite(data: {
    organizationId: string;
    invitedByUserId: string;
    email: string;
    roleKey: string;
    token: string;
    expiresAt: Date;
  }) {
    return this.prisma.organizationInvite.create({ data });
  }

  revokeInvite(id: string) {
    return this.prisma.organizationInvite.update({
      where: { id },
      data: { revokedAt: new Date() }
    });
  }

  findUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true }
    });
  }

  acceptInvite(token: string, userId: string, roleId: string, organizationId: string) {
    return this.prisma.$transaction(async (tx) => {
      const invite = await tx.organizationInvite.update({
        where: { token },
        data: { acceptedAt: new Date(), acceptedByUserId: userId }
      });
      const member = await tx.organizationMember.create({
        data: {
          organizationId,
          userId,
          roleId,
          status: 'active',
          joinedAt: new Date()
        }
      });
      return { invite, member };
    });
  }
}
