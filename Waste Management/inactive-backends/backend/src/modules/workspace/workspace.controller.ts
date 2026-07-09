import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequestWithContext } from '../../common/types/request-with-context';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceService } from './workspace.service';

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  avatarUrl?: string;
}

@ApiTags('workspace')
@Controller({ path: 'workspace', version: '1' })
@UseGuards(JwtAuthGuard, RbacGuard)
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get()
  @RequirePermissions('organization:read')
  @ApiOkResponse({ description: 'Returns the current organization context.' })
  getWorkspace(@Req() request: RequestWithContext) {
    return {
      organization: request.auth?.organization,
      membership: request.auth?.membership,
      permissions: request.auth?.permissions
    };
  }

  @Get('me')
  @RequirePermissions('organization:read')
  @ApiOkResponse({ description: 'Returns the current authenticated user profile.' })
  getProfile(@Req() request: RequestWithContext) {
    return request.auth?.user;
  }

  @Patch('me')
  @RequirePermissions('organization:read')
  @ApiOkResponse({ description: "Updates the authenticated user's profile." })
  updateProfile(@Body() dto: UpdateProfileDto, @Req() request: RequestWithContext) {
    return this.workspaceService.updateProfile(request.auth!.user.id, {
      name: dto.name,
      avatarUrl: dto.avatarUrl,
    });
  }
}
