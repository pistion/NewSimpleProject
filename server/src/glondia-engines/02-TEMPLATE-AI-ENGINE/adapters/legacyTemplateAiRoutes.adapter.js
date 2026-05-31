/**
 * legacyTemplateAiRoutes.adapter.js
 *
 * Keeps /api/template-ai/* working while templateAi.routes.js is being built.
 * Once migrated, server.js will point to templateAi.routes.js directly.
 */

export { default } from '../../../routes/template-ai.routes.js';
