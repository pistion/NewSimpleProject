import { Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequestWithContext } from '../../common/types/request-with-context';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SslService } from './ssl.service';

@ApiTags('ssl')
@Controller({ version: '1' })
@UseGuards(JwtAuthGuard, RbacGuard)
export class SslController {
  constructor(private readonly sslService: SslService) {}

  @Get('ssl/certificates')
  @RequirePermissions('ssl:manage')
  @ApiOkResponse({ description: 'Lists all SSL certificates for the organization.' })
  listAll(@Req() request: RequestWithContext) {
    return this.sslService.listAll(this.ctx(request));
  }

  @Get('domains/:domainId/ssl')
  @RequirePermissions('ssl:manage')
  @ApiOkResponse({ description: 'Lists SSL certificates for a domain.' })
  listForDomain(@Param('domainId') domainId: string, @Req() request: RequestWithContext) {
    return this.sslService.listForDomain(domainId, this.ctx(request));
  }

  @Post('domains/:domainId/ssl/request')
  @RequirePermissions('ssl:manage')
  @ApiCreatedResponse({ description: 'Requests/renews an SSL certificate for the domain.' })
  request(@Param('domainId') domainId: string, @Req() request: RequestWithContext) {
    return this.sslService.requestCertificate(domainId, this.ctx(request));
  }

  @Get('ssl/certificates/:certId')
  @RequirePermissions('ssl:manage')
  @ApiOkResponse({ description: 'Returns an SSL certificate.' })
  get(@Param('certId') certId: string, @Req() request: RequestWithContext) {
    return this.sslService.get(certId, this.ctx(request));
  }

  @Delete('ssl/certificates/:certId')
  @RequirePermissions('ssl:manage')
  @ApiOkResponse({ description: 'Revokes an SSL certificate.' })
  revoke(@Param('certId') certId: string, @Req() request: RequestWithContext) {
    return this.sslService.revoke(certId, this.ctx(request));
  }

  private ctx(request: RequestWithContext) {
    return {
      userId: request.auth!.user.id,
      organizationId: request.auth!.organization.id
    };
  }
}
