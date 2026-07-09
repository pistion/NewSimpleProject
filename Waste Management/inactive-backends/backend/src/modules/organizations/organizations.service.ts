import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { EmailService } from '../../common/email/email.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { OrganizationsRepository } from './organizations.repository';

interface ActorContext {
  userId: string;
  organizationId: string;
}

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private readonly repo: OrganizationsRepository,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  // ─── Members ─────────────────────────────────────────────────────────────────

  listMembers(context: ActorContext) {
    return this.repo.listMembers(context.organizationId);
  }

  async updateMember(memberId: string, dto: UpdateMemberDto, context: ActorContext) {
    const member = await this.getMemberOrThrow(memberId, context);

    if (member.userId === context.userId) {
      throw new ForbiddenException('You cannot change your own role.');
    }

    const role = await this.repo.findRoleByKey(dto.roleKey);
    if (!role) {
      throw new NotFoundException(`Role "${dto.roleKey}" not found.`);
    }
    if (role.key === 'owner') {
      throw new ForbiddenException('Use the transfer ownership endpoint to assign the owner role.');
    }

    return this.repo.updateMemberRole(memberId, role.id);
  }

  async removeMember(memberId: string, context: ActorContext) {
    const member = await this.getMemberOrThrow(memberId, context);

    if (member.userId === context.userId) {
      throw new ForbiddenException('You cannot remove yourself from the organization.');
    }
    if (member.role?.key === 'owner') {
      throw new ForbiddenException('Cannot remove the organization owner.');
    }

    return this.repo.removeMember(memberId);
  }

  // ─── Invites ─────────────────────────────────────────────────────────────────

  listInvites(context: ActorContext) {
    return this.repo.listInvites(context.organizationId);
  }

  async invite(dto: InviteMemberDto, context: ActorContext) {
    const roleKey = dto.roleKey ?? 'developer';

    const role = await this.repo.findRoleByKey(roleKey);
    if (!role) {
      throw new NotFoundException(`Role "${roleKey}" not found.`);
    }
    if (role.key === 'owner') {
      throw new ForbiddenException('Cannot invite someone directly as owner.');
    }

    const existing = await this.repo.findActiveInviteByEmail(dto.email, context.organizationId);
    if (existing) {
      throw new ConflictException('An active invite for this email already exists.');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invite = await this.repo.createInvite({
      organizationId: context.organizationId,
      invitedByUserId: context.userId,
      email: dto.email,
      roleKey,
      token,
      expiresAt
    });

    // Send invite email — fire-and-forget; failure must not block the response.
    const [inviter, org] = await Promise.all([
      this.repo.findUserById(context.userId),
      this.repo.findOrganizationById(context.organizationId),
    ]);

    this.email
      .sendInvite({
        to: dto.email,
        inviterName: inviter?.name ?? null,
        organizationName: org?.name ?? 'your organization',
        token,
      })
      .catch((err) => this.logger.error(`Failed to send invite email: ${(err as Error).message}`));

    return invite;
  }

  async revokeInvite(inviteId: string, context: ActorContext) {
    const invite = await this.repo.findInviteById(inviteId);
    if (!invite || invite.organizationId !== context.organizationId) {
      throw new NotFoundException('Invite not found.');
    }

    return this.repo.revokeInvite(inviteId);
  }

  async acceptInvite(token: string, userId: string) {
    const invite = await this.repo.findInviteByToken(token);
    if (!invite) {
      throw new NotFoundException('Invite not found or already used.');
    }
    if (invite.revokedAt || invite.acceptedAt) {
      throw new BadRequestException('This invite has already been used or revoked.');
    }
    if (invite.expiresAt < new Date()) {
      throw new BadRequestException('This invite has expired.');
    }

    const role = await this.repo.findRoleByKey(invite.roleKey);
    if (!role) {
      throw new NotFoundException('Role no longer exists.');
    }

    const existingMember = await this.repo.findMemberByUserId(userId, invite.organizationId);
    if (existingMember && existingMember.status === 'active') {
      throw new ConflictException('You are already a member of this organization.');
    }

    return this.repo.acceptInvite(token, userId, role.id, invite.organizationId);
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private async getMemberOrThrow(memberId: string, context: ActorContext) {
    const member = await this.repo.findMemberById(memberId, context.organizationId);
    if (!member) {
      throw new NotFoundException('Member not found.');
    }
    return member;
  }
}
