/**
 * TemplateController
 * Returns the production HTML template catalog.
 * Template data is defined in config/templateCatalog.js — not here.
 */

import { TEMPLATES } from '../config/templateCatalog.js';

const TemplateController = {
  listTemplates: async (req, res) => {
    res.ok(TEMPLATES);
  },

  listCategories: async (req, res) => {
    res.ok([...new Set(TEMPLATES.map((t) => t.category))]);
  },

  getTemplate: async (req, res) => {
    const tpl = TEMPLATES.find((t) => t.id === req.params.templateId);
    if (!tpl) return res.status(404).json({ error: 'Template not found.' });
    res.ok(tpl);
  },

  getTemplatePreview: async (req, res) => {
    const tpl = TEMPLATES.find((t) => t.id === req.params.templateId);
    if (!tpl) return res.status(404).json({ error: 'Template not found.' });
    // Actual HTML is bundled on the frontend in src/templates/html/
    // and rendered via sandboxed iframe.
    res.ok({
      templateId:       tpl.id,
      name:             tpl.name,
      category:         tpl.category,
      tagline:          tpl.tagline,
      previewAvailable: true,
      previewType:      'html-iframe',
      note:             'Template HTML is available in the frontend bundle at contentJson.pages[n].html.',
    });
  },
};

export default TemplateController;
