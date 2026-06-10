import { getTemplateSite } from '../../store/templateSiteStore.js';
import { buildPreview } from '../../../../services/templatePreview.service.js';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

async function previewSite(req, res, next) {
  try {
    const { siteId } = req.params;
    const site = await getTemplateSite(siteId);
    if (!site) {
      return res.status(404).send('<!doctype html><html><body><h1>Preview not found</h1></body></html>');
    }

    const pageIndex = Math.max(0, Number(req.query.page || 0) || 0);
    const preview = buildPreview(site, pageIndex);

    if (!preview.html && site.generatedSite?.siteDir) {
      const indexPath = join(site.generatedSite.siteDir, 'index.html');
      if (existsSync(indexPath)) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        return res.send(await readFile(indexPath, 'utf8'));
      }
    }

    if (!preview.html) {
      return res.status(404).send('<!doctype html><html><body><h1>No generated preview available</h1></body></html>');
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(preview.html);
  } catch (err) { next(err); }
}

export const previewController = { previewSite };
