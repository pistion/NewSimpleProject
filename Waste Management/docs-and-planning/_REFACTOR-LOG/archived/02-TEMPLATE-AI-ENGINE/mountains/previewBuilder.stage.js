/**
 * previewBuilder.stage.js - 06-PREVIEW-MOUNTAIN
 */

export function selectPreviewPage(site, pageIndex = 0) {
  const pages = Array.isArray(site?.pages) ? site.pages : [];
  return pages[Math.max(0, Number(pageIndex) || 0)] || pages[0] || null;
}

export async function runStage(context) {
  const page = selectPreviewPage(context.site, context.input?.page);
  context.preview = {
    html: page?.html || '',
    page,
  };
  return context;
}
