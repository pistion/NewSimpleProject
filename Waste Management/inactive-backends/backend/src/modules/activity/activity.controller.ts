import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequestWithContext } from '../../common/types/request-with-context';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActivityService } from './activity.service';

@ApiTags('activity')
@Controller({ version: '1' })
@UseGuards(JwtAuthGuard, RbacGuard)
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get('activity')
  @RequirePermissions('activity:read')
  @ApiOkResponse({ description: 'Lists workspace activity events.' })
  listActivity(@Req() request: RequestWithContext, @Query('limit') limit?: string) {
    return this.activityService.listActivity(this.getActorContext(request), Number(limit));
  }

  @Get('audit')
  @RequirePermissions('audit:read')
  @ApiOkResponse({ description: 'Lists workspace audit events.' })
  listAudit(@Req() request: RequestWithContext, @Query('limit') limit?: string) {
    return this.activityService.listAudit(this.getActorContext(request), Number(limit));
  }

  private getActorContext(request: RequestWithContext) {
    return {
      organizationId: request.auth!.organization.id
    };
  }
}
