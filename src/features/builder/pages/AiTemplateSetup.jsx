// AiTemplateSetup.jsx — RoxanneAI guided customization before Hosting handoff.
import React, { useState, useEffect, useRef } from 'react';
import { ICN } from '../../../icons';
import { GD } from '../../../data';
import { aiEditTemplateHostingSite, createSiteFromTailoredTemplate, generateTailoredTemplate, prepareTemplateHostingSite } from '../../../api/template-ai.js';
import './AiTemplateSetup.css';

const QUESTIONS = [
  { key: 'businessName', label: 'Business name', question: "What's your business or website name?" },
  { key: 'industry', label: 'Industry', question: 'What industry or niche is this website for?' },
  { key: 'audience', label: 'Target audience', question: 'Who is your ideal customer or audience?' },
  { key: 'offer', label: 'Products/services', question: 'What do you sell or offer? Include your most important products, services, or packages.' },
  { key: 'tone', label: 'Brand tone', question: 'What should the brand feel like? Examples: luxury, bold, friendly, minimal, premium, playful.' },
  { key: 'colors', label: 'Colors', question: 'Any brand colors or color preferences? You can type hex codes, color names, or “keep existing”.' },
  { key: 'stylePreferences', label: 'Style preferences', question: 'Any visual taste preferences? Examples: clean, editorial, streetwear, corporate, elegant, modern.' },
  { key: 'pages', label: 'Pages needed', question: 'Which pages should the site include? Example: Home, Shop, About, Contact, FAQ.' },
  { key: 'contact', label: 'Contact details', question: 'What contact details should appear on the site? Email, phone, location, or type “skip”.' },
  { key: 'domain', label: 'Domain preference', question: 'Do you have a preferred domain or subdomain? This is optional.' },
];

const REQUIRED_KEYS = ['businessName', 'industry', 'offer'];

const GREETING_LINES = [
  "Hi, I'm RoxanneAI. I'll turn this template into a website that matches your business.",
  "I'll ask focused editing questions, sharpen your answers into structured website data, then create a copied draft from the template.",
  'The original template stays untouched. Your customized version becomes the deployable site.',
];

function isSkip(value) {
  return !value || value.trim().toLowerCase() === 'skip';
}

function RoxanneGeneratingLoader({ templateName }) {
  return (
    <div className="card" style={{ padding: 28, borderRadius: '1.25rem', background: '#111', color: '#7c7c7c', maxWidth: 720, margin: '30px auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <div style={{ width: 38, height: 38, borderRadius: 999, background: 'rgba(149,106,250,.16)', color: '#956afa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ICN.Sparkles size={18} />
        </div>
        <div>
          <div style={{ color: '#fff', fontWeight: 700 }}>RoxanneAI is editing your copied template</div>
          <div style={{ fontSize: 13 }}>Customizing {templateName || 'your selected template'} and preparing it for hosting settings.</div>
        </div>
      </div>
      <div className="roxanne-loader">
        <p>loading</p>
        <div className="roxanne-loader-words">
          <span className="roxanne-loader-word">branding</span>
          <span className="roxanne-loader-word">sections</span>
          <span className="roxanne-loader-word">products</span>
          <span className="roxanne-loader-word">layouts</span>
          <span className="roxanne-loader-word">pages</span>
          <span className="roxanne-loader-word">branding</span>
        </div>
      </div>
      <p style={{ margin: '18px 0 0', color: '#a6a6a6', fontSize: 13 }}>
        This can take a moment. Do not close this screen.
      </p>
    </div>
  );
}

export function BuilderAiIntake({ templateId, templateType, navigate }) {
  const template = GD.templates.find(t => t.id === templateId) || null;
  const isHtml = template?.contentJson?._source === 'html-template' || templateType === 'html';
  const isRepoTemplate = templateType === 'repo-template';
  const tplPages = Array.isArray(template?.contentJson?.pages) ? template.contentJson.pages : [];

  const [messages, setMessages] = useState(() => [
    ...GREETING_LINES.map(text => ({ role: 'ai', text })),
    { role: 'ai', text: QUESTIONS[0].question, questionKey: QUESTIONS[0].key },
  ]);
  const [step, setStep] = useState(0);
  const [input, setInput] = useState('');
  const [answers, setAnswers] = useState({});
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);

  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  const complete = step >= QUESTIONS.length;
  const minRequired = REQUIRED_KEYS.every(k => answers[k]?.trim());

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!complete && !generating) inputRef.current?.focus();
  }, [step, complete, generating]);

  const sendAnswer = (text) => {
    const currentQ = QUESTIONS[step];
    if (!currentQ || generating) return;

    const rawValue = text.trim();
    const value = isSkip(rawValue) ? '' : rawValue;
    const display = rawValue || '(skip)';
    const newAnswers = { ...answers, [currentQ.key]: value };
    const nextStep = step + 1;
    const nextQ = QUESTIONS[nextStep];

    setAnswers(newAnswers);
    setMessages(prev => [
      ...prev,
      { role: 'user', text: display },
      nextQ
        ? { role: 'ai', text: nextQ.question, questionKey: nextQ.key }
        : { role: 'ai', text: REQUIRED_KEYS.every(k => newAnswers[k]?.trim())
          ? 'Perfect. I have the core details. Click “Generate with RoxanneAI” and I will edit the copied template for Hosting handoff.'
          : 'I still need business name, industry, and products/services before I can generate the copied template.' },
    ]);
    setStep(nextStep);
    setInput('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (complete) return;
    sendAnswer(input);
  };

  const buildSiteProfile = () => ({
    source: 'roxanne-ai-intake',
    parentTemplateId: templateId,
    templateType: isRepoTemplate ? 'repo-template' : 'html',
    businessName: answers.businessName || '',
    industry: answers.industry || '',
    targetAudience: answers.audience || '',
    offer: answers.offer || '',
    brandTone: answers.tone || '',
    colors: answers.colors || '',
    stylePreferences: answers.stylePreferences || '',
    pages: answers.pages || '',
    contact: answers.contact || '',
    domainPreference: answers.domain || '',
  });

  const handleGenerateAndContinue = async () => {
    if (generating) return;
    if (!minRequired) {
      setGenError('Please answer business name, industry, and products/services first.');
      return;
    }
    if (!isRepoTemplate && (!isHtml || tplPages.length === 0)) {
      setGenError('This template is not ready for RoxanneAI generation yet. Choose Pulse Works or Forge.');
      return;
    }

    setGenerating(true);
    setGenError(null);

    try {
      const siteProfile = buildSiteProfile();
      const tailored = [];

      if (isRepoTemplate) {
        const record = await createSiteFromTailoredTemplate(templateId, siteProfile, [], {
          siteName: siteProfile.businessName,
          slug: slugify(siteProfile.businessName || templateId),
        });
        await prepareTemplateHostingSite(record.siteId, {
          answers: siteProfile,
          siteName: siteProfile.businessName,
          slug: slugify(siteProfile.businessName || templateId),
        });
        try {
          await aiEditTemplateHostingSite(record.siteId, {
            answers: siteProfile,
            siteName: siteProfile.businessName,
            slug: slugify(siteProfile.businessName || templateId),
          });
        } catch {
          // Deterministic questionnaire merge still creates a deployable copy when AI is unavailable.
        }
        navigate({
          view: 'builder-deployment-settings',
          params: {
            siteId: record.siteId,
            templateId,
            templateType: 'repo-template',
            tailored: true,
          },
        });
        return;
      }

      for (const page of tplPages) {
        const result = await generateTailoredTemplate(templateId, page.html || '', siteProfile);
        const tailoredHtml = result?.pages?.[0]?.html || page.html || '';
        tailored.push({
          title: page.title || 'Home',
          path: page.path || '/',
          html: tailoredHtml,
        });
      }

      const record = await createSiteFromTailoredTemplate(templateId, siteProfile, tailored);
      navigate({
        view: 'builder-deployment-settings',
        params: {
          siteId: record.siteId,
          templateId,
          templateType: 'html',
          tailored: true,
        },
      });
    } catch (err) {
      setGenError(err.message || 'RoxanneAI could not generate the copied template. Please try again.');
      setGenerating(false);
    }
  };

  if (generating) {
    return <RoxanneGeneratingLoader templateName={template?.name || templateId} />;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <a className="page-eyebrow" href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'builder-templates' }); }}>
            Site builder / Templates
          </a>
          <h1>RoxanneAI setup for {template?.name || templateId}</h1>
          <p className="sub">
            Answer the editing questions. RoxanneAI will create a copied template draft, customize it, and send you to Hosting handoff.
          </p>
        </div>
        <div className="actions">
          <button className="btn btn-outline" onClick={() => navigate({ view: 'builder-templates' })}>← Back to templates</button>
        </div>
      </div>

      <div className="ai-intake-layout">
        <aside className="ai-intake-sidebar">
          <div className="ai-intake-sidebar-section">
            <div className="label">Parent template</div>
            <div className="ai-intake-tpl-name">{template?.name || templateId}</div>
            {template?.tagline && <div className="ai-intake-tpl-tag">{template.tagline}</div>}
          </div>

          <div className="ai-intake-sidebar-section">
            <div className="label" style={{ marginBottom: 8 }}>Structured JSON data</div>
            <div className="ai-intake-answers">
              {QUESTIONS.map(q => (
                <div key={q.key} className={`ai-intake-answer-row${answers[q.key] ? ' filled' : ''}`}>
                  <span className="ai-intake-answer-label">{q.label}</span>
                  <span className="ai-intake-answer-value">{answers[q.key] || '—'}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="ai-intake-sidebar-actions">
            <div className="ai-intake-progress">
              <div className="ai-intake-progress-bar" style={{ width: `${Math.round((Math.min(step, QUESTIONS.length) / QUESTIONS.length) * 100)}%` }} />
            </div>
            <div className="faint" style={{ fontSize: 12, marginBottom: 10 }}>
              {Math.min(step, QUESTIONS.length)} of {QUESTIONS.length} questions
            </div>
            <button className="btn btn-primary" onClick={handleGenerateAndContinue} disabled={!complete || !minRequired} title={!complete ? 'Finish the questions first' : !minRequired ? 'Business name, industry, and offer are required' : ''}>
              <ICN.Sparkles size={14} /> Generate with RoxanneAI
            </button>
            {genError && <div className="ai-intake-error">{genError}</div>}
          </div>
        </aside>

        <div className="ai-intake-chat">
          <div className="ai-intake-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`ai-intake-msg ai-intake-msg--${msg.role}`}>
                {msg.role === 'ai' && <div className="ai-intake-avatar"><ICN.Sparkles size={13} /></div>}
                <div className="ai-intake-bubble">
                  {msg.text.split('\n').map((line, j, arr) => (
                    <React.Fragment key={j}>{line}{j < arr.length - 1 && <br />}</React.Fragment>
                  ))}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {!complete ? (
            <form className="ai-intake-input-row" onSubmit={handleSubmit}>
              <input ref={inputRef} className="input" value={input} onChange={e => setInput(e.target.value)} placeholder={QUESTIONS[step]?.question || 'Type your answer…'} />
              <button type="submit" className="btn btn-primary"><ICN.ArrowRight size={14} /></button>
              <button type="button" className="btn btn-ghost" onClick={() => sendAnswer('')} title="Skip this question">Skip</button>
            </form>
          ) : (
            <div className="ai-intake-complete-bar">
              <span className="faint" style={{ fontSize: 13 }}>All questions answered. Generate the copied site to continue to Hosting handoff.</span>
              <button className="btn btn-primary" onClick={handleGenerateAndContinue} disabled={!minRequired}>
                <ICN.Sparkles size={14} /> Generate with RoxanneAI
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function slugify(value) { return String(value || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site'; }
