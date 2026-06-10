import { getTemplateSite, updateTemplateSite } from '../../store/templateSiteStore.js';
// getSitePlan not needed here — handoffPlan delegates to sitePlanHandoffController
import { packageSite } from '../../../../services/sitePackager.service.js';
import { run as runGeneratedSiteToRender } from '../../../01-HOSTING-DEPLOY-ENGINE/pipelines/generatedSiteToRender.pipeline.js';
import { buildGeneratedTemplateTargetRoot } from '../../../../services/templateCopy.service.js';
import { sitePlanHandoffController } from '../../controllers/sitePlanHandoff.controller.js';

function slugify(value) {
  return String(value || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site';
}

function canAccess(user, site) {
  if (user?.role === 'admin') return true;
  const owner = site?.userId || site?.ownerUserId || site?.answers?.userId || null;
  return Boolean(user?.id && owner && user.id === owner);
}

async function packageSiteHandler(req, res, next) {
  try {
    const { siteId } = req.params;
    if (!siteId) return res.status(400).json({ error: 'siteId is required.' });

    const site = await getTemplateSite(siteId);
    if (!site) return res.status(404).json({ error: `Site "${siteId}" not found.` });
    if (!canAccess(req.user, site)) return res.status(403).json({ error: 'You do not have access to this template site.' });

    const options = { ...(req.body || {}), userId: site.userId || req.user?.id };
    const result = await packageSite(site, options);

    await updateTemplateSite(siteId, {
      status: 'ready_for_hosting',
      generatedSite: result,
    });

    res.json(result);
  } catch (err) { next(err); }
}

async function deploySite(req, res, next) {
  try {
    const { siteId } = req.params;
    if (!siteId) return res.status(400).json({ error: 'siteId is required.' });

    const site = await getTemplateSite(siteId);
    if (!site) return res.status(404).json({ error: `Site "${siteId}" not found.` });
    if (!canAccess(req.user, site)) return res.status(403).json({ error: 'You do not have access to this template site.' });

    const options = { ...(req.body || {}), userId: site.userId || req.user?.id };
    const finalSiteName = options.siteName || site.answers?.businessName || site.templateId;
    const finalSlug = slugify(options.slug || finalSiteName || site.siteId);
    const ownerUserId = options.userId || 'anonymous';
    const githubTargetRoot = buildGeneratedTemplateTargetRoot({ userId: ownerUserId, siteId, slug: finalSlug });

    let generatedSite = site.generatedSite;
    if (!generatedSite?.siteDir) {
      generatedSite = await packageSite(site, { ...options, siteName: finalSiteName, slug: finalSlug });
    }

    // 01-HOSTING-DEPLOY-ENGINE owns GitHub publish + Render handoff (no pre-publish here).
    const deployment = await runGeneratedSiteToRender({
      ...options,
      siteId,
      templateId: site.templateId,
      generatedSite,
      siteName: finalSiteName,
      slug: finalSlug,
      source: 'template',
      sourceReference: `templates/${site.templateId}`,
      rootDirectory: generatedSite.githubTargetRoot || githubTargetRoot,
      buildCommand: generatedSite.buildCommand || options.buildCommand || 'npm run build',
      publishDirectory: generatedSite.publishDirectory || options.publishDirectory || 'dist',
      framework: generatedSite.framework,
      repoUrl: options.repoUrl || options.repositoryUrl || process.env.RENDER_GENERATED_SITES_REPO_URL || process.env.GENERATED_SITES_REPO_URL,
      branch: options.branch || 'main',
    }, { userId: ownerUserId });

    await updateTemplateSite(siteId, {
      status: deployment?.status || 'ready_for_hosting',
      deploymentId: deployment?.deploymentId || deployment?.id || null,
      generatedSite: deployment?.generatedSite || generatedSite,
      render: deployment?.render || null,
      deploymentSettings: {
        repoUrl: deployment?.repoUrl || options.repoUrl || null,
        rootDirectory: deployment?.environmentConfiguration?.rootDirectory || generatedSite.githubTargetRoot || githubTargetRoot,
        buildCommand: generatedSite.buildCommand || options.buildCommand || 'npm run build',
        publishDirectory: generatedSite.publishDirectory || options.publishDirectory || 'dist',
        branch: options.branch || 'main',
      },
    });

    res.json({
      ...(deployment || {}),
      siteId,
      templateId: site.templateId,
      message: deployment?.render?.attempted
        ? 'Generated site published to GitHub and Render deployment started.'
        : 'Generated site ready. Check Hosting logs for Render configuration.',
    });
  } catch (err) { next(err); }
}

// Delegate to the central answer-sheet handoff controller.
// That controller runs: plan → answer sheet → AI completion → validation →
// template source → generatedSite.siteDir → runGeneratedSiteToRender.
async function handoffPlan(req, res, next) {
  return sitePlanHandoffController.handoffPlan(req, res, next);
}

export const handoffDeployController = { packageSite: packageSiteHandler, deploySite, handoffPlan };
