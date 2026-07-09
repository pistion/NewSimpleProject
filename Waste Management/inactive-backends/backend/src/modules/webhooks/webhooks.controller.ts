import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequestWithContext } from '../../common/types/request-with-context';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@Controller({ path: 'webhooks', version: '1' })
@UseGuards(JwtAuthGuard, RbacGuard)
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Get()
  @RequirePermissions('webhook:manage')
  @ApiOkResponse({ description: 'Lists webhook endpoints for the organization.' })
  list(@Req() request: RequestWithContext) {
    return this.webhooksService.listEndpoints(this.ctx(request));
  }

  @Post()
  @RequirePermissions('webhook:manage')
  @ApiCreatedResponse({ description: 'Creates a webhook endpoint.' })
  create(@Body() dto: CreateWebhookDto, @Req() request: RequestWithContext) {
    return this.webhooksService.createEndpoint(dto, this.ctx(request));
  }

  @Get(':endpointId')
  @RequirePermissions('webhook:manage')
  @ApiOkResponse({ description: 'Returns a webhook endpoint.' })
  get(@Param('endpointId') endpointId: string, @Req() request: RequestWithContext) {
    return this.webhooksService.getEndpoint(endpointId, this.ctx(request));
  }

  @Patch(':endpointId')
  @RequirePermissions('webhook:manage')
  @ApiOkResponse({ description: 'Updates a webhook endpoint.' })
  update(
    @Param('endpointId') endpointId: string,
    @Body() dto: UpdateWebhookDto,
    @Req() request: RequestWithContext
  ) {
    return this.webhooksService.updateEndpoint(endpointId, dto, this.ctx(request));
  }

  @Delete(':endpointId')
  @RequirePermissions('webhook:manage')
  @ApiOkResponse({ description: 'Deletes a webhook endpoint.' })
  delete(@Param('endpointId') endpointId: string, @Req() request: RequestWithContext) {
    return this.webhooksService.deleteEndpoint(endpointId, this.ctx(request));
  }

  @Get(':endpointId/deliveries')
  @RequirePermissions('webhook:manage')
  @ApiOkResponse({ description: 'Lists recent deliveries for a webhook endpoint.' })
  listDeliveries(@Param('endpointId') endpointId: string, @Req() request: RequestWithContext) {
    return this.webhooksService.listDeliveries(endpointId, this.ctx(request));
  }

  @Post('deliveries/:deliveryId/retry')
  @RequirePermissions('webhook:manage')
  @ApiCreatedResponse({ description: 'Retries a failed webhook delivery.' })
  retry(@Param('deliveryId') deliveryId: string, @Req() request: RequestWithContext) {
    return this.webhooksService.retryDelivery(deliveryId, this.ctx(request));
  }

  private ctx(request: RequestWithContext) {
    return {
      userId: request.auth!.user.id,
      organizationId: request.auth!.organization.id
    };
  }
}
