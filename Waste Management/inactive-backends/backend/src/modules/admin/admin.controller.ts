import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequestWithContext } from '../../common/types/request-with-context';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminService } from './admin.service';

@ApiTags('admin')
@Controller({ path: 'admin', version: '1' })
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermissions('admin:access')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  @ApiOkResponse({ description: 'Returns platform-wide totals.' })
  getOverview(@Req() _request: RequestWithContext) {
    return this.adminService.getOverview();
  }

  @Get('users')
  @ApiOkResponse({ description: 'Searches users by email or name.' })
  searchUsers(@Query('q') query: string = '') {
    return this.adminService.searchUsers(query);
  }

  @Get('organizations')
  @ApiOkResponse({ description: 'Lists all organizations.' })
  listOrganizations(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50'
  ) {
    return this.adminService.listOrganizations(parseInt(page, 10), parseInt(limit, 10));
  }

  @Get('organizations/:orgId')
  @ApiOkResponse({ description: 'Returns an organization with members and counts.' })
  getOrganization(@Param('orgId') orgId: string) {
    return this.adminService.getOrganization(orgId);
  }
}
