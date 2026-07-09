import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequestWithContext } from '../../common/types/request-with-context';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InviteMemberDto } from './dto/invite-member.dto';
import { MemberParamsDto } from './dto/member-params.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@Controller({ path: 'organizations', version: '1' })
@UseGuards(JwtAuthGuard, RbacGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  // ─── Members ─────────────────────────────────────────────────────────────────

  @Get('members')
  @RequirePermissions('organization:read')
  @ApiOkResponse({ description: 'Lists active members of the organization.' })
  listMembers(@Req() request: RequestWithContext) {
    return this.organizationsService.listMembers(this.ctx(request));
  }

  @Patch('members/:memberId')
  @RequirePermissions('team:update_role')
  @ApiOkResponse({ description: "Updates a member's role." })
  updateMember(
    @Param() params: MemberParamsDto,
    @Body() dto: UpdateMemberDto,
    @Req() request: RequestWithContext
  ) {
    return this.organizationsService.updateMember(params.memberId, dto, this.ctx(request));
  }

  @Delete('members/:memberId')
  @RequirePermissions('team:remove')
  @ApiOkResponse({ description: 'Removes a member from the organization.' })
  removeMember(@Param() params: MemberParamsDto, @Req() request: RequestWithContext) {
    return this.organizationsService.removeMember(params.memberId, this.ctx(request));
  }

  // ─── Invites ─────────────────────────────────────────────────────────────────

  @Get('invites')
  @RequirePermissions('team:invite')
  @ApiOkResponse({ description: 'Lists pending invites for the organization.' })
  listInvites(@Req() request: RequestWithContext) {
    return this.organizationsService.listInvites(this.ctx(request));
  }

  @Post('invites')
  @RequirePermissions('team:invite')
  @ApiCreatedResponse({ description: 'Sends a member invite email.' })
  invite(@Body() dto: InviteMemberDto, @Req() request: RequestWithContext) {
    return this.organizationsService.invite(dto, this.ctx(request));
  }

  @Delete('invites/:inviteId')
  @RequirePermissions('team:invite')
  @ApiOkResponse({ description: 'Revokes a pending invite.' })
  revokeInvite(@Param('inviteId') inviteId: string, @Req() request: RequestWithContext) {
    return this.organizationsService.revokeInvite(inviteId, this.ctx(request));
  }

  // ─── Accept (called by the invited user — public route via separate controller) ─

  private ctx(request: RequestWithContext) {
    return {
      userId: request.auth!.user.id,
      organizationId: request.auth!.organization.id
    };
  }
}
