/**
 * openaiSiteAssistant.service.js
 * Server-side OpenAI integration for AI-assisted template setup.
 * Reads OPENAI_API_KEY and OPENAI_MODEL from process.env only.
 * Never logs or exposes the key.
 */

import OpenAI from 'openai';

let _client = null;

function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    const err = new Error('OPENAI_API_KEY is not configured on this server.');
    err.status = 503;
    err.expose = true;
    throw err;
  }
  if (!_client) {
    _client = new OpenAI({ apiKey: key });
  }
  return _client;
}

function getModel() {
  return process.env.OPENAI_MODEL || 'gpt-4o-mini';
}

/**
 * Tailor an HTML template's content to match the customer's business.
 * Replaces brand name, hero text, CTA, services, contact details, tone, and colours.
 * @param {string} templateHtml - The original full-page HTML string.
 * @param {object} answers - Collected intake answers.
 * @returns {Promise<string>} The tailored HTML string.
 */
export async function tailorHtmlTemplate(templateHtml, answers) {
  if (!templateHtml || typeof templateHtml !== 'string') {
    throw Object.assign(new Error('templateHtml must be a non-empty string.'), { status: 400, expose: true });
  }
  if (templateHtml.length > 200_000) {
    throw Object.assign(new Error('Template HTML exceeds the 200 kB limit.'), { status: 400, expose: true });
  }

  const client = getClient();
  const model = getModel();

  const businessName   = String(answers.businessName   || 'My Business').slice(0, 120);
  const industry       = String(answers.industry       || 'General').slice(0, 120);
  const audience       = String(answers.audience       || 'General public').slice(0, 200);
  const offer          = String(answers.offer          || 'Products and services').slice(0, 400);
  const tone           = String(answers.tone           || 'Professional').slice(0, 60);
  const colors         = String(answers.colors         || 'Keep existing').slice(0, 200);
  const contactEmail   = String(answers.contactEmail   || '').slice(0, 120);
  const contactPhone   = String(answers.contactPhone   || '').slice(0, 60);
  const contactAddress = String(answers.contactAddress || '').slice(0, 200);
  const pages          = Array.isArray(answers.pages)
    ? answers.pages.join(', ').slice(0, 200)
    : String(answers.pages || 'Home, About, Contact').slice(0, 200);

  const systemPrompt =
    'You are a professional web developer who customises HTML website templates for clients. ' +
    'Your task: replace placeholder text, brand names, headings, hero copy, CTA labels, ' +
    'service/product descriptions, and contact details in the HTML with the client\'s real information. ' +
    'If specific brand colours are provided, update the relevant CSS colour values. ' +
    'Preserve ALL structure, layout, CSS, JavaScript, images, and SVGs exactly as they are. ' +
    'Return ONLY valid raw HTML — no markdown code fences, no explanations, no commentary.';

  const userPrompt =
    `Customise this HTML template with the client\'s details:\n\n` +
    `Business name: ${businessName}\n` +
    `Industry: ${industry}\n` +
    `Target audience: ${audience}\n` +
    `Main products/services: ${offer}\n` +
    `Brand tone: ${tone}\n` +
    `Brand colours: ${colors}\n` +
    `Contact email: ${contactEmail || '(omit)'}\n` +
    `Contact phone: ${contactPhone || '(omit)'}\n` +
    `Contact address: ${contactAddress || '(omit)'}\n` +
    `Pages needed: ${pages}\n\n` +
    `Template HTML:\n\n${templateHtml.slice(0, 80_000)}`;

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   },
    ],
    temperature: 0.3,
    max_tokens: 16_000,
  });

  let tailored = response.choices[0]?.message?.content || templateHtml;
  // Strip any accidental markdown fences the model might add
  tailored = tailored.replace(/^```html\s*/i, '').replace(/\s*```$/, '').trim();
  return tailored;
}

export async function runStage(context) {
  const templateHtml = context.input?.templateHtml || context.template?.html;
  const answers = context.input?.answers || context.brief || {};
  const html = await tailorHtmlTemplate(templateHtml, answers);
  context.ai.tailoredPages = [{ title: 'Home', path: '/', html }];
  context.ai.rawResponse = html;
  context.ai.model = getModel();
  return context;
}

// Ordered list of intake questions (also used by the controller).
export const INTAKE_QUESTIONS = [
  { key: 'businessName',   label: 'Business name',     question: "What's your business or website name?",                                                  required: true  },
  { key: 'industry',       label: 'Industry',           question: 'What industry or sector are you in? (e.g. Fashion, Finance, Food, Technology)',           required: true  },
  { key: 'audience',       label: 'Target audience',    question: 'Who is your target audience? (e.g. "Young professionals aged 25–40 in London")',          required: false },
  { key: 'offer',          label: 'Products/services',  question: 'What are your main products or services? Give me a one or two sentence summary.',         required: true  },
  { key: 'tone',           label: 'Brand tone',         question: 'How would you describe your brand tone? (e.g. Professional, Friendly, Bold, Luxury, Minimal)', required: false },
  { key: 'colors',         label: 'Brand colours',      question: 'Any specific brand colours? Share hex codes or describe them — or type "keep existing" to keep the template palette.', required: false },
  { key: 'contactEmail',   label: 'Contact email',      question: 'Contact email address? (press Enter or type "skip" to leave blank)',                      required: false },
  { key: 'contactPhone',   label: 'Contact phone',      question: 'Contact phone number? (press Enter or type "skip" to leave blank)',                       required: false },
  { key: 'contactAddress', label: 'Business address',   question: 'Business address? (press Enter or type "skip" to leave blank)',                           required: false },
  { key: 'pages',          label: 'Pages needed',       question: 'Which pages do you need? (e.g. Home, About, Services, Contact, Blog)',                    required: false },
  { key: 'domain',         label: 'Domain preference',  question: 'Do you have a preferred domain name? (optional — press Enter to skip)',                   required: false },
];

export const REQUIRED_KEYS = INTAKE_QUESTIONS.filter(q => q.required).map(q => q.key);
