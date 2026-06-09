/**
 * sitePlanAi.stage.js — AI refinement for hybrid site plans.
 *
 * Uses the existing OpenAI integration to refine a site plan's sitemap
 * based on the client brief and selected template metadata.
 *
 * Rules enforced in the system prompt:
 *   - Refine existing plan, do NOT replace it from scratch
 *   - Preserve user manual edits
 *   - Return strict JSON only
 *   - No deployment, no HTML output, no GitHub/Render calls
 */

import OpenAI from 'openai';
import { getTemplateDetails } from '../01-TEMPLATE-LIBRARY-MOUNTAIN/templateSelection.stage.js';
import { getSitePlan } from '../store/sitePlanStore.js';

function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    const err = new Error('OPENAI_API_KEY is not configured. AI refinement requires a valid key.');
    err.status = 503;
    err.expose = true;
    throw err;
  }
  return new OpenAI({ apiKey: key });
}

function getModel() {
  return process.env.OPENAI_MODEL || 'gpt-4o-mini';
}

function uid() {
  return 'sec_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

function httpError(msg, status = 400) {
  return Object.assign(new Error(msg), { status, expose: true });
}

const SYSTEM_PROMPT = `You are RoxanneAI inside Glondia Sites — a professional website planner.

Your job is to REFINE an existing client site plan, not create one from scratch.

Rules:
- Preserve the selected template type and category.
- Preserve existing pages unless there is a strong reason to suggest a change.
- Preserve existing sections unless they are duplicate or unclear.
- Improve section titles and descriptions to be clear and specific.
- Fill empty section descriptions where useful.
- Suggest missing practical sections only when clearly needed (max 1-2 additions per page).
- Keep the plan simple enough to launch quickly.
- Return STRICT JSON only — no markdown, no code fences, no explanations outside the JSON.
- Do NOT output HTML, CSS, React code, or deployment settings.
- Do NOT call GitHub or Render.

Output shape:
{
  "summary": "One sentence describing what you changed and why.",
  "sitemap": {
    "name": "...",
    "pages": [
      {
        "id": "existing_id_or_new",
        "name": "Page Name",
        "path": "/path",
        "sections": [
          {
            "id": "existing_id_or_new",
            "title": "Section Title",
            "type": "hero|services|about|cta|form|gallery|faq|pricing|process|details|features|team",
            "description": "Clear description of what this section contains and its purpose."
          }
        ]
      }
    ]
  },
  "warnings": []
}`;

/**
 * Suggest a refined sitemap for a plan using AI.
 * @param {string} planId
 * @returns {Promise<{ summary: string, sitemap: object, warnings: string[] }>}
 */
export async function suggestSitemapForPlan(planId) {
  const plan = await getSitePlan(planId);
  if (!plan) throw httpError('Plan not found.', 404);

  // Load template metadata (fails gracefully if not found)
  let templateMeta = {};
  try {
    templateMeta = await getTemplateDetails(plan.templateId) || {};
  } catch {
    templateMeta = { templateId: plan.templateId, name: plan.templateId };
  }

  const client = getClient();
  const model = getModel();

  const userPrompt = `Selected template:
${JSON.stringify({
  templateId: templateMeta.templateId || plan.templateId,
  name: templateMeta.name || plan.templateId,
  category: templateMeta.category || 'Business',
  questionnaireProfile: templateMeta.questionnaireProfile || 'general',
  supportedPages: templateMeta.supportedPages || [],
  supportedSections: templateMeta.supportedSections || [],
}, null, 2)}

Client brief:
${JSON.stringify(plan.brief || {}, null, 2)}

Current sitemap:
${JSON.stringify(plan.sitemap || { name: 'New Website', pages: [] }, null, 2)}

Refine the sitemap above. Preserve all existing user content where possible.
Return strict JSON only.`;

  let raw = '';
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    });
    raw = response.choices[0]?.message?.content || '';
  } catch (aiErr) {
    throw httpError(`AI refinement failed: ${aiErr.message}`, 502);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw httpError('AI returned invalid JSON. Please try again.', 502);
  }

  // Ensure every section has an id
  if (parsed.sitemap?.pages) {
    parsed.sitemap.pages = parsed.sitemap.pages.map(page => ({
      ...page,
      id: page.id || uid(),
      sections: (page.sections || []).map(s => ({
        ...s,
        id: s.id || uid(),
      })),
    }));
  }

  return {
    summary: String(parsed.summary || 'Sitemap refined by RoxanneAI.'),
    sitemap: parsed.sitemap || plan.sitemap,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
  };
}
