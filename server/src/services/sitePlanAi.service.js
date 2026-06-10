/**
 * sitePlanAi.service.js
 * AI refinement for hybrid site plans — Step 03 (site plan path).
 * Uses chat.completions + response_format json_object.
 */

import OpenAI from 'openai';
import { getTemplate } from './templateLibrary.service.js';
import { getSitePlan } from '../glondia-engines/02-TEMPLATE-AI-ENGINE/store/sitePlanStore.js';

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

export async function suggestSitemapForPlan(planId) {
  const plan = await getSitePlan(planId);
  if (!plan) throw httpError('Plan not found.', 404);

  let templateMeta = {};
  try {
    templateMeta = await getTemplate(plan.templateId) || {};
  } catch {
    templateMeta = { templateId: plan.templateId, name: plan.templateId };
  }

  const client = getClient();

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
      model: getModel(),
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
  try { parsed = JSON.parse(raw); } catch { throw httpError('AI returned invalid JSON. Please try again.', 502); }

  if (parsed.sitemap?.pages) {
    parsed.sitemap.pages = parsed.sitemap.pages.map(page => ({
      ...page,
      id: page.id || uid(),
      sections: (page.sections || []).map(s => ({ ...s, id: s.id || uid() })),
    }));
  }

  return {
    summary: String(parsed.summary || 'Sitemap refined by RoxanneAI.'),
    sitemap: parsed.sitemap || plan.sitemap,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
  };
}

export async function autofillBrief(planId) {
  const plan = await getSitePlan(planId);
  if (!plan) throw httpError('Plan not found.', 404);

  const brief = plan.brief || {};
  const emptyFields = [
    'tagline', 'description', 'targetAudience', 'tone',
    'uniqueSellingPoint', 'goals', 'location', 'competitors',
  ].filter(k => !brief[k] || String(brief[k]).trim() === '');

  if (emptyFields.length === 0) {
    return { suggestions: {}, summary: 'All brief fields are already filled.' };
  }

  const client = getClient();

  const userPrompt = `Business name: "${brief.businessName || 'Unknown'}"
Industry: "${brief.industry || 'General Business'}"
Existing brief data: ${JSON.stringify(brief, null, 2)}

Suggest concise, professional values for these currently empty fields: ${emptyFields.join(', ')}.

Return strict JSON only:
{
  "suggestions": {
    ${emptyFields.map(f => `"${f}": "..."`).join(',\n    ')}
  },
  "summary": "One sentence describing what you filled in."
}`;

  let raw = '';
  try {
    const response = await client.chat.completions.create({
      model: getModel(),
      messages: [
        { role: 'system', content: 'You are RoxanneAI, a professional website content strategist. Return strict JSON only. No markdown, no code fences.' },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });
    raw = response.choices[0]?.message?.content || '';
  } catch (aiErr) {
    throw httpError(`AI autofill failed: ${aiErr.message}`, 502);
  }

  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw httpError('AI returned invalid JSON.', 502); }

  const safe = {};
  for (const k of emptyFields) {
    if (parsed.suggestions?.[k]) safe[k] = parsed.suggestions[k];
  }

  return {
    suggestions: safe,
    summary: String(parsed.summary || 'Brief fields suggested by RoxanneAI.'),
  };
}

export async function suggestSectionsForPage(planId, pageId) {
  const plan = await getSitePlan(planId);
  if (!plan) throw httpError('Plan not found.', 404);

  const page = (plan.sitemap?.pages || []).find(p => p.id === pageId);
  if (!page) throw httpError('Page not found in plan.', 404);

  const client = getClient();

  const userPrompt = `Website brief:
${JSON.stringify(plan.brief || {}, null, 2)}

Page: "${page.name}" (path: ${page.path})
Current sections:
${JSON.stringify(page.sections || [], null, 2)}

Task:
1. Keep all existing sections — do NOT remove any.
2. Improve the title and description of any section that is vague or generic.
3. Add a "contentHints" field to each section (1-2 sentences describing the specific copy, images, or data to place here).
4. If a clearly essential section is missing for this page type, add it (max 1-2 new sections).
5. Preserve all existing section IDs exactly.

Return strict JSON only:
{
  "sections": [
    {
      "id": "existing_id",
      "title": "Section Title",
      "type": "hero|services|about|cta|form|gallery|faq|pricing|process|details|features|team",
      "description": "What this section is about.",
      "contentHints": "Specific guidance: what text, images, or data goes here."
    }
  ],
  "summary": "One sentence describing changes made."
}`;

  let raw = '';
  try {
    const response = await client.chat.completions.create({
      model: getModel(),
      messages: [
        { role: 'system', content: 'You are RoxanneAI, a professional website planner. Return strict JSON only. Preserve all existing section IDs exactly.' },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });
    raw = response.choices[0]?.message?.content || '';
  } catch (aiErr) {
    throw httpError(`AI section suggestion failed: ${aiErr.message}`, 502);
  }

  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw httpError('AI returned invalid JSON.', 502); }

  const sections = (parsed.sections || page.sections || []).map(s => ({ ...s, id: s.id || uid() }));

  return {
    pageId,
    sections,
    summary: String(parsed.summary || 'Sections refined by RoxanneAI.'),
  };
}

export async function suggestWireframe(planId) {
  const plan = await getSitePlan(planId);
  if (!plan) throw httpError('Plan not found.', 404);

  const pages = plan.sitemap?.pages || [];
  if (pages.length === 0) throw httpError('No pages in this plan yet.', 400);

  const client = getClient();

  const userPrompt = `Website brief:
${JSON.stringify(plan.brief || {}, null, 2)}

Current sitemap with all pages and sections:
${JSON.stringify(pages, null, 2)}

Task:
For every section on every page, add:
- "contentHints": 1-2 sentences describing the actual copy/images/data to place in this section.
- "layoutNotes": optional short note about layout preference (e.g. "Two-column split", "3-card grid", "Full-width banner").

Do NOT change section IDs, titles, types, or descriptions.
Do NOT add or remove sections.
Do NOT change page structure.

Return strict JSON only:
{
  "pages": [
    {
      "id": "existing_page_id",
      "name": "...",
      "path": "...",
      "layoutNotes": "Optional page-level layout note.",
      "sections": [
        {
          "id": "existing_section_id",
          "title": "...",
          "type": "...",
          "description": "...",
          "contentHints": "Specific content guidance for this section.",
          "layoutNotes": "Optional layout note."
        }
      ]
    }
  ],
  "summary": "One sentence describing the wireframe guidance added."
}`;

  let raw = '';
  try {
    const response = await client.chat.completions.create({
      model: getModel(),
      messages: [
        { role: 'system', content: 'You are RoxanneAI, a professional web designer creating wireframe guidance. Return strict JSON only. Preserve all IDs exactly.' },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.35,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    });
    raw = response.choices[0]?.message?.content || '';
  } catch (aiErr) {
    throw httpError(`AI wireframe suggestion failed: ${aiErr.message}`, 502);
  }

  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw httpError('AI returned invalid JSON.', 502); }

  const enrichedPages = pages.map(page => {
    const aiPage = (parsed.pages || []).find(p => p.id === page.id) || {};
    return {
      ...page,
      layoutNotes: aiPage.layoutNotes || page.layoutNotes || '',
      sections: (page.sections || []).map(sec => {
        const aiSec = (aiPage.sections || []).find(s => s.id === sec.id) || {};
        return {
          ...sec,
          contentHints: aiSec.contentHints || sec.contentHints || '',
          layoutNotes: aiSec.layoutNotes || sec.layoutNotes || '',
        };
      }),
    };
  });

  return {
    pages: enrichedPages,
    summary: String(parsed.summary || 'Wireframe guidance added by RoxanneAI.'),
  };
}
