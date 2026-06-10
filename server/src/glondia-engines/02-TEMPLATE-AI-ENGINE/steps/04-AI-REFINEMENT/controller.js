import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tailorTemplate } from '../../../../services/openaiTemplateAssistant.service.js';
import { getTemplateSite, updateTemplateSite } from '../../store/templateSiteStore.js';
import { cloneTemplate, applyClientData, buildGeneratedTemplateTargetRoot } from '../../../../services/templateCopy.service.js';
import { buildBriefFromAnswers } from '../../../../services/clientBrief.service.js';
import { mergeAnswerSheetIntoAnswers } from '../../05-ANSWER-SHEET-MOUNTAIN/answerSheetMerge.service.js';
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
  // Legacy ZIP tailoring — only used when explicitly requested.
  if (req.body?.allowLegacyZipAiEdit === true) {
    return aiEditSiteLegacyZip(req, res, next);
  }

  try {
    const { siteId } = req.params;
    if (!siteId) return res.status(400).json({ error: 'siteId is required.' });

    let site = await getTemplateSite(siteId);
    if (!site) return res.status(404).json({ error: `Site "${siteId}" not found.` });
    if (!canAccess(req.user, site)) return res.status(403).json({ error: 'You do not have access to this template site.' });

    let answers = { ...(site.answers || {}), ...(req.body?.answers || {}) };

    // Merge answer sheet if provided in body or already stored in answers
    if (req.body?.answerSheet && typeof req.body.answerSheet === 'object') {
      answers = mergeAnswerSheetIntoAnswers(answers, req.body.answerSheet);
    } else if (answers.answerSheet && typeof answers.answerSheet === 'object') {
      answers = mergeAnswerSheetIntoAnswers(answers, answers.answerSheet);
    }

    let generatedSite = site.generatedSite;

    // If no generated source exists yet, clone the template first.
    if (!generatedSite?.siteDir) {
      const cloned = await cloneTemplate(
        { ...site, answers },
        { ...(req.body || {}), userId: site.userId || req.user?.id || 'anonymous' },
      );

      generatedSite = {
        siteDir: cloned.siteDir,
        sourceType: 'template-library-generated-copy',
        framework: cloned.metadata.framework || 'vite',
        packageManager: cloned.metadata.packageManager || 'npm',
        buildCommand: cloned.metadata.buildCommand || 'npm run build',
        publishDirectory: cloned.metadata.publishDirectory || 'dist',
        templateId: site.templateId,
        files: cloned.copied,
        githubTargetRoot: cloned.githubTargetRoot,
        templateMetadata: cloned.metadata,
      };

      site = await updateTemplateSite(siteId, {
        generatedSite,
        templateMetadata: cloned.metadata,
        status: 'prepared',
      });
    }

    const slug = site.slug || answers.slug || answers.businessName || siteId;

    await applyClientData(generatedSite.siteDir, answers, {
      site,
      template: site.templateMetadata || generatedSite.templateMetadata || {},
      slug,
      targetRoot: generatedSite.githubTargetRoot || buildGeneratedTemplateTargetRoot({
        userId: site.userId || req.user?.id,
        siteId,
        slug,
      }),
      sourceReference: `templates/${site.templateId}`,
    });

    const indexPath = join(generatedSite.siteDir, 'index.html');
    const html = existsSync(indexPath) ? await readFile(indexPath, 'utf8') : '';

    const updated = await updateTemplateSite(siteId, {
      answers,
      status: 'ai_edited',
      pages: html ? [{ title: 'Home', path: '/', html }] : site.pages || [],
      generatedSite: {
        ...generatedSite,
        pages: html ? [{ title: 'Home', path: '/', html }] : generatedSite.pages || [],
        aiEdit: {
          mode: 'answer_sheet_template_copy',
          editedAt: new Date().toISOString(),
        },
      },
    });

    return res.json(updated);
  } catch (err) { next(err); }
}

// Legacy: ZIP tailoring via AI — bypasses generated-source flow.
// Only runs when req.body.allowLegacyZipAiEdit === true.
async function aiEditSiteLegacyZip(req, res, next) {
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
