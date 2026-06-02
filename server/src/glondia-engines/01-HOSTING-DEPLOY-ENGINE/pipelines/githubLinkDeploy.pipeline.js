/**
 * githubLinkDeploy.pipeline.js
 *
 * Canonical GitHub Link Deploy owner:
 * client repo -> controlled Glondiasites repo -> Render.
 *
 * The implementation remains in githubImportToRender.pipeline.js to preserve
 * existing imports and behavior.
 */
export * from './githubImportToRender.pipeline.js';
export { default } from './githubImportToRender.pipeline.js';
