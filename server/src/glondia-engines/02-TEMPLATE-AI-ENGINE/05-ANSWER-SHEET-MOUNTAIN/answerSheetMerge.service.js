/**
 * answerSheetMerge.service.js
 *
 * Maps structured answer-sheet data back into the existing flat `answers`
 * object so current template preparation functions keep working without change.
 *
 * Also produces dotted-path flat keys for use by buildReplacementMap().
 */

/**
 * Convert a structured answer sheet to the flat `answers` object expected
 * by prepareTemplateGeneratedSource / applyQuestionnaireDataToGeneratedSource.
 */
export function mapAnswerSheetToTemplateAnswers(answerSheet = {}) {
  const b = answerSheet.business || {};
  const brand = answerSheet.brand || {};
  const contact = answerSheet.contact || {};
  const seo = answerSheet.seo || {};
  const pages = Array.isArray(answerSheet.pages) ? answerSheet.pages : [];

  // Extract hero section content from the first hero found
  const allSections = pages.flatMap((p) => Array.isArray(p.sections) ? p.sections : []);
  const hero = allSections.find((s) => s.type === 'hero') || {};
  const about = allSections.find((s) => s.type === 'about') || {};
  const services = allSections.find((s) => s.type === 'services') || {};
  const contactSection = allSections.find((s) => s.type === 'contact') || {};

  return {
    // Core business fields
    businessName: b.name || '',
    industry: b.industry || '',
    location: b.location || '',
    description: b.description || '',
    targetAudience: b.targetAudience || '',
    offer: b.offer || '',
    uniqueSellingPoint: b.uniqueSellingPoint || '',
    goals: b.goals || '',

    // Brand
    brandTone: brand.tone || '',
    tone: brand.tone || '',
    colors: brand.colors || '',
    stylePreferences: brand.stylePreferences || '',

    // Pages (flat summary for legacy templates)
    pages: pages.map((p) => p.name).filter(Boolean).join(', '),

    // Contact
    contact: contact.primaryAction || contact.phone || contact.email || '',
    phone: contact.phone || '',
    email: contact.email || '',
    whatsapp: contact.whatsapp || '',
    address: contact.address || '',
    socialLinks: Array.isArray(contact.socialLinks) ? contact.socialLinks.join(', ') : '',
    domainPreference: '',

    // SEO
    seoTitle: seo.title || '',
    seoDescription: seo.description || '',
    seoKeywords: Array.isArray(seo.keywords) ? seo.keywords.join(', ') : (seo.keywords || ''),

    // Notes
    notes: answerSheet.notes || '',

    // Structured data (for advanced replacement)
    sitemap: { pages },
    wireframe: { pages },
    answerSheet,

    // Template section placeholders
    heroTitle: hero.title || b.name || '',
    heroSubtitle: hero.content || b.description || '',
    heroCta: hero.ctaText || contact.primaryAction || '',
    aboutTitle: about.title || `About ${b.name || 'Us'}`,
    aboutText: about.content || b.description || '',
    servicesTitle: services.title || 'Our Services',
    servicesText: services.content || b.offer || '',
    contactTitle: contactSection.title || 'Contact Us',
    contactText: contactSection.content || contact.primaryAction || '',
  };
}

/**
 * Flatten a structured answer sheet to dotted-path keys.
 * e.g. { 'business.name': 'Acme', 'brand.tone': 'professional', ... }
 * Used by buildReplacementMap() for nested placeholder support.
 */
export function flattenAnswerSheet(answerSheet = {}) {
  const result = {};

  function walk(obj, prefix) {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (Array.isArray(value)) {
        result[path] = value.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''))).join(', ');
      } else if (value !== null && typeof value === 'object') {
        walk(value, path);
      } else {
        result[path] = String(value ?? '');
      }
    }
  }

  walk(answerSheet, '');

  // Also add convenient first-section aliases
  const pages = Array.isArray(answerSheet.pages) ? answerSheet.pages : [];
  const allSections = pages.flatMap((p) => Array.isArray(p.sections) ? p.sections : []);
  const hero = allSections.find((s) => s.type === 'hero') || {};
  const about = allSections.find((s) => s.type === 'about') || {};

  result['hero.title'] = hero.title || '';
  result['hero.content'] = hero.content || '';
  result['hero.ctaText'] = hero.ctaText || '';
  result['about.title'] = about.title || '';
  result['about.content'] = about.content || '';

  return result;
}

/**
 * Merge answer-sheet flat answers into an existing flat answers object.
 * Answer-sheet values take precedence over weak/empty existing values.
 */
export function mergeAnswerSheetIntoAnswers(existingAnswers = {}, answerSheet = {}) {
  const fromSheet = mapAnswerSheetToTemplateAnswers(answerSheet);
  const result = { ...existingAnswers };
  for (const [key, value] of Object.entries(fromSheet)) {
    const existing = existingAnswers[key];
    const isWeak = existing === null || existing === undefined || existing === '';
    if (isWeak && value !== '') {
      result[key] = value;
    }
  }
  // Always set answerSheet reference
  result.answerSheet = answerSheet;
  return result;
}
