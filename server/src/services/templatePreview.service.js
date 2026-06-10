/**
 * templatePreview.service.js
 * Preview page selection for Step 06.
 */

export function selectPreviewPage(site, pageIndex = 0) {
  const pages = Array.isArray(site?.pages) ? site.pages : [];
  return pages[Math.max(0, Number(pageIndex) || 0)] || pages[0] || null;
}

export function buildPreview(site, pageIndex = 0) {
  const page = selectPreviewPage(site, pageIndex);
  return {
    html: page?.html || '',
    page,
    totalPages: Array.isArray(site?.pages) ? site.pages.length : 0,
  };
}
