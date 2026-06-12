/**
 * answerSheet.schema.js
 *
 * Schema constants, default shape, and allowed section types for the
 * Glondia answer-sheet layer.
 */

export const ANSWER_SHEET_VERSION = '1.0.0';

export const REQUIRED_ANSWER_SHEET_PATHS = [
  'business.name',
  'business.industry',
  'business.description',
  'pages',
  'contact.primaryAction',
];

export const DEFAULT_ANSWER_SHEET = {
  version: ANSWER_SHEET_VERSION,
  source: 'glondia-answer-sheet',
  status: 'draft',
  business: {
    name: '',
    industry: '',
    location: '',
    description: '',
    targetAudience: '',
    offer: '',
    uniqueSellingPoint: '',
    goals: '',
  },
  brand: {
    tone: '',
    colors: '',
    stylePreferences: '',
  },
  pages: [],
  contact: {
    phone: '',
    email: '',
    whatsapp: '',
    address: '',
    socialLinks: [],
    primaryAction: '',
  },
  seo: {
    title: '',
    description: '',
    keywords: [],
  },
  notes: '',
  meta: {
    createdAt: null,
    updatedAt: null,
    generatedByAi: false,
    approvedAt: null,
    warnings: [],
  },
};

export const SECTION_TYPES = [
  'hero',
  'about',
  'services',
  'features',
  'gallery',
  'testimonials',
  'faq',
  'pricing',
  'process',
  'team',
  'contact',
  'cta',
  'details',
  'form',
];

// Section types templates may declare beyond the generic list. Kept in sync with
// the template.json manifests in the template library (forge, pulse-works, …).
export const TEMPLATE_SECTION_TYPES = [
  'navigation',
  'footer',
  'newsletter',
  'technical-hero',
  'product',
  'product-grid',
  'featured-products',
  'spec-sheet',
  'repair-intake',
  'field-notes',
  'support',
  'lookbook',
  'drop-ticker',
  'studio-story',
  'contact-form',
];

/**
 * True when a section type fills the hero slot — covers the generic 'hero'
 * plus template-specific variants like 'technical-hero' or 'hero-banner'.
 */
export function isHeroSectionType(type) {
  const t = String(type || '').toLowerCase().trim();
  return t === 'hero' || t.startsWith('hero-') || t.endsWith('-hero');
}

/** True when a section type fills the about slot. */
export function isAboutSectionType(type) {
  const t = String(type || '').toLowerCase().trim();
  return t === 'about' || t === 'studio-story' || t.includes('about');
}

/** True when a section type fills the services/offer slot. */
export function isServicesSectionType(type) {
  const t = String(type || '').toLowerCase().trim();
  return ['services', 'features', 'product-grid', 'featured-products', 'product'].includes(t);
}

/** True when a section type fills the contact slot. */
export function isContactSectionType(type) {
  const t = String(type || '').toLowerCase().trim();
  return t === 'form' || t.includes('contact') || t === 'repair-intake';
}

/**
 * True when a section type is recognised — either generic, a known template
 * type, or declared by the active template's manifest (`extraTypes`).
 */
export function isKnownSectionType(type, extraTypes = []) {
  const t = String(type || '').toLowerCase().trim();
  if (!t) return false;
  if (SECTION_TYPES.includes(t) || TEMPLATE_SECTION_TYPES.includes(t)) return true;
  if (isHeroSectionType(t)) return true;
  return extraTypes.some((e) => String(e || '').toLowerCase().trim() === t);
}
