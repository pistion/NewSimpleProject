import { tailorTemplate } from '../../../../services/openaiTemplateAssistant.service.js';
import { getTemplateSite, updateTemplateSite } from '../../store/templateSiteStore.js';
import { cloneTemplate, applyClientData, buildGeneratedTemplateTargetRoot } from '../../../../services/templateCopy.service.js';
import { buildBriefFromAnswers } from '../../../../services/clientBrief.service.js';
import AdmZip from 'adm-zip';

function canAccess(user, site) {
  if (user?.role === 'admin') return true;
  const owner = site?.userId || site?.ownerUserId || site?.answers?.userId || null;
  return Boolean(user?.id && owner && user.id === owner);
}

async function generate(req, res, next) {
  try {
    const { templateId, answers } = req.body || {};

    const clientJson = buildBriefFromAnswers(answers || {});
    const resultZip = await tailorTemplate(templateId, clientJson);

    res.json({
      templateId,
      summary: `AI tailoring complete for ${clientJson.businessName || 'your business'}`,
      resultZipBase64: resultZip.toString('base64'),
    });
  } catch (err) { next(err); }
}

async function aiEditSite(req, res, next) {
  try {
    const { siteId } = req.params;
    if (!siteId) return res.status(400).json({ error: 'siteId is required.' });

    const site = await getTemplateSite(siteId);
    if (!site) return res.status(404).json({ error: `Site "${siteId}" not found.` });
    if (!canAccess(req.user, site)) return res.status(403).json({ error: 'You do not have access to this template site.' });

    const answers = { ...(site.answers || {}), ...(req.body?.answers || {}) };
    const clientJson = buildBriefFromAnswers(answers);

    const resultZip = await tailorTemplate(site.templateId, clientJson);

    const zip = new AdmZip(resultZip);
    const entries = zip.getEntries();
    const pages = [];

    for (const entry of entries) {
      if (!entry.isDirectory && entry.entryName.endsWith('.html')) {
        const html = entry.getData().toString('utf8');
        const title = entry.entryName.replace(/^\//, '').replace(/\.html$/, '') || 'Home';
        const path = '/' + (title.toLowerCase() === 'index' ? '' : title.toLowerCase());
        pages.push({ title: title === 'index' ? 'Home' : title, path, html });
      }
    }

    const updated = await updateTemplateSite(siteId, {
      answers,
      status: 'ai_edited',
      pages,
    });

    res.json(updated);
  } catch (err) { next(err); }
}

export const aiRefinementController = { generate, aiEditSite };
