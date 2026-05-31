# Mountain 01 — Template Library

One job: serve the template catalog and metadata.

## Owns
- Template catalog (current: Pulse Works, Forge — hard-coded)
- Template search by category
- Template metadata: id, name, category, accent, surface, motif
- Template preview metadata (for frontend iframe)
- Future: pull from TEMPLATE_LIBRARY_REPO_URL on GitHub

## Source files (current)
- routes/template.routes.js
- controllers/template.controller.js

## Future env var
TEMPLATE_LIBRARY_REPO_URL=https://github.com/pistion/glondia-template-library
TEMPLATE_LIBRARY_BRANCH=main

## Target files (future)
- templateCatalog.stage.js      Load + expose template list
- templateSearch.stage.js       Filter by category/tag
- templateSelection.stage.js    Return selected template with HTML
- templateMetadata.stage.js     Lightweight metadata for list views
