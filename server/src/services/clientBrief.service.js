/**
 * clientBrief.service.js
 * Intake questions, required keys, and brief normalization for Step 03.
 */

export const INTAKE_QUESTIONS = [
  { key: 'businessName',   label: 'Business name',     question: "What's your business or website name?",                                                   required: true  },
  { key: 'industry',       label: 'Industry',           question: 'What industry or sector are you in? (e.g. Fashion, Finance, Food, Technology)',            required: true  },
  { key: 'audience',       label: 'Target audience',    question: 'Who is your target audience? (e.g. "Young professionals aged 25–40 in London")',           required: false },
  { key: 'offer',          label: 'Products/services',  question: 'What are your main products or services? Give me a one or two sentence summary.',          required: true  },
  { key: 'tone',           label: 'Brand tone',         question: 'How would you describe your brand tone? (e.g. Professional, Friendly, Bold, Luxury, Minimal)', required: false },
  { key: 'colors',         label: 'Brand colours',      question: 'Any specific brand colours? Share hex codes or describe them — or type "keep existing" to keep the template palette.', required: false },
  { key: 'contactEmail',   label: 'Contact email',      question: 'Contact email address? (press Enter or type "skip" to leave blank)',                       required: false },
  { key: 'contactPhone',   label: 'Contact phone',      question: 'Contact phone number? (press Enter or type "skip" to leave blank)',                        required: false },
  { key: 'contactAddress', label: 'Business address',   question: 'Business address? (press Enter or type "skip" to leave blank)',                            required: false },
  { key: 'pages',          label: 'Pages needed',       question: 'Which pages do you need? (e.g. Home, About, Services, Contact, Blog)',                     required: false },
  { key: 'domain',         label: 'Domain preference',  question: 'Do you have a preferred domain name? (optional — press Enter to skip)',                    required: false },
];

export const REQUIRED_KEYS = INTAKE_QUESTIONS.filter(q => q.required).map(q => q.key);

export function buildBriefFromAnswers(answers = {}) {
  return {
    businessName:   answers.businessName   || '',
    industry:       answers.industry       || '',
    audience:       answers.audience       || '',
    offer:          answers.offer          || '',
    tone:           answers.tone           || '',
    colors:         answers.colors         || '',
    contactEmail:   answers.contactEmail   || '',
    contactPhone:   answers.contactPhone   || '',
    contactAddress: answers.contactAddress || '',
    pages:          answers.pages          || '',
    domain:         answers.domain         || '',
  };
}

export function validateRequiredFields(answers = {}) {
  const missing = REQUIRED_KEYS.filter(key => !String(answers[key] || '').trim());
  return { valid: missing.length === 0, missing };
}

export function suggestAnswerPrompt(questionKey, previousAnswers = {}) {
  const FIELD_HINTS = {
    businessName:   'Suggest a professional business name based on any context provided. If no context, give a single realistic example name.',
    industry:       'Suggest a specific industry sector.',
    audience:       'Describe the ideal target audience in one sentence.',
    offer:          'Describe the main products or services offered in 1-2 sentences.',
    tone:           'Suggest a brand tone that fits the industry and audience. One or two adjectives.',
    colors:         'Suggest brand colours that fit the business. Describe them or give hex codes.',
    stylePreferences: 'Suggest visual style preferences that match the brand.',
    pages:          'List the website pages needed, comma separated.',
    contact:        'Suggest placeholder contact details appropriate for this type of business.',
    domain:         'Suggest a short, memorable domain name.',
  };

  const context = Object.entries(previousAnswers)
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const hint = FIELD_HINTS[questionKey] || `Suggest a good answer for the "${questionKey}" field.`;

  return context
    ? `Business context:\n${context}\n\n${hint}\nReply with ONLY the suggested text, no explanation.`
    : `${hint}\nReply with ONLY the suggested text, no explanation.`;
}
