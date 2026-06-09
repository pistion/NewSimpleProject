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

// ─── autofillOptionalBrief ───────────────────────────────────────────────────
/**
 * Suggest optional brief fields based on the customer's required inputs.
 * NEVER modifies businessName, industry, or offer — those stay manual.
 * Returns: { summary, suggestions: { targetAudience, brandTone, colors, stylePreferences, pages, notes }, warnings }
 */
export async function autofillOptionalBrief(planId) {
  const plan = await getSitePlan(planId);
  if (!plan) throw httpError('Plan not found.', 404);

  const brief = plan.brief || {};
  if (!brief.businessName && !brief.industry && !brief.offer) {
    throw httpError('Fill in at least Business Name, Industry, or Core Offer before using RoxanneAI.', 400);
  }

  let templateMeta = {};
  try { templateMeta = await getTemplateDetails(plan.templateId) || {}; } catch { templateMeta = {}; }

  const client = getClient();
  const model = getModel();

  const systemPrompt = `You are RoxanneAI inside Glondia Sites — a professional website planner.

Given a business name, industry, and core offer, suggest practical optional website profile details.

Rules:
- DO NOT repeat or change businessName, industry, or offer.
- Suggest values only for the fields listed in the output shape.
- Keep suggestions concise, specific, and professional.
- Base suggestions on the business type and industry.
- Return STRICT JSON only — no markdown, no code fences, no explanation outside JSON.

Output shape:
{
  "summary": "One sentence describing your suggestions.",
  "suggestions": {
    "targetAudience": "Who this business typically serves.",
    "brandTone": "How the brand should communicate (e.g. professional, friendly, bold).",
    "colors": "2-3 color ideas that suit the industry and brand.",
    "stylePreferences": "Overall visual style direction (e.g. clean and modern, warm and approachable).",
    "pages": "Recommended pages (e.g. Home, Services, About, Contact, Gallery).",
    "notes": "Any other practical suggestions for the site."
  },
  "warnings": []
}`;

  const userPrompt = `Template: ${templateMeta.name || plan.templateId} (${templateMeta.category || 'Business'})

Required fields provided by customer:
- Business name: ${brief.businessName || '(not set)'}
- Industry: ${brief.industry || '(not set)'}
- Core offer: ${brief.offer || '(not set)'}

Existing optional values (preserve if already filled, improve only if empty or vague):
- Target audience: ${brief.targetAudience || '(empty)'}
- Brand tone: ${brief.brandTone || '(empty)'}
- Colors: ${brief.colors || '(empty)'}
- Style preferences: ${brief.stylePreferences || '(empty)'}
- Pages: ${brief.pages || '(empty)'}
- Notes: ${brief.notes || '(empty)'}

Suggest or improve the optional fields above. Return strict JSON only.`;

  let raw = '';
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
    });
    raw = response.choices[0]?.message?.content || '';
  } catch (aiErr) {
    throw httpError(`AI suggestion failed: ${aiErr.message}`, 502);
  }

  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw httpError('AI returned invalid JSON. Please try again.', 502); }

  return {
    summary: String(parsed.summary || 'Optional fields suggested by RoxanneAI.'),
    suggestions: parsed.suggestions || {},
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
  };
}

// ─── suggestSectionsForPage ──────────────────────────────────────────────────
/**
 * Suggest improved sections for one specific page in the plan.
 * Only targets the specified pageId — other pages are untouched.
 * Returns: { summary, pageId, sections: [...], warnings }
 */
export async function suggestSectionsForPage(planId, pageId) {
  const plan = await getSitePlan(planId);
  if (!plan) throw httpError('Plan not found.', 404);
  if (!pageId) throw httpError('pageId is required.', 400);

  const page = (plan.sitemap?.pages || []).find(p => p.id === pageId);
  if (!page) throw httpError('Page not found in this plan.', 404);

  let templateMeta = {};
  try { templateMeta = await getTemplateDetails(plan.templateId) || {}; } catch { templateMeta = {}; }

  const client = getClient();
  const model = getModel();

  const systemPrompt = `You are RoxanneAI inside Glondia Sites — a professional website planner.

Improve the sections for one specific page. Only return sections for that page.

Rules:
- Preserve existing section IDs where the section is kept.
- Remove duplicate or redundant sections.
- Improve section titles and descriptions to be clear and specific.
- Fill empty section descriptions with practical content guidance.
- Suggest 1-2 missing sections max if clearly needed.
- Section types must be one of: hero, services, about, cta, gallery, form, details, process, faq, pricing, team, features.
- Return STRICT JSON only.

Output shape:
{
  "summary": "One sentence describing what changed and why.",
  "sections": [
    {
      "id": "existing_id_or_new_uid",
      "title": "Section Title",
      "type": "hero",
      "description": "Clear description of content and purpose."
    }
  ],
  "warnings": []
}`;

  const userPrompt = `Template: ${templateMeta.name || plan.templateId}
Business: ${plan.brief?.businessName || '(unknown)'} — ${plan.brief?.industry || '(unknown)'}
Core offer: ${plan.brief?.offer || '(unknown)'}

Page to improve:
- Name: ${page.name}
- Path: ${page.path}

Current sections:
${JSON.stringify(page.sections || [], null, 2)}

Improve the sections for this page. Return strict JSON only.`;

  let raw = '';
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    });
    raw = response.choices[0]?.message?.content || '';
  } catch (aiErr) {
    throw httpError(`AI suggestion failed: ${aiErr.message}`, 502);
  }

  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw httpError('AI returned invalid JSON. Please try again.', 502); }

  // Ensure every section has an id
  const sections = (parsed.sections || page.sections).map(s => ({
    ...s,
    id: s.id || uid(),
  }));

  return {
    summary: String(parsed.summary || 'Sections improved by RoxanneAI.'),
    pageId,
    pageName: page.name,
    sections,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
  };
}

// ─── suggestWireframe ────────────────────────────────────────────────────────
/**
 * Generate wireframe layout guidance from the current sitemap + style.
 * Returns: { summary, pages: [{ id, name, layoutNotes, sections }], warnings }
 * The sections include enhanced descriptions with content hints.
 */
export async function suggestWireframe(planId) {
  const plan = await getSitePlan(planId);
  if (!plan) throw httpError('Plan not found.', 404);

  const pages = plan.sitemap?.pages || [];
  if (!pages.length) throw httpError('Add at least one page to the sitemap first.', 400);

  let templateMeta = {};
  try { templateMeta = await getTemplateDetails(plan.templateId) || {}; } catch { templateMeta = {}; }

  const client = getClient();
  const model = getModel();

  const systemPrompt = `You are RoxanneAI inside Glondia Sites — a professional website wireframe planner.

Given a site plan's sitemap and style, add specific content guidance to each section to help a developer or designer build it.

Rules:
- Preserve all existing page IDs and section IDs exactly.
- Do not add or remove pages or sections.
- Add a "layoutNotes" field per page describing the overall page structure.
- Add a "contentHints" field per section with specific layout/content guidance (e.g. "3-column card grid with icon, title, and 2-line body each").
- Use the style direction to influence language (e.g. minimal vs bold vs warm).
- Return STRICT JSON only.

Output shape:
{
  "summary": "One sentence describing the wireframe guidance.",
  "pages": [
    {
      "id": "existing_page_id",
      "name": "Page Name",
      "layoutNotes": "Overall page layout description.",
      "sections": [
        {
          "id": "existing_section_id",
          "title": "Section Title",
          "type": "hero",
          "description": "Original or improved description.",
          "contentHints": "Specific layout/content guidance for this section."
        }
      ]
    }
  ],
  "warnings": []
}`;

  const userPrompt = `Template: ${templateMeta.name || plan.templateId}
Business: ${plan.brief?.businessName || '(unknown)'} — ${plan.brief?.industry || '(unknown)'}
Style preset: ${plan.style?.presetId || 'clean'}
Accent color: ${plan.style?.colors?.accent || '#198754'}
Heading font: ${plan.style?.headingFont || 'sans-serif'}

Current sitemap:
${JSON.stringify(pages, null, 2)}

Generate wireframe content guidance. Return strict JSON only.`;

  let raw = '';
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.35,
      max_tokens: 3000,
      response_format: { type: 'json_object' },
    });
    raw = response.choices[0]?.message?.content || '';
  } catch (aiErr) {
    throw httpError(`AI wireframe suggestion failed: ${aiErr.message}`, 502);
  }

  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw httpError('AI returned invalid JSON. Please try again.', 502); }

  return {
    summary: String(parsed.summary || 'Wireframe guidance generated by RoxanneAI.'),
    pages: Array.isArray(parsed.pages) ? parsed.pages : pages,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
  };
}
