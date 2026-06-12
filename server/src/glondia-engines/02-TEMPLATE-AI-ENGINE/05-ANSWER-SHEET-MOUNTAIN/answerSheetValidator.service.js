/**
 * answerSheetValidator.service.js
 *
 * Validates a completed answer sheet against required fields and
 * produces warnings for recommended-but-not-blocking fields.
 *
 * Returns { valid, missing, warnings, errors }
 * Deployment is blocked only when missing.length > 0.
 */

import {
  isHeroSectionType,
  isAboutSectionType,
  isServicesSectionType,
  isContactSectionType,
} from './answerSheet.schema.js';

export function validateAnswerSheet(answerSheet = {}) {
  const missing = [];
  const warnings = [];
  const errors = [];

  // ── Required fields ───────────────────────────────────────────────────────

  if (!str(answerSheet.business?.name)) {
    missing.push({ path: 'business.name', message: 'Business name is required.' });
  }
  if (!str(answerSheet.business?.industry)) {
    missing.push({ path: 'business.industry', message: 'Industry is required.' });
  }
  if (!str(answerSheet.business?.description)) {
    missing.push({ path: 'business.description', message: 'Business description is required.' });
  }

  const pages = Array.isArray(answerSheet.pages) ? answerSheet.pages : [];
  if (pages.length === 0) {
    missing.push({ path: 'pages', message: 'At least one page is required.' });
  }

  const allSections = pages.flatMap((p) => Array.isArray(p.sections) ? p.sections : []);
  // Template-specific hero variants (technical-hero, hero-banner, …) count.
  const hasHero = allSections.some((s) => isHeroSectionType(s.type));
  if (pages.length > 0 && !hasHero) {
    missing.push({ path: 'pages[].sections[].type', message: 'At least one hero section is required.' });
  }

  const contact = answerSheet.contact || {};
  const hasContactAction = str(contact.primaryAction) || str(contact.phone) || str(contact.email) || str(contact.whatsapp);
  if (!hasContactAction) {
    missing.push({
      path: 'contact.primaryAction',
      message: 'At least one contact method (primaryAction, phone, email, or whatsapp) is required.',
    });
  }

  // ── Warnings (recommended but not blocking) ───────────────────────────────

  if (!str(answerSheet.seo?.title)) {
    warnings.push({ path: 'seo.title', message: 'SEO title is missing — search visibility will be low.' });
  }
  if (!str(answerSheet.seo?.description)) {
    warnings.push({ path: 'seo.description', message: 'SEO description is missing.' });
  }

  const hasServiceOrAbout = allSections.some((s) => isServicesSectionType(s.type) || isAboutSectionType(s.type));
  if (pages.length > 0 && !hasServiceOrAbout) {
    warnings.push({ path: 'pages[].sections', message: 'No services or about section found — consider adding one.' });
  }

  const hasContactSection = allSections.some((s) => isContactSectionType(s.type));
  if (pages.length > 0 && !hasContactSection) {
    warnings.push({ path: 'pages[].sections', message: 'No contact section found on any page.' });
  }

  if (!str(answerSheet.brand?.tone)) {
    warnings.push({ path: 'brand.tone', message: 'Brand tone is missing — AI content quality will be lower.' });
  }
  if (!str(answerSheet.brand?.colors)) {
    warnings.push({ path: 'brand.colors', message: 'Brand colors are missing.' });
  }
  if (!str(answerSheet.business?.location)) {
    warnings.push({ path: 'business.location', message: 'Business location is missing.' });
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
    errors,
  };
}

function str(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
