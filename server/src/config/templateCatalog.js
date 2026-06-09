/**
 * templateCatalog.js
 *
 * Static catalog of production HTML templates available in the builder.
 * Data lives here (config layer) rather than in the controller so it can be
 * imported by other services (e.g. AI engines, site plan preview) without
 * pulling in Express context.
 */

export const TEMPLATES = [
  {
    id:             'pulse-works',
    name:           'Pulse Works',
    category:       'Fashion',
    tagline:        'Drop-based streetwear. No restocks, ever.',
    accent:         '#ff3a17',
    surface:        '#0e0d0c',
    motif:          'html-dark',
    isHtmlTemplate: true,
  },
  {
    id:             'forge',
    name:           'Forge',
    category:       'Outdoor',
    tagline:        'Work-worthy gear. Built for the tenth season.',
    accent:         '#d4ff3a',
    surface:        '#111210',
    motif:          'html-dark',
    isHtmlTemplate: true,
  },
];

export default TEMPLATES;
