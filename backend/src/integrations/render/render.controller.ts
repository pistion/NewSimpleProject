import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { RenderService } from './render.service';

@ApiTags('render')
@Controller({ path: 'render', version: '1' })
@UseGuards(JwtAuthGuard, RbacGuard)
export class RenderController {
  constructor(private readonly renderService: RenderService) {}

  @Get('settings')
  @RequirePermissions('project:read')
  @ApiOkResponse({ description: 'Returns Render provider configuration status.' })
  settings() {
    return {
      provider: 'render',
      configured: this.renderService.isConfigured(),
      required: this.renderService.isConfigured() ? [] : ['RENDER_API_KEY', 'RENDER_OWNER_ID']
    };
  }

  @Get('services')
  @RequirePermissions('project:read')
  @ApiOkResponse({ description: 'Lists all Render services available to this account.' })
  async listServices() {
    if (!this.renderService.isConfigured()) {
      return [];
    }

    const raw = await this.renderService.listServices() as Array<{ service: Record<string, unknown> }>;

    return raw.map((item) => {
      const svc = item.service as {
        id: string;
        name: string;
        type: string;
        slug: string;
        suspended: string;
        serviceDetails?: { url?: string; region?: string; env?: string };
      };
      return {
        id: svc.id,
        name: svc.name,
        type: svc.type,
        slug: svc.slug,
        suspended: svc.suspended !== 'not_suspended',
        url: svc.serviceDetails?.url ?? null,
        region: svc.serviceDetails?.region ?? null,
        env: svc.serviceDetails?.env ?? null,
      };
    });
  }
}
