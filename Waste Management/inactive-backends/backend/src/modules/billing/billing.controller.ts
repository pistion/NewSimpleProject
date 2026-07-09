import { Body, Controller, Get, Headers, Post, Query, RawBodyRequest, Req, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequestWithContext } from '../../common/types/request-with-context';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { BillingService } from './billing.service';
import { PayPalService } from './paypal.service';

function actor(req: RequestWithContext) {
  return {
    userId:         req.auth!.user.id,
    organizationId: req.auth!.organization.id,
    userEmail:      req.auth!.user.email,
  };
}

@ApiTags('billing')
@Controller({ version: '1' })
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly paypalService: PayPalService,
  ) {}

  // ─── Summary ─────────────────────────────────────────────────────────────────

  @Get('billing/summary')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermissions('billing:read')
  @ApiOkResponse({ description: 'Returns the current billing summary for the organization.' })
  summary(@Req() req: RequestWithContext) {
    return this.billingService.getSummary(actor(req));
  }

  // ─── PayPal subscriptions ─────────────────────────────────────────────────────

  /**
   * Step 1 — create a PayPal subscription and return the approval URL.
   * Frontend redirects the user to PayPal; PayPal redirects back to
   * /billing?pp=success&plan=<planKey>&subscription_id=<id>
   */
  @Post('billing/paypal/checkout')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermissions('billing:manage')
  @ApiCreatedResponse({ description: 'Returns a PayPal approval URL for the selected plan.' })
  paypalCheckout(@Body() dto: CreateCheckoutDto, @Req() req: RequestWithContext) {
    return this.paypalService.createSubscription(dto.planKey, actor(req));
  }

  /**
   * Step 2 — called after PayPal redirects back with ?subscription_id=xxx.
   * Activates the subscription in the database.
   */
  @Post('billing/paypal/capture')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermissions('billing:manage')
  @ApiCreatedResponse({ description: 'Activates a PayPal subscription after user approval.' })
  paypalCapture(
    @Query('subscription_id') subscriptionId: string,
    @Query('plan')            planKey: string,
    @Req()                    req: RequestWithContext,
  ) {
    return this.paypalService.captureSubscription(subscriptionId, planKey, actor(req));
  }

  /**
   * PayPal webhook receiver — no auth guard; uses PayPal signature verification.
   * Register this URL in your PayPal developer dashboard:
   *   https://<your-backend>/api/v1/provider-webhooks/paypal
   */
  @Post('provider-webhooks/paypal')
  @ApiOkResponse({ description: 'Handles incoming PayPal webhook events.' })
  paypalWebhook(
    @Req()     req: RawBodyRequest<RequestWithContext>,
    @Headers() headers: Record<string, string>,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) return { received: false };
    return this.paypalService.handleWebhook(headers, rawBody);
  }
}
