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
