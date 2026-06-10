import { getTemplateSite, updateTemplateSite } from '../../store/templateSiteStore.js';
import { runDeployStage } from './deploy.stage.js';
import { getSitePlan, updateSitePlan } from '../../store/sitePlanStore.js';
import { packageSite } from '../../../../services/sitePackager.service.js';
import { run as runGeneratedSiteToRender } from '../../../01-HOSTING-DEPLOY-ENGINE/pipelines/generatedSiteToRender.pipeline.js';
import { buildGeneratedTemplateTargetRoot } from '../../../../services/templateCopy.service.js';

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

    // Stage: pre-flight checks + GitHub push + Render handoff
    const stageResult = await runDeployStage({
      siteDir: generatedSite.siteDir,
      siteId,
      userId: ownerUserId,
      siteName: finalSiteName,
      slug: finalSlug,
      templateId: site.templateId,
      framework: generatedSite.framework,
      packageManager: generatedSite.packageManager,
      buildCommand: generatedSite.buildCommand || options.buildCommand || 'npm run build',
      publishDirectory: generatedSite.publishDirectory || options.publishDirectory || 'dist',
      rootDirectory: githubTargetRoot,
      repoUrl: options.repoUrl || options.repositoryUrl || process.env.RENDER_GENERATED_SITES_REPO_URL || process.env.GENERATED_SITES_REPO_URL,
      branch: options.branch || 'main',
    });

    // Hand off to existing 01-HOSTING-DEPLOY-ENGINE
    const deployment = await runGeneratedSiteToRender({
      ...options,
      generatedSite: { ...generatedSite, ...stageResult },
      siteName: finalSiteName,
      slug: finalSlug,
      source: 'template',
      sourceReference: `templates/${site.templateId}`,
    }, { userId: ownerUserId });

    await updateTemplateSite(siteId, {
      status: deployment?.status || 'ready_for_hosting',
      deploymentId: deployment?.deploymentId || deployment?.id || null,
      generatedSite: { ...generatedSite, ...stageResult },
      render: deployment?.render || null,
      deploymentSettings: {
        repoUrl: deployment?.repoUrl || options.repoUrl || null,
        rootDirectory: githubTargetRoot,
        buildCommand: generatedSite.buildCommand || options.buildCommand || 'npm run build',
        publishDirectory: generatedSite.publishDirectory || options.publishDirectory || 'dist',
        branch: options.branch || 'main',
      },
    });

    res.json({
      ...(deployment || {}),
      siteId,
      templateId: site.templateId,
      stageResult,
      message: deployment?.render?.attempted
        ? 'Generated site staged, pushed to GitHub, and Render deployment started.'
        : 'Generated site staged and pushed to GitHub. Check Hosting logs for Render configuration.',
    });
  } catch (err) { next(err); }
}

async function handoffPlan(req, res, next) {
  try {
    const { planId } = req.params;
    const plan = await getSitePlan(planId);
    if (!plan) return res.status(404).json({ error: 'Plan not found.' });

    const userId = req.user?.id || plan.userId || null;
    const ownerUserId = userId || 'anonymous';
    const finalSiteName = plan.brief?.businessName || plan.sitemap?.name || planId;
    const finalSlug = slugify(plan.brief?.businessName || planId);

    // Hand off to existing 01-HOSTING-DEPLOY-ENGINE
    const deployment = await runGeneratedSiteToRender({
      ...(req.body || {}),
      siteName: finalSiteName,
      slug: finalSlug,
      source: 'site-plan',
      sourceReference: `plans/${planId}`,
      planId,
      brief: plan.brief,
      sitemap: plan.sitemap,
      templateId: plan.templateId,
    }, { userId: ownerUserId });

    await updateSitePlan(planId, {
      status: 'handed_off',
      deploymentId: deployment?.deploymentId || deployment?.id || null,
      siteId: deployment?.siteId || null,
      handedOffAt: new Date().toISOString(),
    });

    res.json({
      ...(deployment || {}),
      planId,
      message: 'Site plan handed off to deployment engine.',
      deploymentSettings: {
        repoUrl: deployment?.repoUrl || null,
        readOnly: true,
      },
    });
  } catch (err) { next(err); }
}

export const handoffDeployController = { packageSite: packageSiteHandler, deploySite, handoffPlan };
