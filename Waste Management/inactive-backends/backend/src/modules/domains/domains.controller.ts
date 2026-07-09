import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequestWithContext } from '../../common/types/request-with-context';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BulkDeleteRecordsDto } from './dto/bulk-delete-records.dto';
import { CreateDnsRecordDto } from './dto/create-dns-record.dto';
import { CreateDomainDto } from './dto/create-domain.dto';
import { DnsRecordParamsDto } from './dto/dns-record-params.dto';
import { DomainParamsDto } from './dto/domain-params.dto';
import { ImportZoneFileDto } from './dto/import-zone-file.dto';
import { UpdateDnsRecordDto } from './dto/update-dns-record.dto';
import { UpdateDomainDto } from './dto/update-domain.dto';
import { DomainsService } from './domains.service';

@ApiTags('domains')
@Controller({ path: 'domains', version: '1' })
@UseGuards(JwtAuthGuard, RbacGuard)
export class DomainsController {
  constructor(private readonly domainsService: DomainsService) {}

  // ─── Domain CRUD ──────────────────────────────────────────────────────────────

  @Get()
  @RequirePermissions('domain:read')
  @ApiOkResponse({ description: 'Lists domains for the current organization.' })
  list(@Req() request: RequestWithContext) {
    return this.domainsService.list(this.getActorContext(request));
  }

  @Post()
  @RequirePermissions('domain:create')
  @ApiCreatedResponse({ description: 'Adds a managed domain.' })
  create(@Body() dto: CreateDomainDto, @Req() request: RequestWithContext) {
    return this.domainsService.create(dto, this.getActorContext(request));
  }

  @Get(':domainId')
  @RequirePermissions('domain:read')
  @ApiOkResponse({ description: 'Returns one managed domain.' })
  get(@Param() params: DomainParamsDto, @Req() request: RequestWithContext) {
    return this.domainsService.get(params.domainId, this.getActorContext(request));
  }

  @Patch(':domainId')
  @RequirePermissions('domain:update')
  @ApiOkResponse({ description: 'Updates a managed domain.' })
  update(
    @Param() params: DomainParamsDto,
    @Body() dto: UpdateDomainDto,
    @Req() request: RequestWithContext
  ) {
    return this.domainsService.update(params.domainId, dto, this.getActorContext(request));
  }

  @Post(':domainId/verify')
  @RequirePermissions('domain:update')
  @ApiOkResponse({ description: 'Verifies domain ownership by checking DNS TXT record.' })
  verify(@Param() params: DomainParamsDto, @Req() request: RequestWithContext) {
    return this.domainsService.verify(params.domainId, this.getActorContext(request));
  }

  @Delete(':domainId')
  @RequirePermissions('domain:delete')
  @ApiOkResponse({ description: 'Archives a managed domain.' })
  archive(@Param() params: DomainParamsDto, @Req() request: RequestWithContext) {
    return this.domainsService.archive(params.domainId, this.getActorContext(request));
  }

  // ─── DNS records — collection endpoints ───────────────────────────────────────
  // NOTE: Static-suffix routes (export, import) MUST be declared before
  //       parameterised routes (:recordId) so NestJS matches them first.

  @Get(':domainId/dns-records')
  @RequirePermissions('domain:read')
  @ApiOkResponse({ description: 'Lists all DNS records for a domain.' })
  listRecords(@Param() params: DomainParamsDto, @Req() request: RequestWithContext) {
    return this.domainsService.listRecords(params.domainId, this.getActorContext(request));
  }

  @Post(':domainId/dns-records')
  @RequirePermissions('dns:manage')
  @ApiCreatedResponse({ description: 'Creates a DNS record.' })
  createRecord(
    @Param() params: DomainParamsDto,
    @Body() dto: CreateDnsRecordDto,
    @Req() request: RequestWithContext
  ) {
    return this.domainsService.createRecord(params.domainId, dto, this.getActorContext(request));
  }

  @Delete(':domainId/dns-records')
  @RequirePermissions('dns:manage')
  @ApiOkResponse({ description: 'Deletes multiple DNS records in one request.' })
  bulkDeleteRecords(
    @Param() params: DomainParamsDto,
    @Body() dto: BulkDeleteRecordsDto,
    @Req() request: RequestWithContext
  ) {
    return this.domainsService.bulkDelete(params.domainId, dto.recordIds, this.getActorContext(request));
  }

  // ─── DNS records — static sub-paths (before :recordId) ───────────────────────

  @Get(':domainId/dns-records/export')
  @RequirePermissions('domain:read')
  @ApiOkResponse({ description: 'Exports all DNS records as a BIND zone file string.' })
  exportZoneFile(@Param() params: DomainParamsDto, @Req() request: RequestWithContext) {
    return this.domainsService.exportZoneFile(params.domainId, this.getActorContext(request));
  }

  @Post(':domainId/dns-records/import')
  @RequirePermissions('dns:manage')
  @ApiCreatedResponse({ description: 'Imports DNS records from a BIND-format zone file.' })
  importZoneFile(
    @Param() params: DomainParamsDto,
    @Body() dto: ImportZoneFileDto,
    @Req() request: RequestWithContext
  ) {
    return this.domainsService.importZoneFile(
      params.domainId,
      dto.content,
      dto.overwrite ?? false,
      this.getActorContext(request)
    );
  }

  // ─── DNS records — single record ──────────────────────────────────────────────

  @Get(':domainId/dns-records/:recordId')
  @RequirePermissions('domain:read')
  @ApiOkResponse({ description: 'Returns a single DNS record.' })
  getRecord(@Param() params: DnsRecordParamsDto, @Req() request: RequestWithContext) {
    return this.domainsService.getRecord(params.domainId, params.recordId, this.getActorContext(request));
  }

  @Patch(':domainId/dns-records/:recordId')
  @RequirePermissions('dns:manage')
  @ApiOkResponse({ description: 'Updates a DNS record.' })
  updateRecord(
    @Param() params: DnsRecordParamsDto,
    @Body() dto: UpdateDnsRecordDto,
    @Req() request: RequestWithContext
  ) {
    return this.domainsService.updateRecord(
      params.domainId,
      params.recordId,
      dto,
      this.getActorContext(request)
    );
  }

  @Delete(':domainId/dns-records/:recordId')
  @RequirePermissions('dns:manage')
  @ApiOkResponse({ description: 'Deletes a single DNS record.' })
  deleteRecord(@Param() params: DnsRecordParamsDto, @Req() request: RequestWithContext) {
    return this.domainsService.deleteRecord(
      params.domainId,
      params.recordId,
      this.getActorContext(request)
    );
  }

  private getActorContext(request: RequestWithContext) {
    return {
      userId: request.auth!.user.id,
      organizationId: request.auth!.organization.id,
    };
  }
}
