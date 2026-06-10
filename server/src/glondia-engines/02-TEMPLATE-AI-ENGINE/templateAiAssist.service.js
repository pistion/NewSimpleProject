/**
 * templateAiAssist.service.js — 02-TEMPLATE-AI-ENGINE
 *
 * Per-field AI assist service.
 *
 * The wizard frontend calls POST /api/template-ai/assist whenever:
 *  - A user pauses typing in an AI-assisted field (debounced 800ms)
 *  - A user clicks the ✨ AI Assist button on a field
 *
 * The service receives the field name, current value, all filled context,
 * and the template type — and returns a clean suggestion for that field only.
 *
 * Fields that can be assisted:
 *   tagline, offer, audience, heroText, seoTitle, seoDescription,
 *   ctaText, aboutText, footerText, productName, productDescription,
 *   sectionCopy (any free-text section), colourSuggestion
 *
 * Fields that are MANUAL only (not sent to AI):
 *   businessName, contactEmail, logo (upload), location, pages selected
 */

import OpenAI from 'openai';

const openai  = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL   = process.env.OPENAI_MODEL || 'gpt-4o';

// Field-specific instructions so the AI stays tightly scoped
const FIELD_INSTRUCTIONS = {
  offer: 'Write a punchy 1-sentence main offer or value proposition for this brand. Max 15 words.',
  audience: 'Describe the target customer in 1 short sentence. Be specific. Max 12 words.',
  tagline: 'Write a short brand tagline. Punchy, memorable, max 8 words. No quotes.',
  heroText: 'Write a bold hero headline for the website. Max 10 words. Impactful, brand-aligned.',
  seoTitle: 'Write an SEO page title. Include the business name. Max 60 characters.',
  seoDescription: 'Write a meta description for the homepage. Max 155 characters. Clear and compelling.',
  ctaText: 'Write a short call-to-action button label. Max 4 words. Action-oriented.',
  aboutText: 'Write a short "About us" paragraph. 2-3 sentences. Professional and warm.',
  footerText: 'Write a short footer tagline or copyright blurb. Max 15 words.',
  productName: 'Suggest a product name that fits this brand and industry. Max 4 words.',
  productDescription: 'Write a short product description. Max 2 sentences. Benefit-focused.',
  colourSuggestion: 'Suggest a brand colour palette. Return as JSON: { "accent": "#hex", "bg": "#hex", "ink": "#hex" }. Match the industry and mood.',
  sectionCopy: 'Write copy for this website section. 2-3 sentences. On-brand and clear.',
  industry: 'Describe the business industry or niche in 3-5 words. Be specific.',
};

const DEFAULT_INSTRUCTION = 'Provide a helpful, concise suggestion for this field. Keep it short and on-brand.';

/**
 * Get an AI suggestion for a single wizard field.
 *
 * @param {object} params
 * @param {string} params.fieldName     — the field being assisted (e.g. 'offer')
 * @param {string} params.currentValue  — what the user has typed so far (may be empty)
 * @param {object} params.context       — all other filled-in fields so far
 * @param {string} params.templateId    — 'forge' or 'pulse-works'
 * @returns {{ suggestion: string, fieldName: string }}
 */
export async function assistField({ fieldName, currentValue, context, templateId }) {
  const instruction = FIELD_INSTRUCTIONS[fieldName] || DEFAULT_INSTRUCTION;

  const contextLines = Object.entries(context || {})
    .filter(([k, v]) => k !== fieldName && v && typeof v === 'string')
    .map(([k, v]) => `  ${k}: ${v}`)
    .join('\n');

  const system = `You are a brand copywriter assistant for Glondia Sites website builder.
You help business owners fill in their website configuration form.
Be concise, professional, and on-brand.
Return ONLY the suggested text — no explanation, no labels, no quotes around it.
Unless the field asks for JSON (colourSuggestion), return plain text only.`;

  const user = `Template: ${templateId}
Field to fill: ${fieldName}
Field instruction: ${instruction}
${currentValue ? `Current draft: "${currentValue}"` : 'Field is empty.'}

Other fields already filled in:
${contextLines || '  (none yet)'}

Provide the best suggestion for "${fieldName}":`;

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user',   content: user }
    ],
    max_tokens: 150,
    temperature: 0.7
  });

  const suggestion = (completion.choices[0]?.message?.content || '').trim();

  return { fieldName, suggestion, tokensUsed: completion.usage?.total_tokens || 0 };
}

/**
 * Batch assist — clean and improve all filled fields at once.
 * Called when client clicks "Clean up all with AI" before final review.
 *
 * @param {object} params
 * @param {object} params.config      — full collected config so far
 * @param {string} params.templateId
 * @returns {{ cleaned: object }} — same shape as config with improved values
 */
export async function cleanAllFields({ config, templateId }) {
  const assistableFields = Object.keys(FIELD_INSTRUCTIONS);
  const toClean = Object.entries(config)
    .filter(([k, v]) => assistableFields.includes(k) && v && typeof v === 'string')
    .map(([k, v]) => ({ field: k, value: v }));

  if (!toClean.length) return { cleaned: config };

  const system = `You are a brand copywriter reviewing a website configuration form.
Clean up and improve the provided field values — fix grammar, improve clarity, make them punchy and professional.
Return ONLY a JSON object with the same field names and improved values.
Do not add fields that weren't provided.`;

  const user = `Template: ${templateId}
Business context: ${JSON.stringify(config, null, 2)}

Fields to clean up:
${JSON.stringify(Object.fromEntries(toClean.map(({ field, value }) => [field, value])), null, 2)}

Return cleaned JSON:`;

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user',   content: user }
    ],
    max_tokens: 600,
    temperature: 0.4,
    response_format: { type: 'json_object' }
  });

  let cleaned = {};
  try {
    cleaned = JSON.parse(completion.choices[0]?.message?.content || '{}');
  } catch {
    cleaned = {};
  }

  return { cleaned: { ...config, ...cleaned } };
}
