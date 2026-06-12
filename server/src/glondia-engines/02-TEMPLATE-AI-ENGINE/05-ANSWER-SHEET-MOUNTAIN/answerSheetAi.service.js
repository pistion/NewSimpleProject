/**
 * answerSheetAi.service.js
 *
 * Uses OpenAI chat completions to fill missing answer-sheet fields only.
 * Never invents contact details, prices, or legal claims.
 * Never outputs HTML, CSS, React, or deployment config.
 */

import OpenAI from 'openai';

const SYSTEM_PROMPT = `You are RoxanneAI inside Glondia Sites.
Your job is to complete a structured website answer sheet for a small business website.
Preserve all existing manual user data.
Only fill empty or weak content fields.
Do not output HTML, CSS, React, or deployment settings.
Do not invent phone numbers, email addresses, physical addresses, prices, licenses, or certifications.
If critical contact or legal data is missing, add a warning in meta.warnings instead of inventing it.
Return strict JSON only in the same answerSheet shape provided.
The JSON must have a top-level "answerSheet" key containing the completed answer sheet.`;

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    const err = new Error('OPENAI_API_KEY is not configured.');
    err.status = 503;
    err.expose = true;
    throw err;
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function completeAnswerSheetWithAi(answerSheet, options = {}) {
  const client = getClient();
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify({ answerSheet }, null, 2) },
    ],
    temperature: 0.35,
    max_tokens: 5000,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content || '{}';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  const aiSheet = parsed.answerSheet || parsed;
  return mergeAiAnswerSheet(answerSheet, aiSheet);
}

/**
 * Merge AI-generated answer sheet into the original, preserving all
 * non-empty manual values. AI only fills truly empty/blank fields.
 */
function mergeAiAnswerSheet(original = {}, ai = {}) {
  const now = new Date().toISOString();

  function mergeValue(orig, generated) {
    if (orig === null || orig === undefined || orig === '') return generated ?? orig;
    if (Array.isArray(orig)) {
      if (!Array.isArray(generated)) return orig;
      if (!orig.length) return generated;
      // Deep-merge arrays of objects by id or name (pages, sections, keywords, warnings)
      const firstOrig = orig[0];
      if (firstOrig && typeof firstOrig === 'object' && (firstOrig.id || firstOrig.name)) {
        return orig.map(item => {
          const match = generated.find(g =>
            (item.id && g.id === item.id) || (item.name && g.name === item.name)
          );
          return match ? mergeObjects(item, match) : item;
        });
      }
      // Primitive arrays — preserve original
      return orig;
    }
    if (typeof orig === 'object') return mergeObjects(orig, generated);
    return orig;
  }

  function mergeObjects(origObj = {}, genObj = {}) {
    if (!genObj || typeof genObj !== 'object') return origObj;
    const result = { ...origObj };
    for (const key of Object.keys(genObj)) {
      result[key] = mergeValue(origObj[key], genObj[key]);
    }
    return result;
  }

  const merged = mergeObjects(original, ai);

  // Merge warnings — combine original + any AI-added warnings
  const origWarnings = Array.isArray(original.meta?.warnings) ? original.meta.warnings : [];
  const aiWarnings = Array.isArray(ai.meta?.warnings) ? ai.meta.warnings : [];
  const combinedWarnings = [...new Set([...origWarnings, ...aiWarnings])];

  return {
    ...merged,
    status: merged.status === 'draft' ? 'ai_generated' : merged.status,
    meta: {
      ...(merged.meta || {}),
      updatedAt: now,
      generatedByAi: true,
      warnings: combinedWarnings,
    },
  };
}
