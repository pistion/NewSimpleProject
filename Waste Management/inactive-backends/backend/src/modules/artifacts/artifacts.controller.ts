import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequestWithContext } from '../../common/types/request-with-context';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ArtifactParamsDto } from './dto/artifact-params.dto';
import { ProjectArtifactsParamsDto } from './dto/project-artifacts-params.dto';
import { ArtifactsService } from './artifacts.service';

@ApiTags('artifacts')
@Controller({ version: '1' })
@UseGuards(JwtAuthGuard, RbacGuard)
export class ArtifactsController {
  constructor(private readonly artifactsService: ArtifactsService) {}

  @Get('projects/:projectId/artifacts')
  @RequirePermissions('asset:read')
  @ApiOkResponse({ description: 'Lists deployment artifacts for a project.' })
  listForProject(@Param() params: ProjectArtifactsParamsDto, @Req() request: RequestWithContext) {
    return this.artifactsService.listForProject(params.projectId, this.getActorContext(request));
  }

  @Get('artifacts/:artifactId')
  @RequirePermissions('asset:read')
  @ApiOkResponse({ description: 'Returns one deployment artifact.' })
  get(@Param() params: ArtifactParamsDto, @Req() request: RequestWithContext) {
    return this.artifactsService.get(params.artifactId, this.getActorContext(request));
  }

  private getActorContext(request: RequestWithContext) {
    return {
      organizationId: request.auth!.organization.id
    };
  }
}
