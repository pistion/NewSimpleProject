import { makeId } from '../../../../services/hostingStore.js';
import { createTemplateSite, getTemplateSite, updateTemplateSite } from '../../store/templateSiteStore.js';
import { cloneTemplate, applyClientData } from '../../../../services/templateCopy.service.js';

function slugify(value) {
  return String(value || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site';
}

function canAccess(user, site) {
  if (user?.role === 'admin') return true;
  const owner = site?.userId || site?.ownerUserId || site?.answers?.userId || null;
  return Boolean(user?.id && owner && user.id === owner);
}

async function createSite(req, res, next) {
  try {
    const { templateId, answers, tailoredPages, siteName, slug } = req.body || {};
    if (!templateId || typeof templateId !== 'string') {
      return res.status(400).json({ error: 'templateId is required.' });
    }
    if (templateId.length > 100) return res.status(400).json({ error: 'templateId is too long.' });
    if (answers !== undefined && (typeof answers !== 'object' || Array.isArray(answers))) {
      return res.status(400).json({ error: 'answers must be an object.' });
    }
    if (tailoredPages !== undefined && !Array.isArray(tailoredPages)) {
      return res.status(400).json({ error: 'tailoredPages must be an array.' });
    }

    const ownerUserId = req.user?.id || null;
    const site = await createTemplateSite({
      templateId,
      answers: { ...(answers || {}), userId: ownerUserId },
      tailoredPages: tailoredPages || [],
      userId: ownerUserId,
      ownerUserId,
    });

    const updates = {};
    if (siteName) updates.siteName = String(siteName).slice(0, 140);
    if (slug) updates.slug = slugify(slug);
    const finalSite = Object.keys(updates).length ? await updateTemplateSite(site.siteId, updates) : site;

    res.status(201).json({
      siteId: finalSite.siteId,
      templateId: finalSite.templateId,
      answers: finalSite.answers,
      pages: finalSite.pages,
      status: finalSite.status,
      siteName: finalSite.siteName,
      slug: finalSite.slug,
      createdAt: finalSite.createdAt,
    });
  } catch (err) { next(err); }
}

async function getSite(req, res, next) {
  try {
    const site = await getTemplateSite(req.params.siteId);
    if (!site) return res.status(404).json({ error: `Site "${req.params.siteId}" not found.` });
    if (!canAccess(req.user, site)) return res.status(403).json({ error: 'You do not have access to this template site.' });
    res.json(site);
  } catch (err) { next(err); }
}

export const templateSourceController = { createSite, getSite };
