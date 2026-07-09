import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { jsonToDb } from '../../common/json-field';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class BuilderRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Sites ───────────────────────────────────────────────────────────────────

  listSites(organizationId: string) {
    return this.prisma.builderSite.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: 'desc' }
    });
  }

  findSiteById(id: string, organizationId: string) {
    return this.prisma.builderSite.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { pages: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } }
    });
  }

  createSite(data: {
    organizationId: string;
    name: string;
    slug: string;
    projectId?: string | null;
    templateId?: string | null;
    createdByUserId: string;
  }) {
    return this.prisma.builderSite.create({ data });
  }

  updateSite(id: string, data: Prisma.BuilderSiteUpdateInput) {
    return this.prisma.builderSite.update({ where: { id }, data });
  }

  archiveSite(id: string) {
    return this.prisma.builderSite.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'archived' }
    });
  }

  // ─── Pages ───────────────────────────────────────────────────────────────────

  listPages(siteId: string, organizationId: string) {
    return this.prisma.builderPage.findMany({
      where: { siteId, organizationId, deletedAt: null },
      orderBy: { sortOrder: 'asc' }
    });
  }

  findPageById(id: string, siteId: string, organizationId: string) {
    return this.prisma.builderPage.findFirst({
      where: { id, siteId, organizationId, deletedAt: null }
    });
  }

  createPage(data: {
    organizationId: string;
    siteId: string;
    title: string;
    path: string;
    sortOrder?: number;
    content?: Prisma.InputJsonValue;
  }) {
    return this.prisma.builderPage.create({ data: { ...data, content: jsonToDb(data.content, {}) } });
  }

  updatePageContent(id: string, content: Prisma.InputJsonValue) {
    return this.prisma.builderPage.update({
      where: { id },
      data: { content: jsonToDb(content, {}), updatedAt: new Date() }
    });
  }

  archivePage(id: string) {
    return this.prisma.builderPage.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'archived' }
    });
  }

  async createPageVersion(data: {
    organizationId: string;
    siteId: string;
    pageId: string;
    content: Prisma.InputJsonValue;
    createdByUserId: string;
    label?: string | null;
  }) {
    // Get the next version number
    const last = await this.prisma.builderPageVersion.findFirst({
      where: { pageId: data.pageId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true }
    });
    const versionNumber = (last?.versionNumber ?? 0) + 1;

    return this.prisma.builderPageVersion.create({
      data: {
        organizationId: data.organizationId,
        siteId: data.siteId,
        pageId: data.pageId,
        versionNumber,
        contentJson: jsonToDb(data.content, {}),
        createdByUserId: data.createdByUserId,
        label: data.label ?? null
      }
    });
  }

  listPageVersions(pageId: string, organizationId: string, take = 20) {
    return this.prisma.builderPageVersion.findMany({
      where: { pageId, organizationId },
      orderBy: { createdAt: 'desc' },
      take
    });
  }

  // ─── Templates ───────────────────────────────────────────────────────────────

  listTemplates() {
    return this.prisma.template.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' }
    });
  }

  findTemplateById(id: string) {
    return this.prisma.template.findUnique({ where: { id } });
  }

  generateSlug(name: string) {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }
}
