import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequestWithContext } from '../../common/types/request-with-context';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CheckAvailabilityDto } from './dto/check-availability.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { RegisterDomainDto } from './dto/register-domain.dto';
import { RenewDomainDto } from './dto/renew-domain.dto';
import { SetAutoRenewDto } from './dto/set-auto-renew.dto';
import { UpdateNameserversDto } from './dto/update-nameservers.dto';
import { RegistrarService } from './registrar.service';

@ApiTags('registrar')
@Controller({ path: 'registrar', version: '1' })
@UseGuards(JwtAuthGuard, RbacGuard)
export class RegistrarController {
  constructor(private readonly registrar: RegistrarService) {}

  private ctx(req: RequestWithContext) {
    return {
      userId: req.auth!.user.id,
      organizationId: req.auth!.organization.id,
    };
  }

  // ─── Contacts ─────────────────────────────────────────────────────────────

  @Post('contacts')
  @RequirePermissions('domain:create')
  @ApiCreatedResponse({ description: 'Creates a registrant contact in Spaceship.' })
  createContact(@Body() dto: CreateContactDto) {
    return this.registrar.createContact(dto);
  }

  @Get('contacts')
  @RequirePermissions('domain:read')
  @ApiOkResponse({ description: 'Lists registrant contacts from Spaceship.' })
  listContacts(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.registrar.listContacts(
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 100,
    );
  }

  // ─── Availability ─────────────────────────────────────────────────────────

  @Post('available')
  @RequirePermissions('domain:read')
  @ApiOkResponse({ description: 'Check domain availability via Spaceship.' })
  checkAvailability(@Body() dto: CheckAvailabilityDto) {
    return this.registrar.checkAvailability(dto);
  }

  // ─── Registration & renewal ───────────────────────────────────────────────

  @Post('domains')
  @RequirePermissions('domain:create')
  @ApiCreatedResponse({ description: 'Registers a domain via Spaceship. Returns async operation.' })
  registerDomain(@Body() dto: RegisterDomainDto, @Req() req: RequestWithContext) {
    return this.registrar.registerDomain(dto, this.ctx(req));
  }

  @Post('domains/:name/renew')
  @RequirePermissions('domain:update')
  @ApiCreatedResponse({ description: 'Renews a domain via Spaceship. Returns async operation.' })
  renewDomain(@Param('name') name: string, @Body() dto: RenewDomainDto, @Req() req: RequestWithContext) {
    dto.name = name;
    return this.registrar.renewDomain(dto, this.ctx(req));
  }

  // ─── Registrar domain list / detail ──────────────────────────────────────

  @Get('domains')
  @RequirePermissions('domain:read')
  @ApiOkResponse({ description: 'Lists all domains registered via Spaceship.' })
  listDomains(
    @Query('skip') skip?: string,
    @Query('take') take?: string
  ) {
    return this.registrar.listRegistrarDomains(
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 100
    );
  }

  @Get('domains/:name')
  @RequirePermissions('domain:read')
  @ApiOkResponse({ description: 'Gets a single domain from Spaceship.' })
  getDomain(@Param('name') name: string) {
    return this.registrar.getRegistrarDomain(name);
  }

  // ─── Nameserver management ────────────────────────────────────────────────

  @Put('domains/:name/nameservers')
  @RequirePermissions('domain:update')
  @ApiOkResponse({ description: 'Updates nameservers for a domain via Spaceship.' })
  updateNameservers(
    @Param('name') name: string,
    @Body() dto: UpdateNameserversDto,
    @Req() req: RequestWithContext
  ) {
    return this.registrar.updateNameservers(name, dto, this.ctx(req));
  }

  // ─── Auto-renew ───────────────────────────────────────────────────────────

  @Put('domains/:name/autorenew')
  @RequirePermissions('domain:update')
  @ApiOkResponse({ description: 'Sets auto-renew for a domain via Spaceship.' })
  setAutoRenew(
    @Param('name') name: string,
    @Body() dto: SetAutoRenewDto,
    @Req() req: RequestWithContext
  ) {
    return this.registrar.setAutoRenew(name, dto.autoRenew, this.ctx(req));
  }

  // ─── DNS sync ────────────────────────────────────────────────────────────

  /**
   * Push DNS records from local DB → Spaceship (domain identified by its Glondia UUID).
   */
  @Post('domains/:domainId/dns/push')
  @RequirePermissions('domain:update')
  @ApiOkResponse({ description: 'Pushes local DNS records to Spaceship.' })
  pushDns(@Param('domainId') domainId: string, @Req() req: RequestWithContext) {
    return this.registrar.syncDnsToSpaceship(domainId, this.ctx(req));
  }

  /**
   * Pull DNS records from Spaceship → local DB (overwrites existing).
   */
  @Post('domains/:domainId/dns/pull')
  @RequirePermissions('domain:update')
  @ApiOkResponse({ description: 'Pulls DNS records from Spaceship into local DB.' })
  pullDns(@Param('domainId') domainId: string, @Req() req: RequestWithContext) {
    return this.registrar.pullDnsFromSpaceship(domainId, this.ctx(req));
  }

  // ─── Async operations ─────────────────────────────────────────────────────

  @Get('operations/:operationId')
  @RequirePermissions('domain:read')
  @ApiOkResponse({ description: 'Gets the status of an async Spaceship operation.' })
  getOperation(@Param('operationId') operationId: string) {
    return this.registrar.getOperation(operationId);
  }
}
