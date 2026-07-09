/**
 * templateGeneratedCopy.stage.js
 *
 * Shared helpers for customer-specific template copies. Heavy source templates
 * stay in /templates; every customer copy is published under
 * /generated-template-sites/{userId}/{siteId}-{slug}.
 */

export const DEFAULT_GENERATED_TEMPLATE_SITES_ROOT = 'generated-template-sites';

export function resolveGeneratedTemplateSitesRoot() {
  return cleanPath(
    process.env.RENDER_GENERATED_TEMPLATE_SITES_ROOT_DIR ||
    process.env.GENERATED_TEMPLATE_SITES_ROOT_DIR ||
    DEFAULT_GENERATED_TEMPLATE_SITES_ROOT,
  );
}

export function buildGeneratedTemplateTargetRoot(input = {}) {
  const data = typeof input === 'string' ? { slug: input } : (input || {});
  const owner = safeSegment(data.userId || data.ownerUserId || data.accountId || 'anonymous');
  const site = safeSegment(data.siteId || data.deploymentId || data.templateDeployId || 'site');
  const slug = slugify(data.slug || data.siteName || 'template-site');
  return [resolveGeneratedTemplateSitesRoot(), owner, `${site}-${slug}`].filter(Boolean).join('/');
}

export function buildTemplateCopyData({
  answers = {},
  site = {},
  template = {},
  slug = '',
  targetRoot = '',
  sourceReference = '',
} = {}) {
  const finalSlug = slugify(slug || site.slug || answers.slug || site.siteId);
  const templateId = template.templateId || site.templateId || answers.templateId || answers.parentTemplateId || '';
  const siteName = answers.siteName || answers.businessName || site.siteName || template.name || finalSlug;

  return {
    schema: 'glondia.generated-template-site.v1',
    source: 'template',
    sourceReference: sourceReference || (templateId ? `templates/${templateId}` : ''),
    template: {
      templateId,
      name: template.name || '',
      category: template.category || '',
      framework: template.framework || 'vite',
      templatePath: template.templatePath || (templateId ? `templates/${templateId}` : ''),
      buildCommand: template.buildCommand || 'npm run build',
      publishDirectory: template.publishDirectory || 'dist',
    },
    generated: {
      siteId: site.siteId || '',
      userId: site.userId || site.ownerUserId || answers.userId || '',
      siteName,
      slug: finalSlug,
      githubTargetRoot: targetRoot || buildGeneratedTemplateTargetRoot({ userId: site.userId || site.ownerUserId || answers.userId, siteId: site.siteId, slug: finalSlug }),
      createdAt: new Date().toISOString(),
    },
    userInput: {
      answers,
      brief: answers.brief || {
        businessName: answers.businessName || siteName,
        industry: answers.industry || '',
        targetAudience: answers.targetAudience || answers.audience || '',
        offer: answers.offer || '',
        brandTone: answers.brandTone || answers.tone || '',
        colors: answers.colors || '',
        stylePreferences: answers.stylePreferences || '',
        contact: answers.contact || '',
        domainPreference: answers.domainPreference || answers.domain || '',
        notes: answers.notes || '',
      },
      sitemap: answers.sitemap || null,
      wireframe: answers.wireframe || null,
      style: answers.style || null,
    },
  };
}

function cleanPath(value = '') {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
}

function safeSegment(value = '') {
  return slugify(value).slice(0, 90) || 'unknown';
}

function slugify(value) {
  return String(value || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site';
}
