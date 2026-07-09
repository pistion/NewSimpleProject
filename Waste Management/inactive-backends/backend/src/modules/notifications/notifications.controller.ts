import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequestWithContext } from '../../common/types/request-with-context';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpsertPreferenceDto } from './dto/upsert-preference.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@Controller({ path: 'notifications', version: '1' })
@UseGuards(JwtAuthGuard, RbacGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @RequirePermissions('organization:read')
  @ApiOkResponse({ description: 'Lists notifications for the current user.' })
  list(@Req() request: RequestWithContext) {
    return this.notificationsService.list(this.ctx(request));
  }

  @Patch(':notificationId/read')
  @RequirePermissions('organization:read')
  @ApiOkResponse({ description: 'Marks a notification as read.' })
  markRead(@Param('notificationId') notificationId: string, @Req() request: RequestWithContext) {
    return this.notificationsService.markRead(notificationId, this.ctx(request));
  }

  @Post('read-all')
  @RequirePermissions('organization:read')
  @ApiOkResponse({ description: 'Marks all notifications as read.' })
  markAllRead(@Req() request: RequestWithContext) {
    return this.notificationsService.markAllRead(this.ctx(request));
  }

  @Get('preferences')
  @RequirePermissions('organization:read')
  @ApiOkResponse({ description: 'Returns notification preferences for the current user.' })
  getPreferences(@Req() request: RequestWithContext) {
    return this.notificationsService.getPreferences(this.ctx(request));
  }

  @Post('preferences')
  @RequirePermissions('organization:read')
  @ApiOkResponse({ description: 'Creates or updates a notification preference.' })
  upsertPreference(@Body() dto: UpsertPreferenceDto, @Req() request: RequestWithContext) {
    return this.notificationsService.upsertPreference(dto, this.ctx(request));
  }

  private ctx(request: RequestWithContext) {
    return {
      userId: request.auth!.user.id,
      organizationId: request.auth!.organization.id
    };
  }
}
