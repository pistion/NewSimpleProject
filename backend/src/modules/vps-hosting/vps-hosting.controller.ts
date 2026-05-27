import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { RequestWithContext } from '../../common/types/request-with-context';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CaptureVpsPayPalDto } from './dto/capture-paypal.dto';
import { CreateVpsDto } from './dto/create-vps.dto';
import { VpsQuoteDto } from './dto/vps-quote.dto';
import { VpsHostingService } from './vps-hosting.service';

function actor(req: RequestWithContext): { userId: string; organizationId: string } {
  return {
    userId:         req.auth!.user.id,
    organizationId: req.auth!.organization.id,
  };
}

@ApiTags('vps-hosting')
@Controller({ path: 'vps-hosting', version: '1' })
@UseGuards(JwtAuthGuard)
export class VpsHostingController {
  constructor(private readonly vpsHosting: VpsHostingService) {}

  @Public()
  @Get('settings')
  @ApiOkResponse({ description: 'Returns Vultr and PayPal configuration status.' })
  getSettings() {
    return this.vpsHosting.getSettings();
  }

  @Public()
  @Get('regions')
  @ApiOkResponse({ description: 'Lists Vultr regions.' })
  listRegions() {
    return this.vpsHosting.listRegions();
  }

  @Public()
  @Get('plans')
  @ApiOkResponse({ description: 'Lists Vultr plans.' })
  listPlans(@Query('type') type?: string) {
    return this.vpsHosting.listPlans(type);
  }

  @Public()
  @Get('os')
  @ApiOkResponse({ description: 'Lists Vultr operating systems.' })
  listOs() {
    return this.vpsHosting.listOs();
  }

  @Public()
  @Post('quote')
  @ApiOkResponse({ description: 'Returns pricing quote with markup for a VPS configuration.' })
  getQuote(@Body() dto: VpsQuoteDto) {
    return this.vpsHosting.getQuote(dto);
  }

  @Post('paypal/create-order')
  @ApiCreatedResponse({ description: 'Creates a PayPal order for the VPS. Customer must approve via approvalUrl.' })
  createPayPalOrder(@Body() dto: CreateVpsDto, @Req() req: RequestWithContext) {
    return this.vpsHosting.createPayPalOrder(dto, actor(req));
  }

  @Post('paypal/capture')
  @ApiCreatedResponse({ description: 'Captures the PayPal order and provisions the Vultr VPS. Idempotent.' })
  capturePayPalOrder(
    @Body() body: { orderId: string; provisionDetails: CreateVpsDto },
    @Req() req: RequestWithContext,
  ) {
    return this.vpsHosting.capturePayPalOrder(
      { orderId: body.orderId },
      body.provisionDetails,
      actor(req),
    );
  }

  @Get('services')
  @ApiOkResponse({ description: 'Lists all VPS services for the authenticated organization.' })
  listServices(@Req() req: RequestWithContext) {
    return this.vpsHosting.listServices(actor(req));
  }

  @Get('services/:id')
  @ApiOkResponse({ description: 'Returns a single VPS service, refreshing status from Vultr.' })
  getService(@Param('id') id: string, @Req() req: RequestWithContext) {
    return this.vpsHosting.getService(id, actor(req));
  }

  @Post('services/:id/start')
  @ApiOkResponse({ description: 'Starts (powers on) the VPS.' })
  startService(@Param('id') id: string, @Req() req: RequestWithContext) {
    return this.vpsHosting.startService(id, actor(req));
  }

  @Post('services/:id/halt')
  @ApiOkResponse({ description: 'Halts (powers off) the VPS.' })
  haltService(@Param('id') id: string, @Req() req: RequestWithContext) {
    return this.vpsHosting.haltService(id, actor(req));
  }

  @Post('services/:id/reboot')
  @ApiOkResponse({ description: 'Reboots the VPS.' })
  rebootService(@Param('id') id: string, @Req() req: RequestWithContext) {
    return this.vpsHosting.rebootService(id, actor(req));
  }

  @Delete('services/:id')
  @ApiOkResponse({ description: 'Destroys (permanently deletes) the VPS.' })
  destroyService(@Param('id') id: string, @Req() req: RequestWithContext) {
    return this.vpsHosting.destroyService(id, actor(req));
  }
}
