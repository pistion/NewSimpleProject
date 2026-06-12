/**
 * TemplateController
 * Serves templates from the live GitHub-backed template library (templateLibrary.service.js).
 * Falls back to the static TEMPLATES catalog when the library is unavailable.
 */

import { TEMPLATES } from '../config/templateCatalog.js';
import {
  listTemplates as libListTemplates,
  getTemplate as libGetTemplate,
} from '../services/templateLibrary.service.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalize a library template to the legacy catalog shape so the frontend stays compatible. */
function toLegacyShape(t) {
  return {
    id: t.templateId || t.id,
    name: t.name,
    category: t.category || 'General',
    description: t.description || '',
    tagline: t.tagline || t.description || '',
    framework: t.framework || 'vite',
    buildCommand: t.buildCommand || 'npm run build',
    publishDirectory: t.publishDirectory || 'dist',
    previewImage: t.previewImage || '',
    previewUrl: t.previewUrl || '',
    questionnaireProfile: t.questionnaireProfile || 'general',
    supportedPages: Array.isArray(t.supportedPages) ? t.supportedPages : [],
    supportedSections: Array.isArray(t.supportedSections) ? t.supportedSections : [],
    sectionSlotHints: t.sectionSlotHints || {},
    placeholderHints: t.placeholderHints || {},
    // Legacy HTML template fields — preserve if present
    templateType: t.templateType || (t.framework === 'html' ? 'html' : 'repo'),
    contentJson: t.contentJson || null,
  };
}

// ── Controller ────────────────────────────────────────────────────────────────

const TemplateController = {
  listTemplates: async (req, res) => {
    try {
      const { templates } = await libListTemplates();
      if (templates && templates.length > 0) {
        return res.ok(templates.map(toLegacyShape));
      }
    } catch {
      // Fall through to static catalog
    }
    res.ok(TEMPLATES);
  },

  listCategories: async (req, res) => {
    try {
      const { templates } = await libListTemplates();
      if (templates && templates.length > 0) {
        const cats = [...new Set(templates.map(t => t.category || 'General').filter(Boolean))];
        return res.ok(cats);
      }
    } catch {
      // Fall through to static catalog
    }
    res.ok([...new Set(TEMPLATES.map((t) => t.category))]);
  },

  getTemplate: async (req, res) => {
    const { templateId } = req.params;
    try {
      const t = await libGetTemplate(templateId);
      if (t) return res.ok(toLegacyShape(t));
    } catch {
      // Fall through to static catalog
    }
    const tpl = TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return res.status(404).json({ error: 'Template not found.' });
    res.ok(tpl);
  },

  getTemplatePreview: async (req, res) => {
    const { templateId } = req.params;
    let t = null;

    try {
      t = await libGetTemplate(templateId);
    } catch {
      t = TEMPLATES.find((tpl) => tpl.id === templateId) || null;
    }

    if (!t) return res.status(404).json({ error: 'Template not found.' });

    res.ok({
      templateId:       t.templateId || t.id,
      name:             t.name,
      category:         t.category,
      tagline:          t.tagline || t.description || '',
      previewAvailable: true,
      previewType:      (t.framework === 'html' || t.templateType === 'html') ? 'html-iframe' : 'preview-url',
      previewUrl:       t.previewUrl || '',
      note:             'Template HTML is available in the frontend bundle at contentJson.pages[n].html.',
    });
  },
};

export default TemplateController;
