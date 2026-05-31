/**
 * templateModifier.stage.js - 05-TEMPLATE-EDITING-MOUNTAIN
 *
 * Phase 1 applies AI output as raw HTML pages. Later phases can replace this
 * with manifest-driven field editing.
 */

export function mapTailoredPages(ai = {}, input = {}) {
  if (Array.isArray(input.tailoredPages) && input.tailoredPages.length) {
    return input.tailoredPages;
  }
  if (Array.isArray(ai.tailoredPages) && ai.tailoredPages.length) {
    return ai.tailoredPages;
  }
  if (ai.rawResponse) {
    return [{ title: 'Home', path: '/', html: ai.rawResponse }];
  }
  return [];
}

export async function runStage(context) {
  const pages = mapTailoredPages(context.ai || {}, context.input || {});
  context.source.pages = pages;
  context.source.editedHtml = pages[0]?.html || '';
  return context;
}
