import { makeId } from '../../../../services/hostingStore.js';
import { INTAKE_QUESTIONS, REQUIRED_KEYS, suggestAnswerPrompt } from '../../../../services/clientBrief.service.js';
import OpenAI from 'openai';

const sessions = new Map();

function maybeCleanSessions() {
  if (sessions.size < 500) return;
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, s] of sessions) if (new Date(s.createdAt).getTime() < cutoff) sessions.delete(id);
}

async function startIntake(req, res, next) {
  try {
    const { templateId } = req.body || {};
    maybeCleanSessions();
    const sessionId = makeId('intake');
    sessions.set(sessionId, { templateId, collectedAnswers: {}, step: 0, createdAt: new Date().toISOString() });
    const q = INTAKE_QUESTIONS[0];
    res.json({
      sessionId,
      question: q.question,
      questionKey: q.key,
      questionLabel: q.label,
      step: 0,
      totalSteps: INTAKE_QUESTIONS.length,
      requiredFields: REQUIRED_KEYS,
      collectedAnswers: {},
    });
  } catch (err) { next(err); }
}

async function sendMessage(req, res, next) {
  try {
    const { sessionId, message, collectedAnswers } = req.body || {};
    if (!sessionId || typeof sessionId !== 'string') return res.status(400).json({ error: 'sessionId is required.' });
    if (message === undefined || message === null) return res.status(400).json({ error: 'message is required (use empty string to skip).' });
    if (typeof message !== 'string' || message.length > 2000) return res.status(400).json({ error: 'message must be a string under 2000 characters.' });

    const session = sessions.get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found. Start a new intake.' });

    const currentQ = INTAKE_QUESTIONS[session.step];
    if (currentQ) session.collectedAnswers[currentQ.key] = message.trim().toLowerCase() === 'skip' ? '' : message.trim();

    if (collectedAnswers && typeof collectedAnswers === 'object') {
      for (const [k, v] of Object.entries(collectedAnswers)) {
        if (typeof k === 'string' && k.length < 60 && typeof v === 'string' && v.length < 2000) {
          session.collectedAnswers[k] = session.collectedAnswers[k] ?? v;
        }
      }
    }
    session.step += 1;
    const nextQ = INTAKE_QUESTIONS[session.step];
    res.json({
      sessionId,
      question: nextQ?.question || null,
      questionKey: nextQ?.key || null,
      questionLabel: nextQ?.label || null,
      step: session.step,
      totalSteps: INTAKE_QUESTIONS.length,
      collectedAnswers: { ...session.collectedAnswers },
      complete: !nextQ,
    });
  } catch (err) { next(err); }
}

async function suggestAnswer(req, res, next) {
  try {
    const { questionKey, previousAnswers = {} } = req.body || {};
    const prompt = suggestAnswerPrompt(questionKey, previousAnswers);
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: 'You are RoxanneAI, an assistant that helps clients fill in website configuration fields. Give short, direct suggestions.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 120,
      temperature: 0.7,
    });

    res.json({ suggestion: (completion.choices[0]?.message?.content || '').trim() });
  } catch (err) { next(err); }
}

export const userBriefController = { startIntake, sendMessage, suggestAnswer };
