import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequestWithContext } from '../../common/types/request-with-context';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateEnvVarDto } from './dto/create-env-var.dto';
import { EnvVarParamsDto } from './dto/env-var-params.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectParamsDto } from './dto/project-params.dto';
import { UpdateEnvVarDto } from './dto/update-env-var.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@Controller({ path: 'projects', version: '1' })
@UseGuards(JwtAuthGuard, RbacGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @RequirePermissions('project:read')
  @ApiOkResponse({ description: 'Lists projects for the current organization.' })
  list(@Req() request: RequestWithContext) {
    return this.projectsService.list(this.getActorContext(request));
  }

  @Post()
  @RequirePermissions('project:create')
  @ApiCreatedResponse({ description: 'Creates a project for the current organization.' })
  create(@Body() dto: CreateProjectDto, @Req() request: RequestWithContext) {
    return this.projectsService.create(dto, this.getActorContext(request));
  }

  @Get(':projectId')
  @RequirePermissions('project:read')
  @ApiOkResponse({ description: 'Returns one project from the current organization.' })
  get(@Param() params: ProjectParamsDto, @Req() request: RequestWithContext) {
    return this.projectsService.get(params.projectId, this.getActorContext(request));
  }

  @Patch(':projectId')
  @RequirePermissions('project:update')
  @ApiOkResponse({ description: 'Updates a project in the current organization.' })
  update(
    @Param() params: ProjectParamsDto,
    @Body() dto: UpdateProjectDto,
    @Req() request: RequestWithContext
  ) {
    return this.projectsService.update(params.projectId, dto, this.getActorContext(request));
  }

  @Delete(':projectId')
  @RequirePermissions('project:delete')
  @ApiOkResponse({ description: 'Archives a project in the current organization.' })
  archive(@Param() params: ProjectParamsDto, @Req() request: RequestWithContext) {
    return this.projectsService.archive(params.projectId, this.getActorContext(request));
  }

  @Get(':projectId/env-vars')
  @RequirePermissions('project:env:manage')
  @ApiOkResponse({ description: 'Lists environment variables for a project.' })
  listEnvVars(@Param() params: ProjectParamsDto, @Req() request: RequestWithContext) {
    return this.projectsService.listEnvVars(params.projectId, this.getActorContext(request));
  }

  @Get(':projectId/env-vars/export')
  @RequirePermissions('project:env:manage')
  @ApiOkResponse({ description: 'Exports environment variables with decrypted values for a given environment.' })
  exportEnvVars(
    @Param() params: ProjectParamsDto,
    @Query('environment') environment: string | undefined,
    @Req() request: RequestWithContext
  ) {
    return this.projectsService.exportEnvVars(params.projectId, environment, this.getActorContext(request));
  }

  @Post(':projectId/env-vars')
  @RequirePermissions('project:env:manage')
  @ApiCreatedResponse({ description: 'Creates an encrypted environment variable.' })
  createEnvVar(
    @Param() params: ProjectParamsDto,
    @Body() dto: CreateEnvVarDto,
    @Req() request: RequestWithContext
  ) {
    return this.projectsService.createEnvVar(params.projectId, dto, this.getActorContext(request));
  }

  @Patch(':projectId/env-vars/:envVarId')
  @RequirePermissions('project:env:manage')
  @ApiOkResponse({ description: 'Updates an encrypted environment variable value.' })
  updateEnvVar(
    @Param() params: EnvVarParamsDto,
    @Body() dto: UpdateEnvVarDto,
    @Req() request: RequestWithContext
  ) {
    return this.projectsService.updateEnvVar(params.projectId, params.envVarId, dto, this.getActorContext(request));
  }

  @Delete(':projectId/env-vars/:envVarId')
  @RequirePermissions('project:env:manage')
  @ApiOkResponse({ description: 'Deletes an environment variable.' })
  deleteEnvVar(@Param() params: EnvVarParamsDto, @Req() request: RequestWithContext) {
    return this.projectsService.deleteEnvVar(params.projectId, params.envVarId, this.getActorContext(request));
  }

  private getActorContext(request: RequestWithContext) {
    return {
      userId: request.auth!.user.id,
      organizationId: request.auth!.organization.id
    };
  }
}
