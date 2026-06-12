/**
 * templatePreviewToPlan.service.js
 *
 * Converts a template's metadata (from templateLibrary.service.js) into
 * a seed object that pre-populates a new site plan's sitemap, wireframe,
 * and style fields.
 *
 * Keeps plan creation fast by using cached template metadata.
 * Returns `{}` (empty seed) gracefully if template is unknown or loading fails.
 */

import { readTemplateMetadata } from '../../../services/templateLibrary.service.js';

/**
 * Build initial plan fields from template metadata.
 * All fields are optional — callers should deep-merge over any existing plan data.
 *
 * @param {string} templateId
 * @returns {Promise<{ sitemap?, wireframe?, style?, templateManifest? }>}
 */
export async function buildPlanSeedFromTemplate(templateId) {
  if (!templateId) return {};

  let meta;
  try {
    meta = await readTemplateMetadata(templateId);
  } catch {
    // Template not found or GitHub unreachable — plan still creates, just unseeded
    return {};
  }

  const seed = {};

  // ── templateManifest ──────────────────────────────────────────────────────
  seed.templateManifest = {
    templateId: meta.templateId || templateId,
    name: meta.name || templateId,
    category: meta.category || 'General',
    framework: meta.framework || 'vite',
    buildCommand: meta.buildCommand || 'npm run build',
    publishDirectory: meta.publishDirectory || 'dist',
    supportedPages: Array.isArray(meta.supportedPages) ? meta.supportedPages : [],
    supportedSections: Array.isArray(meta.supportedSections) ? meta.supportedSections : [],
    sectionSlotHints: meta.sectionSlotHints || {},
    placeholderHints: meta.placeholderHints || {},
    questionnaireProfile: meta.questionnaireProfile || 'general',
  };

  // ── Seed sitemap from supportedPages ─────────────────────────────────────
  const pages = normalizeSupportedPages(meta.supportedPages || []);
  if (pages.length > 0) {
    seed.sitemap = {
      name: meta.name || templateId,
      pages: pages.map((page, i) => ({
        id: `page_${templateId}_${i}`,
        name: page.name,
        path: page.path,
        purpose: page.purpose || '',
        sections: buildSectionsForPage(page.name, meta.supportedSections || [], meta.sectionSlotHints || {}),
      })),
    };
  }

  // ── Seed wireframe from sectionSlotHints ──────────────────────────────────
  // wireframe is a copy of sitemap pages enriched with contentHints from metadata
  if (seed.sitemap && Object.keys(meta.sectionSlotHints || {}).length > 0) {
    seed.wireframe = {
      pages: seed.sitemap.pages.map(page => ({
        ...page,
        sections: page.sections.map(sec => ({
          ...sec,
          contentHints: meta.sectionSlotHints[sec.type] || '',
        })),
      })),
    };
  }

  // ── Seed style from template metadata ─────────────────────────────────────
  if (meta.defaultStyle || meta.style) {
    seed.style = {
      ...(meta.defaultStyle || {}),
      ...(meta.style || {}),
      seededFromTemplate: true,
    };
  }

  return seed;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalise supportedPages — handles both string[] and {title,path,purpose}[] shapes.
 */
function normalizeSupportedPages(rawPages) {
  return rawPages.map((p, i) => {
    if (typeof p === 'string') {
      const name = p;
      return {
        name,
        path: i === 0 || name.toLowerCase() === 'home' ? '/' : `/${name.toLowerCase().replace(/\s+/g, '-')}`,
        purpose: '',
      };
    }
    return {
      name: p.title || p.name || `Page ${i + 1}`,
      path: p.path || (i === 0 ? '/' : `/${(p.title || p.name || '').toLowerCase().replace(/\s+/g, '-')}`),
      purpose: p.purpose || p.description || '',
    };
  });
}

/**
 * Map supported section types to skeleton section objects for a given page.
 * Uses sectionSlotHints keys as available section types.
 */
function buildSectionsForPage(pageName, supportedSections, sectionSlotHints) {
  // Determine which section types belong on this page
  const hintKeys = Object.keys(sectionSlotHints);
  const pool = hintKeys.length > 0 ? hintKeys : supportedSections.map(s => typeof s === 'string' ? s : s.type || s.name);

  if (pool.length === 0) return [];

  const pageKey = pageName.toLowerCase();
  const isHome = pageKey === 'home' || pageKey === 'index' || pageKey === '/';

  // Pick the relevant subset for this page
  const relevant = isHome
    ? pool // Home gets all sections
    : pool.filter(type => isSectionRelevantForPage(type, pageName));

  // Limit to 6 sections per page to keep things manageable
  return relevant.slice(0, 6).map((type, i) => ({
    id: `sec_${pageName.toLowerCase().replace(/[^a-z0-9]/g, '')}_${i}`,
    type: String(type).toLowerCase(),
    title: titleCase(type),
    description: '',
    contentHints: '',
  }));
}

function isSectionRelevantForPage(sectionType, pageName) {
  const t = String(sectionType).toLowerCase();
  const p = String(pageName).toLowerCase();

  // Always skip hero on non-home pages
  if (t === 'hero' && !['home', 'index'].includes(p)) return true; // hero can appear on any page top
  if (t === 'nav' || t === 'footer') return false; // handled by layout
  if ((t === 'services' || t === 'features') && ['services', 'features', 'home', 'solutions'].includes(p)) return true;
  if (t === 'pricing' && ['pricing', 'plans', 'home'].includes(p)) return true;
  if (t === 'gallery' && ['gallery', 'portfolio', 'home', 'work'].includes(p)) return true;
  if (t === 'faq' && ['faq', 'help', 'home', 'support'].includes(p)) return true;
  if (t === 'contact' || t === 'form') return ['contact', 'home', 'get-in-touch'].includes(p);
  if (t === 'team' && ['about', 'team', 'home'].includes(p)) return true;
  if (t === 'about' && ['about', 'home'].includes(p)) return true;
  if (t === 'cta') return true;
  return false;
}

function titleCase(value) {
  return String(value || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
