import { getTemplateSite, updateTemplateSite } from '../../store/templateSiteStore.js';
import { cloneTemplate, applyClientData } from '../../../../services/templateCopy.service.js';

function slugify(value) {
  return String(value || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site';
}

function canAccess(user, site) {
  if (user?.role === 'admin') return true;
  const owner = site?.userId || site?.ownerUserId || site?.answers?.userId || null;
  return Boolean(user?.id && owner && user.id === owner);
}

async function prepareSite(req, res, next) {
  try {
    const { siteId } = req.params;
    if (!siteId) return res.status(400).json({ error: 'siteId is required.' });

    const site = await getTemplateSite(siteId);
    if (!site) return res.status(404).json({ error: `Site "${siteId}" not found.` });
    if (!canAccess(req.user, site)) return res.status(403).json({ error: 'You do not have access to this template site.' });

    const mergedAnswers = { ...(site.answers || {}), ...(req.body?.answers || {}) };
    const userId = site.userId || req.user?.id || 'anonymous';

    const { siteDir, copied, metadata, slug, ownerUserId, githubTargetRoot } = await cloneTemplate(
      { ...site, answers: mergedAnswers },
      { ...(req.body || {}), userId },
    );

    await applyClientData(siteDir, {
      ...mergedAnswers,
      siteName: req.body?.siteName || site.siteName || mergedAnswers.businessName || metadata.name,
      businessName: mergedAnswers.businessName || site.siteName || metadata.name,
      slug,
      templateId: site.templateId,
    }, {
      site: { ...site, userId: ownerUserId },
      template: metadata,
      slug,
      targetRoot: githubTargetRoot,
      sourceReference: `templates/${site.templateId}`,
    });

    const updated = await updateTemplateSite(siteId, {
      answers: mergedAnswers,
      siteName: req.body?.siteName || site.siteName || mergedAnswers.businessName || metadata.name,
      slug: req.body?.slug ? slugify(req.body.slug) : slug,
      status: 'prepared',
      generatedSite: {
        siteDir,
        sourceType: 'template-library-generated-copy',
        framework: metadata.framework || 'vite',
        packageManager: metadata.packageManager || 'npm',
        buildCommand: metadata.buildCommand || 'npm run build',
        publishDirectory: metadata.publishDirectory || 'dist',
        templateId: site.templateId,
        files: copied,
        githubTargetRoot,
      },
      templateMetadata: metadata,
    });

    res.json(updated);
  } catch (err) { next(err); }
}

export const templateEditingController = { prepareSite };
