import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiAcceptedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequestWithContext } from '../../common/types/request-with-context';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateDeploymentDto } from './dto/create-deployment.dto';
import { CreateRenderDeploymentDto } from './dto/create-render-deployment.dto';
import { DeploymentParamsDto } from './dto/deployment-params.dto';
import { ProjectDeploymentParamsDto } from './dto/project-deployment-params.dto';
import { DeploymentsService } from './deployments.service';

@ApiTags('deployments')
@Controller({ version: '1' })
@UseGuards(JwtAuthGuard, RbacGuard)
export class DeploymentsController {
  constructor(private readonly deploymentsService: DeploymentsService) {}

  @Get('projects/:projectId/deployments')
  @RequirePermissions('deployment:read')
  @ApiOkResponse({ description: 'Lists deployments for a project.' })
  listForProject(@Param() params: ProjectDeploymentParamsDto, @Req() request: RequestWithContext) {
    return this.deploymentsService.listForProject(params.projectId, this.getActorContext(request));
  }

  @Post('projects/:projectId/deployments')
  @RequirePermissions('deployment:create')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ description: 'Queues a deployment for a project.' })
  create(
    @Param() params: ProjectDeploymentParamsDto,
    @Body() dto: CreateDeploymentDto,
    @Req() request: RequestWithContext
  ) {
    return this.deploymentsService.create(params.projectId, dto, this.getActorContext(request));
  }

  @Post('deployments/render')
  @RequirePermissions('deployment:create')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ description: 'Creates or triggers a real Render deployment.' })
  createRenderDeployment(
    @Body() dto: CreateRenderDeploymentDto,
    @Req() request: RequestWithContext
  ) {
    return this.deploymentsService.createRenderDeployment(dto, this.getActorContext(request));
  }

  @Get('deployments/:deploymentId')
  @RequirePermissions('deployment:read')
  @ApiOkResponse({ description: 'Returns one deployment.' })
  get(@Param() params: DeploymentParamsDto, @Req() request: RequestWithContext) {
    return this.deploymentsService.get(params.deploymentId, this.getActorContext(request));
  }

  @Get('deployments/:deploymentId/status')
  @RequirePermissions('deployment:read')
  @ApiOkResponse({ description: 'Refreshes and returns Render deployment status.' })
  getRenderStatus(@Param() params: DeploymentParamsDto, @Req() request: RequestWithContext) {
    return this.deploymentsService.getRenderStatus(params.deploymentId, this.getActorContext(request));
  }

  @Get('deployments/:deploymentId/logs')
  @RequirePermissions('deployment:read')
  @ApiOkResponse({ description: 'Returns deployment logs.' })
  listLogs(@Param() params: DeploymentParamsDto, @Req() request: RequestWithContext) {
    return this.deploymentsService.listLogs(params.deploymentId, this.getActorContext(request));
  }

  @Post('deployments/:deploymentId/cancel')
  @RequirePermissions('deployment:cancel')
  @ApiOkResponse({ description: 'Cancels a queued or running deployment.' })
  cancel(@Param() params: DeploymentParamsDto, @Req() request: RequestWithContext) {
    return this.deploymentsService.cancel(params.deploymentId, this.getActorContext(request));
  }

  @Post('deployments/:deploymentId/rollback')
  @RequirePermissions('deployment:rollback')
  @ApiOkResponse({ description: 'Marks a deployed deployment as rolled back.' })
  rollback(@Param() params: DeploymentParamsDto, @Req() request: RequestWithContext) {
    return this.deploymentsService.rollback(params.deploymentId, this.getActorContext(request));
  }

  private getActorContext(request: RequestWithContext) {
    return {
      userId: request.auth!.user.id,
      organizationId: request.auth!.organization.id
    };
  }
}
