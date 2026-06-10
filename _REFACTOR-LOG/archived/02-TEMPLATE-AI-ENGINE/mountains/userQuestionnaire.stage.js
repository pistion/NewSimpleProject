/**
 * userQuestionnaire.stage.js - 03-USER-BRIEF-MOUNTAIN
 */

export {
  INTAKE_QUESTIONS,
  REQUIRED_KEYS,
} from '../04-AI-REFINEMENT-MOUNTAIN/openaiTailor.stage.js';

export function buildBriefFromAnswers(answers = {}) {
  return {
    businessName: answers.businessName || '',
    industry: answers.industry || '',
    audience: answers.audience || '',
    offer: answers.offer || '',
    tone: answers.tone || '',
    colors: answers.colors || '',
    contactEmail: answers.contactEmail || '',
    contactPhone: answers.contactPhone || '',
    contactAddress: answers.contactAddress || '',
    pages: answers.pages || '',
    domain: answers.domain || '',
  };
}

export async function runStage(context) {
  context.brief = buildBriefFromAnswers(context.input?.answers || context.brief || {});
  return context;
}
