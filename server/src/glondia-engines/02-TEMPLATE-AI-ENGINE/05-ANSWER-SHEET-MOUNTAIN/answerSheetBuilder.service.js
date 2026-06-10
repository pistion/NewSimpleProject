/**
 * answerSheetBuilder.service.js
 *
 * Converts a SitePlan into a structured answer sheet.
 * No AI — pure data transformation from plan.brief, plan.sitemap, plan.wireframe.
 */

import { DEFAULT_ANSWER_SHEET, ANSWER_SHEET_VERSION, SECTION_TYPES } from './answerSheet.schema.js';

export function buildAnswerSheetFromPlan(plan = {}) {
  const now = new Date().toISOString();
  const brief = plan.brief || {};
  const sitemap = plan.sitemap || {};
  const wireframe = plan.wireframe || {};

  return {
    ...structuredClone(DEFAULT_ANSWER_SHEET),
    version: ANSWER_SHEET_VERSION,
    source: 'site-plan',
    status: 'draft',
    business: {
      name: brief.businessName || sitemap.name || '',
      industry: brief.industry || '',
      location: brief.location || '',
      description: brief.description || '',
      targetAudience: brief.targetAudience || brief.audience || '',
      offer: brief.offer || '',
      uniqueSellingPoint: brief.uniqueSellingPoint || brief.usp || '',
      goals: brief.goals || '',
    },
    brand: {
      tone: brief.brandTone || brief.tone || '',
      colors: brief.colors || '',
      stylePreferences: brief.stylePreferences || '',
    },
    pages: buildPagesFromSitemapAndWireframe(sitemap, wireframe),
    contact: {
      phone: brief.phone || brief.contactPhone || '',
      email: brief.email || brief.contactEmail || '',
      whatsapp: brief.whatsapp || '',
      address: brief.address || brief.contact || '',
      socialLinks: normalizeSocialLinks(brief.socialLinks || brief.socials),
      primaryAction: brief.primaryAction || brief.bookingMethod || brief.contact || '',
    },
    seo: {
      title: brief.seoTitle || '',
      description: brief.seoDescription || '',
      keywords: normalizeKeywords(brief.keywords || brief.seoKeywords),
    },
    notes: brief.notes || '',
    meta: {
      createdAt: plan.answerSheet?.meta?.createdAt || now,
      updatedAt: now,
      generatedByAi: false,
      approvedAt: null,
      warnings: [],
    },
  };
}

// ── Page/section builders ─────────────────────────────────────────────────────

function buildPagesFromSitemapAndWireframe(sitemap = {}, wireframe = {}) {
  const sitemapPages = Array.isArray(sitemap.pages) ? sitemap.pages : [];
  const wireframePages = Array.isArray(wireframe.pages) ? wireframe.pages : [];

  if (!sitemapPages.length && !wireframePages.length) {
    return [defaultHomePage()];
  }

  return sitemapPages.map((page) => {
    const wfPage = wireframePages.find((wp) => wp.id === page.id || wp.name === page.name) || {};
    const sitemapSections = Array.isArray(page.sections) ? page.sections : [];
    const wfSections = Array.isArray(wfPage.sections) ? wfPage.sections : [];

    const sections = sitemapSections.length
      ? sitemapSections.map((section, i) => {
          const wfSection = wfSections.find((ws) => ws.id === section.id || ws.type === section.type) || wfSections[i] || {};
          return {
            id: section.id || uid('section'),
            type: normalizeSectionType(section.type || wfSection.type || 'details'),
            title: section.title || wfSection.title || '',
            content: section.description || section.content || wfSection.contentHint || wfSection.description || '',
            ctaText: section.ctaText || wfSection.ctaText || '',
            imageHint: section.imageHint || wfSection.imageHint || '',
            source: section.source || 'manual',
          };
        })
      : wfSections.map((wfSection) => ({
          id: wfSection.id || uid('section'),
          type: normalizeSectionType(wfSection.type || 'details'),
          title: wfSection.title || '',
          content: wfSection.contentHint || wfSection.description || '',
          ctaText: wfSection.ctaText || '',
          imageHint: wfSection.imageHint || '',
          source: 'manual',
        }));

    return {
      id: page.id || uid('page'),
      name: page.name || '',
      path: page.path || `/${slugify(page.name || '')}`,
      purpose: page.purpose || page.description || '',
      sections: sections.length ? sections : defaultSectionsForPage(page.name),
    };
  });
}

function defaultHomePage() {
  return {
    id: uid('page'),
    name: 'Home',
    path: '/',
    purpose: 'Main landing page',
    sections: [
      { id: uid('section'), type: 'hero', title: '', content: '', ctaText: '', imageHint: '', source: 'system' },
      { id: uid('section'), type: 'about', title: '', content: '', ctaText: '', imageHint: '', source: 'system' },
      { id: uid('section'), type: 'services', title: '', content: '', ctaText: '', imageHint: '', source: 'system' },
      { id: uid('section'), type: 'contact', title: '', content: '', ctaText: '', imageHint: '', source: 'system' },
    ],
  };
}

function defaultSectionsForPage(pageName = '') {
  const lc = String(pageName || '').toLowerCase();
  if (lc.includes('home') || lc === '') {
    return [
      { id: uid('section'), type: 'hero', title: '', content: '', ctaText: '', imageHint: '', source: 'system' },
      { id: uid('section'), type: 'about', title: '', content: '', ctaText: '', imageHint: '', source: 'system' },
    ];
  }
  if (lc.includes('about')) return [{ id: uid('section'), type: 'about', title: '', content: '', ctaText: '', imageHint: '', source: 'system' }];
  if (lc.includes('service')) return [{ id: uid('section'), type: 'services', title: '', content: '', ctaText: '', imageHint: '', source: 'system' }];
  if (lc.includes('contact')) return [{ id: uid('section'), type: 'contact', title: '', content: '', ctaText: '', imageHint: '', source: 'system' }];
  return [{ id: uid('section'), type: 'details', title: '', content: '', ctaText: '', imageHint: '', source: 'system' }];
}

// ── Normalizers ───────────────────────────────────────────────────────────────

function normalizeSectionType(value) {
  const type = String(value || '').toLowerCase().trim();
  return SECTION_TYPES.includes(type) ? type : 'details';
}

export function normalizeSocialLinks(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v || '').trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,\n]+/).map((v) => v.trim()).filter(Boolean);
  return [];
}

export function normalizeKeywords(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v || '').trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,\n]+/).map((v) => v.trim()).filter(Boolean);
  return [];
}

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function slugify(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'page';
}
