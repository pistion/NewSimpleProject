/**
 * answerSheetBuilder.service.js
 *
 * Converts a SitePlan into a structured answer sheet.
 * No AI — pure data transformation from plan.brief, plan.sitemap, plan.wireframe.
 */

import { DEFAULT_ANSWER_SHEET, ANSWER_SHEET_VERSION, isKnownSectionType } from './answerSheet.schema.js';

export function buildAnswerSheetFromPlan(plan = {}) {
  const now = new Date().toISOString();
  const brief = plan.brief || {};
  const sitemap = plan.sitemap || {};
  const wireframe = plan.wireframe || {};
  // Template sections hint (from plan.templateManifest if available)
  const templateSections = plan.templateManifest?.supportedSections || plan.supportedSections || [];

  return {
    ...structuredClone(DEFAULT_ANSWER_SHEET),
    version: ANSWER_SHEET_VERSION,
    source: 'site-plan',
    status: 'draft',
    business: {
      name: brief.businessName || sitemap.name || '',
      industry: brief.industry || '',
      location: brief.location || '',
      description: brief.description || brief.about || '',
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
    pages: buildPagesFromSitemapAndWireframe(sitemap, wireframe, brief, templateSections),
    contact: {
      phone: brief.phone || brief.contactPhone || '',
      // brief.contact may hold an email address or general contact string
      email: brief.email || brief.contactEmail || (isEmail(brief.contact) ? brief.contact : ''),
      whatsapp: brief.whatsapp || '',
      address: brief.address || (!isEmail(brief.contact) ? brief.contact : '') || '',
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

function buildPagesFromSitemapAndWireframe(sitemap = {}, wireframe = {}, brief = {}, templateSections = []) {
  const sitemapPages = Array.isArray(sitemap.pages) ? sitemap.pages : [];
  const wireframePages = Array.isArray(wireframe.pages) ? wireframe.pages : [];

  if (!sitemapPages.length && !wireframePages.length) {
    // Parse brief.pages string ("Home, Shop, Product, Lookbook, Studio, Contact")
    const briefPageNames = parseBriefPages(brief.pages);
    if (briefPageNames.length) {
      return briefPageNames.map(name => ({
        id: uid('page'),
        name,
        path: name.toLowerCase() === 'home' ? '/' : `/${slugify(name)}`,
        purpose: '',
        sections: defaultSectionsForPage(name, templateSections),
      }));
    }
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
            type: normalizeSectionType(section.type || wfSection.type || 'details', templateSections),
            title: section.title || wfSection.title || '',
            content: section.description || section.content || wfSection.contentHint || wfSection.description || '',
            ctaText: section.ctaText || wfSection.ctaText || '',
            imageHint: section.imageHint || wfSection.imageHint || '',
            source: section.source || 'manual',
          };
        })
      : wfSections.map((wfSection) => ({
          id: wfSection.id || uid('section'),
          type: normalizeSectionType(wfSection.type || 'details', templateSections),
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
      sections: sections.length ? sections : defaultSectionsForPage(page.name, templateSections),
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

function defaultSectionsForPage(pageName = '', templateSections = []) {
  const lc = String(pageName || '').toLowerCase();

  // If we have template manifest sections, pick the most relevant ones per page
  if (templateSections.length) {
    const picked = pickTemplateSectionsForPage(lc, templateSections);
    if (picked.length) {
      return picked.map(type => ({
        id: uid('section'), type, title: '', content: '', ctaText: '', imageHint: '', source: 'system',
      }));
    }
  }

  // Generic fallback
  if (lc.includes('home') || lc === '') {
    return [
      { id: uid('section'), type: 'hero', title: '', content: '', ctaText: '', imageHint: '', source: 'system' },
      { id: uid('section'), type: 'about', title: '', content: '', ctaText: '', imageHint: '', source: 'system' },
    ];
  }
  if (lc.includes('about')) return [{ id: uid('section'), type: 'about', title: '', content: '', ctaText: '', imageHint: '', source: 'system' }];
  if (lc.includes('shop') || lc.includes('store')) return [{ id: uid('section'), type: 'featured-products', title: '', content: '', ctaText: '', imageHint: '', source: 'system' }];
  if (lc.includes('product')) return [{ id: uid('section'), type: 'product', title: '', content: '', ctaText: '', imageHint: '', source: 'system' }];
  if (lc.includes('look') || lc.includes('gallery')) return [{ id: uid('section'), type: 'lookbook', title: '', content: '', ctaText: '', imageHint: '', source: 'system' }];
  if (lc.includes('studio') || lc.includes('about')) return [{ id: uid('section'), type: 'studio-story', title: '', content: '', ctaText: '', imageHint: '', source: 'system' }];
  if (lc.includes('service')) return [{ id: uid('section'), type: 'services', title: '', content: '', ctaText: '', imageHint: '', source: 'system' }];
  if (lc.includes('contact')) return [{ id: uid('section'), type: 'contact-form', title: '', content: '', ctaText: '', imageHint: '', source: 'system' }];
  if (lc.includes('repair') || lc.includes('support')) return [{ id: uid('section'), type: 'repair-intake', title: '', content: '', ctaText: '', imageHint: '', source: 'system' }];
  return [{ id: uid('section'), type: 'details', title: '', content: '', ctaText: '', imageHint: '', source: 'system' }];
}

function pickTemplateSectionsForPage(pageLc = '', templateSections = []) {
  // Map page name patterns to preferred section types from the template manifest
  const PAGE_SECTION_MAP = {
    home: ['hero', 'featured-products', 'drop-ticker', 'lookbook', 'newsletter'],
    shop: ['featured-products', 'product-grid'],
    product: ['product', 'spec-sheet'],
    lookbook: ['lookbook'],
    studio: ['studio-story'],
    about: ['studio-story', 'about'],
    contact: ['contact-form', 'contact'],
    repair: ['repair-intake'],
    support: ['support', 'repair-intake'],
    'field-notes': ['field-notes'],
  };

  // Find matching key
  const matchKey = Object.keys(PAGE_SECTION_MAP).find(k => pageLc.includes(k));
  if (!matchKey) return [];

  const preferred = PAGE_SECTION_MAP[matchKey];
  // Only return types that actually exist in this template
  return preferred.filter(type => templateSections.includes(type));
}

// ── Normalizers ───────────────────────────────────────────────────────────────

function normalizeSectionType(value, templateSections = []) {
  const type = String(value || '').toLowerCase().trim();
  return isKnownSectionType(type, templateSections) ? type : 'details';
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

function isEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// Parse "Home, Shop, Product, Lookbook, Studio, Contact" → ['Home','Shop',...]
function parseBriefPages(pages) {
  if (!pages) return [];
  if (Array.isArray(pages)) return pages.map(p => String(p).trim()).filter(Boolean);
  return String(pages).split(/[,\n;|]+/).map(p => p.trim()).filter(Boolean);
}
