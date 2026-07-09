import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequestWithContext } from '../../common/types/request-with-context';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BuilderService } from './builder.service';
import { AiEditDto } from './dto/ai-edit.dto';
import { CreatePageDto } from './dto/create-page.dto';
import { CreateSiteDto } from './dto/create-site.dto';
import { SavePageContentDto } from './dto/save-page-content.dto';
import { UpdateSiteDto } from './dto/update-site.dto';

@ApiTags('builder')
@Controller({ version: '1' })
@UseGuards(JwtAuthGuard, RbacGuard)
export class BuilderController {
  constructor(private readonly builderService: BuilderService) {}

  // ─── Templates (public-ish — only read permission) ───────────────────────────

  @Get('builder/templates')
  @RequirePermissions('builder:read')
  @ApiOkResponse({ description: 'Lists available site templates.' })
  listTemplates() {
    return this.builderService.listTemplates();
  }

  @Get('builder/templates/:templateId')
  @RequirePermissions('builder:read')
  @ApiOkResponse({ description: 'Returns a single template.' })
  getTemplate(@Param('templateId') templateId: string) {
    return this.builderService.getTemplate(templateId);
  }

  // ─── Sites ───────────────────────────────────────────────────────────────────

  @Get('builder/sites')
  @RequirePermissions('builder:read')
  @ApiOkResponse({ description: 'Lists builder sites for the organization.' })
  listSites(@Req() request: RequestWithContext) {
    return this.builderService.listSites(this.ctx(request));
  }

  @Post('builder/sites')
  @RequirePermissions('builder:create')
  @ApiCreatedResponse({ description: 'Creates a new builder site.' })
  createSite(@Body() dto: CreateSiteDto, @Req() request: RequestWithContext) {
    return this.builderService.createSite(dto, this.ctx(request));
  }

  @Get('builder/sites/:siteId')
  @RequirePermissions('builder:read')
  @ApiOkResponse({ description: 'Returns a builder site with its pages.' })
  getSite(@Param('siteId') siteId: string, @Req() request: RequestWithContext) {
    return this.builderService.getSite(siteId, this.ctx(request));
  }

  @Patch('builder/sites/:siteId')
  @RequirePermissions('builder:update')
  @ApiOkResponse({ description: 'Updates builder site metadata.' })
  updateSite(@Param('siteId') siteId: string, @Body() dto: UpdateSiteDto, @Req() request: RequestWithContext) {
    return this.builderService.updateSite(siteId, dto, this.ctx(request));
  }

  @Post('builder/sites/:siteId/publish')
  @RequirePermissions('builder:publish')
  @ApiCreatedResponse({ description: 'Publishes the builder site.' })
  publishSite(@Param('siteId') siteId: string, @Req() request: RequestWithContext) {
    return this.builderService.publishSite(siteId, this.ctx(request));
  }

  @Delete('builder/sites/:siteId')
  @RequirePermissions('builder:delete')
  @ApiOkResponse({ description: 'Archives a builder site.' })
  archiveSite(@Param('siteId') siteId: string, @Req() request: RequestWithContext) {
    return this.builderService.archiveSite(siteId, this.ctx(request));
  }

  // ─── Pages ───────────────────────────────────────────────────────────────────

  @Get('builder/sites/:siteId/pages')
  @RequirePermissions('builder:read')
  @ApiOkResponse({ description: 'Lists pages in a builder site.' })
  listPages(@Param('siteId') siteId: string, @Req() request: RequestWithContext) {
    return this.builderService.listPages(siteId, this.ctx(request));
  }

  @Post('builder/sites/:siteId/pages')
  @RequirePermissions('builder:create')
  @ApiCreatedResponse({ description: 'Creates a page in a builder site.' })
  createPage(
    @Param('siteId') siteId: string,
    @Body() dto: CreatePageDto,
    @Req() request: RequestWithContext
  ) {
    return this.builderService.createPage(siteId, dto, this.ctx(request));
  }

  @Get('builder/sites/:siteId/pages/:pageId')
  @RequirePermissions('builder:read')
  @ApiOkResponse({ description: 'Returns a page with its current content.' })
  getPage(@Param('siteId') siteId: string, @Param('pageId') pageId: string, @Req() request: RequestWithContext) {
    return this.builderService.getPage(siteId, pageId, this.ctx(request));
  }

  @Patch('builder/sites/:siteId/pages/:pageId')
  @RequirePermissions('builder:update')
  @ApiOkResponse({ description: 'Saves page content (creates a version snapshot).' })
  savePage(
    @Param('siteId') siteId: string,
    @Param('pageId') pageId: string,
    @Body() dto: SavePageContentDto,
    @Req() request: RequestWithContext
  ) {
    return this.builderService.savePage(siteId, pageId, dto, this.ctx(request));
  }

  @Delete('builder/sites/:siteId/pages/:pageId')
  @RequirePermissions('builder:delete')
  @ApiOkResponse({ description: 'Deletes a page from a builder site.' })
  deletePage(
    @Param('siteId') siteId: string,
    @Param('pageId') pageId: string,
    @Req() request: RequestWithContext
  ) {
    return this.builderService.deletePage(siteId, pageId, this.ctx(request));
  }

  @Get('builder/sites/:siteId/pages/:pageId/versions')
  @RequirePermissions('builder:read')
  @ApiOkResponse({ description: 'Lists saved versions of a page.' })
  listPageVersions(
    @Param('siteId') siteId: string,
    @Param('pageId') pageId: string,
    @Req() request: RequestWithContext
  ) {
    return this.builderService.listPageVersions(siteId, pageId, this.ctx(request));
  }

  // ─── AI Editing ──────────────────────────────────────────────────────────────

  @Post('builder/ai/edit')
  @RequirePermissions('builder:update')
  @ApiCreatedResponse({ description: 'Uses GPT-4o to edit a page\'s HTML based on a plain-English instruction.' })
  aiEditPage(@Body() dto: AiEditDto) {
    return this.builderService.aiEditPage(dto);
  }

  // ─── Upload ──────────────────────────────────────────────────────────────────

  @Post('builder/upload')
  @RequirePermissions('builder:create')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
        cb(null, true);
      } else {
        cb(new Error('Only ZIP files are accepted.'), false);
      }
    }
  }))
  @ApiConsumes('multipart/form-data')
  @ApiCreatedResponse({ description: 'Uploads a site ZIP package and creates a builder site record.' })
  async uploadSitePackage(
    @UploadedFile() file: Express.Multer.File,
    @Req() request: RequestWithContext
  ) {
    if (!file) throw new Error('No file provided.');
    return this.builderService.createSiteFromUpload(file, this.ctx(request));
  }

  private ctx(request: RequestWithContext) {
    return {
      userId: request.auth!.user.id,
      organizationId: request.auth!.organization.id
    };
  }
}
