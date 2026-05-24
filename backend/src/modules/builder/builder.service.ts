import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { jsonFromDb } from '../../common/json-field';
import { CreatePageDto } from './dto/create-page.dto';
import { CreateSiteDto } from './dto/create-site.dto';
import { SavePageContentDto } from './dto/save-page-content.dto';
import { UpdateSiteDto } from './dto/update-site.dto';
import { BuilderRepository } from './builder.repository';

interface ActorContext {
  userId: string;
  organizationId: string;
}

@Injectable()
export class BuilderService {
  constructor(private readonly repo: BuilderRepository) {}

  // ─── Templates ───────────────────────────────────────────────────────────────

  listTemplates() {
    return this.repo.listTemplates();
  }

  async getTemplate(id: string) {
    const template = await this.repo.findTemplateById(id);
    if (!template) throw new NotFoundException('Template not found.');
    return template;
  }

  // ─── Sites ───────────────────────────────────────────────────────────────────

  listSites(context: ActorContext) {
    return this.repo.listSites(context.organizationId);
  }

  async getSite(siteId: string, context: ActorContext) {
    const site = await this.repo.findSiteById(siteId, context.organizationId);
    if (!site) throw new NotFoundException('Builder site not found.');
    return site;
  }

  async createSite(dto: CreateSiteDto, context: ActorContext) {
    let templateContentJson: Record<string, unknown> | null = null;

    if (dto.templateId) {
      const template = await this.repo.findTemplateById(dto.templateId);
      if (!template) throw new NotFoundException('Template not found.');
      templateContentJson = jsonFromDb<Record<string, unknown>>(template.contentJson, {});
    }

    const slug = this.repo.generateSlug(dto.name);
    const site = await this.repo.createSite({
      organizationId: context.organizationId,
      name: dto.name,
      slug,
      projectId: dto.projectId ?? null,
      templateId: dto.templateId ?? null,
      createdByUserId: context.userId
    });

    // Auto-create a home page
    await this.repo.createPage({
      organizationId: context.organizationId,
      siteId: site.id,
      title: 'Home',
      path: '/',
      sortOrder: 0,
      content: (templateContentJson ?? {}) as Prisma.InputJsonValue
    });

    return this.repo.findSiteById(site.id, context.organizationId);
  }

  async updateSite(siteId: string, dto: UpdateSiteDto, context: ActorContext) {
    await this.getSite(siteId, context);
    return this.repo.updateSite(siteId, {
      name: dto.name,
      slug: dto.slug
    });
  }

  async publishSite(siteId: string, context: ActorContext) {
    await this.getSite(siteId, context);
    return this.repo.updateSite(siteId, {
      status: 'published',
      publishedAt: new Date()
    });
  }

  async archiveSite(siteId: string, context: ActorContext) {
    await this.getSite(siteId, context);
    return this.repo.archiveSite(siteId);
  }

  // ─── Pages ───────────────────────────────────────────────────────────────────

  async listPages(siteId: string, context: ActorContext) {
    await this.getSite(siteId, context);
    return this.repo.listPages(siteId, context.organizationId);
  }

  async getPage(siteId: string, pageId: string, context: ActorContext) {
    await this.getSite(siteId, context);
    const page = await this.repo.findPageById(pageId, siteId, context.organizationId);
    if (!page) throw new NotFoundException('Page not found.');
    return page;
  }

  async createPage(siteId: string, dto: CreatePageDto, context: ActorContext) {
    await this.getSite(siteId, context);
    const path = dto.slug
      ? `/${dto.slug.replace(/^\//, '')}`
      : `/${dto.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-/]/g, '')}`;

    return this.repo.createPage({
      organizationId: context.organizationId,
      siteId,
      title: dto.title,
      path,
      sortOrder: dto.sortOrder ?? 0
    });
  }

  async savePage(siteId: string, pageId: string, dto: SavePageContentDto, context: ActorContext) {
    const page = await this.getPage(siteId, pageId, context);

    // Snapshot previous content as a version
    const previousContent = jsonFromDb<Record<string, unknown>>(page.content, {});
    if (Object.keys(previousContent).length > 0) {
      await this.repo.createPageVersion({
        organizationId: context.organizationId,
        siteId,
        pageId: page.id,
        content: previousContent as Prisma.InputJsonValue,
        createdByUserId: context.userId
      });
    }

    return this.repo.updatePageContent(pageId, dto.content as Prisma.InputJsonValue);
  }

  async deletePage(siteId: string, pageId: string, context: ActorContext) {
    await this.getPage(siteId, pageId, context);
    return this.repo.archivePage(pageId);
  }

  async listPageVersions(siteId: string, pageId: string, context: ActorContext) {
    await this.getPage(siteId, pageId, context);
    return this.repo.listPageVersions(pageId, context.organizationId);
  }

  async createSiteFromUpload(file: Express.Multer.File, context: ActorContext) {
    const rawName = file.originalname
      .replace(/\.zip$/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .trim() || 'Uploaded Site';

    const name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    const slug = this.repo.generateSlug(name);

    const site = await this.repo.createSite({
      organizationId: context.organizationId,
      name,
      slug,
      projectId: null,
      templateId: null,
      createdByUserId: context.userId
    });

    await this.repo.createPage({
      organizationId: context.organizationId,
      siteId: site.id,
      title: 'Home',
      path: '/',
      sortOrder: 0,
      content: {
        _source: 'upload',
        _filename: file.originalname,
        _mimeType: file.mimetype,
        _sizeBytes: file.size,
        _uploadedAt: new Date().toISOString()
      }
    });

    return this.repo.findSiteById(site.id, context.organizationId);
  }
}
