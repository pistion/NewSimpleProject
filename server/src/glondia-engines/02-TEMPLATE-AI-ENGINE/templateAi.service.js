/**
 * templateAi.service.js — 02-TEMPLATE-AI-ENGINE
 *
 * Core service that:
 *  1. Reads a template folder (forge / pulse-works) into memory
 *  2. Builds an OpenAI prompt combining the shell files + client JSON config
 *  3. Sends to gpt-4o and receives modified file content back
 *  4. Reconstructs the template folder with client data applied
 *  5. ZIPs it and returns the buffer + metadata
 *
 * OpenAI strategy: standard chat completions (gpt-4o).
 * Template files are inlined as text. Binary/media files are copied unchanged.
 * siteData.js is the primary target — AI populates all {{placeholder}} tokens.
 * styles.css receives brand colour injection via CSS variable overrides.
 * index.html receives updated meta title and description.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Template shell root: <repo-root>/templates/
const TEMPLATES_ROOT = path.resolve(__dirname, '../../../../../templates');

// Files the AI is allowed to edit (text files only)
const EDITABLE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.css', '.html', '.json', '.md']);

// Files to ALWAYS skip (lock files, gitignore, etc.)
const SKIP_FILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', '.gitignore', '.DS_Store']);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const AI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Recursively read all files in a directory.
 * Returns: Array of { relativePath, absolutePath, isText, content (if text) }
 */
function readTemplateFiles(templateDir) {
  const results = [];

  function walk(dir, base = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const rel  = base ? `${base}/${entry.name}` : entry.name;
      const abs  = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
        walk(abs, rel);
      } else {
        if (SKIP_FILES.has(entry.name)) continue;
        const ext    = path.extname(entry.name).toLowerCase();
        const isText = EDITABLE_EXTENSIONS.has(ext);
        results.push({
          relativePath: rel,
          absolutePath: abs,
          isText,
          content: isText ? fs.readFileSync(abs, 'utf8') : null
        });
      }
    }
  }

  walk(templateDir);
  return results;
}

/**
 * Build the OpenAI system + user prompt.
 * The AI receives all text files as-is and must return a JSON map of
 * { "relativePath": "new file content" } for every file it wants to change.
 */
function buildPrompt(templateId, clientConfig, files) {
  const textFiles = files.filter((f) => f.isText);

  const fileBlock = textFiles.map((f) =>
    `=== FILE: ${f.relativePath} ===\n${f.content}`
  ).join('\n\n');

  const system = `You are a professional website builder AI for Glondia Sites.

Your job is to take a Vite + React template and fully populate it with a client's brand data.

RULES:
1. Return ONLY a valid JSON object. No markdown, no code fences, no explanation.
2. The JSON must be: { "relativePath": "complete file content", ... }
3. Include EVERY text file listed below in your response, even files you did not change.
4. Do NOT change filenames, imports, routing logic, or component structure.
5. Replace ALL {{placeholder}} tokens in siteData.js with real client values.
6. For siteData.js: populate businessName, industry, offer, audience, contactEmail, location, slug, nav, and products arrays using the client config.
7. For styles.css: inject the client's brand colours as overrides at the top of the :root block. Use the exact CSS variable names already in the file.
8. For index.html: update the <title> and <meta name="description"> with the client's businessName and offer.
9. For other files: copy them verbatim unless there is a direct {{placeholder}} to replace.
10. Products in siteData.js must reflect the client's actual product list from the config. If client did not provide products, generate 4 realistic ones based on their industry.
11. Nav in siteData.js must match the client's selected pages from their config.`;

  const user = `Template ID: ${templateId}

CLIENT CONFIGURATION:
${JSON.stringify(clientConfig, null, 2)}

TEMPLATE FILES TO EDIT:
${fileBlock}

Return the complete JSON map of all files with client data applied.`;

  return { system, user };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a client-configured site ZIP using OpenAI.
 *
 * @param {object} options
 * @param {string} options.templateId   — 'forge' or 'pulse-works'
 * @param {object} options.clientConfig — the collected JSON from the wizard
 * @param {string} options.clientId     — user ID for deploy tracking
 * @param {string} options.deployId     — e.g. GH-00123-DEP-001
 * @returns {{ zipBuffer: Buffer, slug: string, deployId: string, files: string[] }}
 */
export async function generateSiteFromTemplate({ templateId, clientConfig, clientId, deployId }) {
  const templateDir = path.join(TEMPLATES_ROOT, templateId);
  if (!fs.existsSync(templateDir)) {
    throw new Error(`Template not found: ${templateId}. Available: forge, pulse-works`);
  }

  const templateJson = JSON.parse(
    fs.readFileSync(path.join(templateDir, 'template.json'), 'utf8')
  );

  // Auto-generate slug if not provided
  const slug = clientConfig.slug
    || String(clientConfig.businessName || 'my-site')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const enrichedConfig = {
    ...clientConfig,
    slug,
    templateId,
    templateName: templateJson.name,
    deployId,
    clientId
  };

  // Read all template files
  const files = readTemplateFiles(templateDir);

  // Build prompt
  const { system, user } = buildPrompt(templateId, enrichedConfig, files);

  console.log(`[template-ai] Sending ${files.filter(f => f.isText).length} text files to OpenAI for ${deployId}`);

  // Call OpenAI
  const completion = await openai.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user',   content: user }
    ],
    max_tokens: 8000,
    temperature: 0.3,
    response_format: { type: 'json_object' }
  });

  const rawResponse = completion.choices[0]?.message?.content || '{}';
  let editedFiles;
  try {
    editedFiles = JSON.parse(rawResponse);
  } catch (err) {
    throw new Error(`OpenAI returned invalid JSON: ${err.message}`);
  }

  // Build the ZIP
  const zip = new AdmZip();

  // Add all files — text files use AI-edited content, binary files are copied as-is
  for (const file of files) {
    if (file.isText) {
      const newContent = editedFiles[file.relativePath] ?? file.content;
      zip.addFile(
        `${slug}/${file.relativePath}`,
        Buffer.from(newContent, 'utf8')
      );
    } else {
      // Binary file — copy as-is
      const rawBuffer = fs.readFileSync(file.absolutePath);
      zip.addFile(`${slug}/${file.relativePath}`, rawBuffer);
    }
  }

  const zipBuffer = zip.toBuffer();

  console.log(`[template-ai] ZIP generated — ${(zipBuffer.length / 1024).toFixed(1)} KB for ${deployId}`);

  return {
    zipBuffer,
    slug,
    deployId,
    clientId,
    templateId,
    files: Object.keys(editedFiles),
    tokensUsed: completion.usage?.total_tokens || 0
  };
}

/**
 * Read a template's config for the wizard UI.
 * Returns templateJson + the siteData.js structure for the configurator.
 */
export function getTemplateWizardConfig(templateId) {
  const templateDir = path.join(TEMPLATES_ROOT, templateId);
  if (!fs.existsSync(templateDir)) {
    throw new Error(`Template not found: ${templateId}`);
  }
  const templateJson = JSON.parse(
    fs.readFileSync(path.join(templateDir, 'template.json'), 'utf8')
  );
  return { templateId, ...templateJson };
}

/**
 * List all available templates.
 */
export function listTemplates() {
  if (!fs.existsSync(TEMPLATES_ROOT)) return [];
  return fs.readdirSync(TEMPLATES_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(TEMPLATES_ROOT, d.name, 'template.json'), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
