import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import OpenAI from 'openai';
import { jsonFromDb } from '../../common/json-field';
import { AiEditDto } from './dto/ai-edit.dto';
import { CreatePageDto } from './dto/create-page.dto';
import { CreateSiteDto } from './dto/create-site.dto';
import { SavePageContentDto } from './dto/save-page-content.dto';
import { UpdateSiteDto } from './dto/update-site.dto';
import { BuilderRepository } from './builder.repository';

interface ActorContext {
  userId: string;
  organizationId: string;
}

interface HtmlTemplatePage {
  path: string;
  title: string;
  filename: string;
  html: string;
}

interface HtmlTemplateContent {
  _source: 'html-template';
  pages: HtmlTemplatePage[];
}

@Injectable()
export class BuilderService {
  private readonly logger = new Logger(BuilderService.name);
  private readonly openai: OpenAI | null;

  constructor(private readonly repo: BuilderRepository) {
    const apiKey = process.env.OPENAI_API_KEY;
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
    if (!this.openai) {
      this.logger.warn('OPENAI_API_KEY not set — AI editing will be unavailable.');
    }
  }

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

    // HTML multi-page template: create one BuilderPage per page in the template
    if (templateContentJson?._source === 'html-template') {
      const tpl = templateContentJson as unknown as HtmlTemplateContent;
      const pages = tpl.pages ?? [];
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        await this.repo.createPage({
          organizationId: context.organizationId,
          siteId: site.id,
          title: p.title,
          path: p.path,
          sortOrder: i,
          content: {
            _source: 'html-template',
            _filename: p.filename,
            html: p.html
          } as Prisma.InputJsonValue
        });
      }
    } else {
      // Standard single-page builder or blank
      await this.repo.createPage({
        organizationId: context.organizationId,
        siteId: site.id,
        title: 'Home',
        path: '/',
        sortOrder: 0,
        content: (templateContentJson ?? {}) as Prisma.InputJsonValue
      });
    }

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

  // ─── AI editing ──────────────────────────────────────────────────────────────

  async aiEditPage(dto: AiEditDto): Promise<{ html: string; summary: string }> {
    if (!this.openai) {
      throw new BadRequestException('AI editing is not configured. Set OPENAI_API_KEY in your environment.');
    }

    const systemPrompt = `You are an expert web developer and copywriter integrated into a static-site builder.
The user will provide you with the full HTML source of a webpage and a plain-English instruction.
Your job is to apply the instruction accurately while preserving the page's structure, CSS, and design.

Rules:
- Return ONLY the complete, valid HTML document — no markdown fences, no explanation, no extra text.
- Preserve all <style> blocks, <link> tags, and inline styles exactly unless the instruction explicitly asks to change them.
- Preserve all JavaScript unless explicitly asked to change it.
- When changing text, match the existing tone and typography conventions of the template.
- When changing colours, update the CSS custom property or inline style, not arbitrary elements.
- Do not add new external dependencies or CDN links.
- The output must be a complete, self-contained HTML file that renders correctly in a browser.`;

    const userMessage = `Page path: ${dto.path ?? '/'}

Instruction from user:
${dto.prompt}

Current HTML source:
${dto.html}`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage }
      ],
      temperature: 0.3,
      max_tokens: 16000
    });

    const rawOutput = completion.choices[0]?.message?.content ?? '';

    // Strip accidental markdown fences if the model adds them
    const html = rawOutput
      .replace(/^```(?:html)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    if (!html.toLowerCase().includes('<!doctype') && !html.toLowerCase().includes('<html')) {
      throw new BadRequestException('AI returned an unexpected response. Please try a more specific instruction.');
    }

    // Generate a brief summary of what was changed using a cheap fast call
    const summaryCompletion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: `Summarise in one short sentence (≤20 words) what was changed in this webpage based on this instruction: "${dto.prompt}"`
        }
      ],
      temperature: 0.2,
      max_tokens: 60
    });
    const summary = summaryCompletion.choices[0]?.message?.content?.trim() ?? 'Changes applied.';

    return { html, summary };
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
