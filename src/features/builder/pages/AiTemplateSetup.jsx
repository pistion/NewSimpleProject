// AiTemplateSetup.jsx — AI-guided website setup chat before deployment.
// Flow: Template gallery → preview modal → "Use AI to customize" → here → deployment settings.
import React, { useState, useEffect, useRef } from 'react'; // useRef kept for chatEndRef / inputRef
import { ICN } from '../../../icons';
import { GD } from '../../../data';
import { generateTailoredTemplate, createSiteFromTailoredTemplate } from '../../../api/template-ai.js';

// ─── Intake question sequence (client-side; mirrors the backend list) ─────────
const QUESTIONS = [
  { key: 'businessName',   label: 'Business name',    question: "What's your business or website name?" },
  { key: 'industry',       label: 'Industry',          question: 'What industry or sector are you in? (e.g. Fashion, Finance, Food, Technology)' },
  { key: 'audience',       label: 'Target audience',   question: 'Who is your target audience?' },
  { key: 'offer',          label: 'Products/services', question: 'What are your main products or services? A one or two sentence summary works great.' },
  { key: 'tone',           label: 'Brand tone',        question: 'How would you describe your brand tone? (e.g. Professional, Friendly, Bold, Luxury, Minimal)' },
  { key: 'colors',         label: 'Brand colours',     question: 'Any specific brand colours? Share hex codes or describe them — or type "keep existing" to keep the template palette.' },
  { key: 'contactEmail',   label: 'Contact email',     question: 'Contact email address? (press Enter or type "skip" to leave blank)' },
  { key: 'contactPhone',   label: 'Contact phone',     question: 'Contact phone number? (press Enter or type "skip" to leave blank)' },
  { key: 'contactAddress', label: 'Business address',  question: 'Business address? (press Enter or type "skip" to leave blank)' },
  { key: 'pages',          label: 'Pages needed',      question: 'Which pages do you need? (e.g. Home, About, Services, Contact, Blog)' },
  { key: 'domain',         label: 'Domain preference', question: 'Do you have a preferred domain name? (optional — press Enter to skip)' },
];

const REQUIRED_KEYS = ['businessName', 'industry', 'offer'];

const GREETING_LINES = [
  "Hi! I'm here to help you set up your website before it goes live.",
  "I'll ask a few quick questions about your business — this usually takes about 2 minutes — then tailor the template to match your brand.",
  "Let's start:",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isSkip(value) {
  return !value || value.trim().toLowerCase() === 'skip';
}

// ─── Components ───────────────────────────────────────────────────────────────

/** Scaled iframe showing template HTML read-only */
function TailoredPreviewPane({ pages, initialPage }) {
  const [activePage, setActivePage] = useState(initialPage || pages[0] || null);

  return (
    <div className="ai-intake-preview-pane">
      {pages.length > 1 && (
        <div className="ai-intake-preview-pages">
          {pages.map((page, i) => (
            <button
              key={i}
              className={`btn btn-sm ${activePage === page ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActivePage(page)}
            >
              {page.title || `Page ${i + 1}`}
            </button>
          ))}
        </div>
      )}
      <iframe
        sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
        srcDoc={activePage?.html || '<!doctype html><html><body></body></html>'}
        className="ai-intake-preview-iframe"
        title="Tailored site preview"
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function BuilderAiIntake({ templateId, templateType, navigate }) {
  // Template lookup
  const template = GD.templates.find(t => t.id === templateId) || null;
  const isHtml   = template?.contentJson?._source === 'html-template' || templateType === 'html';
  const tplPages = Array.isArray(template?.contentJson?.pages) ? template.contentJson.pages : [];

  // Chat state
  const [messages, setMessages] = useState(() => [
    ...GREETING_LINES.map(text => ({ role: 'ai', text })),
    { role: 'ai', text: QUESTIONS[0].question, questionKey: QUESTIONS[0].key },
  ]);
  const [step, setStep]     = useState(0);
  const [input, setInput]   = useState('');
  const [answers, setAnswers] = useState({});

  // Generation state
  const [generating,     setGenerating]     = useState(false);
  const [tailoredPages,  setTailoredPages]  = useState(null);
  const [genError,       setGenError]       = useState(null);
  const [showPreview,    setShowPreview]    = useState(false);
  const [siteId,         setSiteId]         = useState(null);

  const chatEndRef = useRef(null);
  const inputRef   = useRef(null);

  const complete    = step >= QUESTIONS.length;
  const minRequired = REQUIRED_KEYS.every(k => answers[k]?.trim());

  // Scroll to latest message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Re-focus input after each AI reply
  useEffect(() => {
    if (!complete) inputRef.current?.focus();
  }, [step, complete]);

  // ── Send answer / advance question ─────────────────────────────────────────
  const sendAnswer = (text) => {
    const currentQ  = QUESTIONS[step];
    if (!currentQ) return;
    const rawValue  = text.trim();
    const value     = isSkip(rawValue) ? '' : rawValue;
    const display   = rawValue || '(skip)';

    const newAnswers = { ...answers, [currentQ.key]: value };
    setAnswers(newAnswers);

    const nextStep = step + 1;
    const nextQ    = QUESTIONS[nextStep];

    const aiReply = nextQ
      ? { role: 'ai', text: nextQ.question, questionKey: nextQ.key }
      : {
          role: 'ai',
          text: minRequired || REQUIRED_KEYS.every(k => newAnswers[k]?.trim())
            ? `Great — I have everything I need to tailor the template for **${newAnswers.businessName || 'your business'}**.\n\nClick "Preview tailored site" when you're ready, or "Continue to deployment settings" to skip straight to hosting.`
            : `Almost there. I still need your business name, industry, and what you offer before I can tailor the template.\n\nFeel free to add any missing details above, or click "Continue to deployment settings" to set up hosting manually.`,
        };

    setMessages(prev => [
      ...prev,
      { role: 'user', text: display },
      aiReply,
    ]);
    setStep(nextStep);
    setInput('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (complete) return;
    sendAnswer(input);
  };

  // ── Generate tailored HTML ──────────────────────────────────────────────────
  const handlePreview = async () => {
    if (!isHtml || tplPages.length === 0) {
      // Storefront or non-HTML template — persist draft then go to deployment settings
      await handleContinueToDeployment();
      return;
    }

    setGenerating(true);
    setGenError(null);
    setMessages(prev => [...prev, {
      role: 'ai',
      text: '⚙️ Tailoring your website — this usually takes 15–30 seconds…',
    }]);

    try {
      // Tailor all pages in sequence
      const tailored = [];
      for (const page of tplPages) {
        const result = await generateTailoredTemplate(templateId, page.html || '', answers);
        const tailoredHtml = result?.pages?.[0]?.html || page.html || '';
        tailored.push({ title: page.title || 'Home', path: page.path || '/', html: tailoredHtml });
      }

      // Persist the tailored site so deployment settings can load it
      let persistedSiteId = null;
      try {
        const record = await createSiteFromTailoredTemplate(templateId, answers, tailored);
        persistedSiteId = record.siteId;
        setSiteId(persistedSiteId);
      } catch {
        // Non-fatal — preview still shows; deployment settings will create a new record if needed
      }

      setTailoredPages(tailored);
      setShowPreview(true);
      setMessages(prev => [...prev, {
        role: 'ai',
        text: `✓ Done! Your tailored site is ready to preview. Click "Deploy this site" to go live, or continue to deployment settings to configure hosting.`,
      }]);
    } catch (err) {
      const msg = err.message || 'Tailoring failed. Please try again.';
      setGenError(msg);
      setMessages(prev => [...prev, { role: 'ai', text: `⚠️ ${msg}` }]);
    } finally {
      setGenerating(false);
    }
  };

  const handleContinueToDeployment = async () => {
    // If we already have a siteId from preview generation, go straight there
    if (siteId) {
      navigate({ view: 'builder-deployment-settings', params: { siteId, templateId, templateType } });
      return;
    }
    // Otherwise persist a draft (with whatever tailored pages we have, or empty) then navigate
    try {
      const record = await createSiteFromTailoredTemplate(
        templateId,
        answers,
        tailoredPages || [],
      );
      setSiteId(record.siteId);
      navigate({ view: 'builder-deployment-settings', params: { siteId: record.siteId, templateId, templateType } });
    } catch {
      // If persistence fails, navigate anyway — deployment settings handles missing siteId gracefully
      navigate({ view: 'builder-deployment-settings', params: { templateId, templateType } });
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="page-head">
        <div>
          <a
            className="page-eyebrow"
            href="#"
            onClick={(e) => { e.preventDefault(); navigate({ view: 'builder-templates' }); }}
          >
            Site builder / Templates
          </a>
          <h1>Set up {template?.name || templateId}</h1>
          <p className="sub">
            Answer a few questions and we'll tailor the template to your brand before you go live.
          </p>
        </div>
        <div className="actions">
          <button className="btn btn-outline" onClick={() => navigate({ view: 'builder-templates' })}>
            ← Back to templates
          </button>
        </div>
      </div>

      <div className={`ai-intake-layout${showPreview ? ' ai-intake-layout--with-preview' : ''}`}>
        {/* ── Left: Summary sidebar ─────────────────────────────────── */}
        <aside className="ai-intake-sidebar">
          <div className="ai-intake-sidebar-section">
            <div className="label">Template</div>
            <div className="ai-intake-tpl-name">{template?.name || templateId}</div>
            {template?.tagline && (
              <div className="ai-intake-tpl-tag">{template.tagline}</div>
            )}
          </div>

          <div className="ai-intake-sidebar-section">
            <div className="label" style={{ marginBottom: 8 }}>Your answers</div>
            <div className="ai-intake-answers">
              {QUESTIONS.map((q) => (
                <div key={q.key} className={`ai-intake-answer-row${answers[q.key] ? ' filled' : ''}`}>
                  <span className="ai-intake-answer-label">{q.label}</span>
                  <span className="ai-intake-answer-value">{answers[q.key] || '—'}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="ai-intake-sidebar-actions">
            <div className="ai-intake-progress">
              <div
                className="ai-intake-progress-bar"
                style={{ width: `${Math.round((step / QUESTIONS.length) * 100)}%` }}
              />
            </div>
            <div className="faint" style={{ fontSize: 12, marginBottom: 10 }}>
              {step} of {QUESTIONS.length} questions
            </div>

            {isHtml && (
              <button
                className="btn btn-primary"
                onClick={handlePreview}
                disabled={generating || !minRequired}
                title={!minRequired ? 'Answer business name, industry, and offer first' : ''}
              >
                {generating
                  ? <><ICN.RefreshCw size={14} /> Tailoring…</>
                  : <><ICN.Eye size={14} /> Preview tailored site</>}
              </button>
            )}

            <button className="btn btn-outline" onClick={handleContinueToDeployment}>
              <ICN.Rocket size={14} /> Continue to deployment settings
            </button>

            {genError && (
              <div className="ai-intake-error">{genError}</div>
            )}
          </div>
        </aside>

        {/* ── Centre: Chat ──────────────────────────────────────────── */}
        <div className="ai-intake-chat">
          <div className="ai-intake-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`ai-intake-msg ai-intake-msg--${msg.role}`}>
                {msg.role === 'ai' && (
                  <div className="ai-intake-avatar">
                    <ICN.Sparkles size={13} />
                  </div>
                )}
                <div className="ai-intake-bubble">
                  {msg.text.split('\n').map((line, j, arr) => (
                    <React.Fragment key={j}>
                      {/* Bold **text** */}
                      {line.replace(/\*\*(.+?)\*\*/g, (_, m) => m)}
                      {j < arr.length - 1 && <br />}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {!complete ? (
            <form className="ai-intake-input-row" onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                className="input"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={QUESTIONS[step]?.question || 'Type your answer…'}
              />
              <button type="submit" className="btn btn-primary" disabled={generating}>
                <ICN.ArrowRight size={14} />
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => sendAnswer('')}
                title="Skip this question"
              >
                Skip
              </button>
            </form>
          ) : (
            <div className="ai-intake-complete-bar">
              <span className="faint" style={{ fontSize: 13 }}>All questions answered.</span>
              {isHtml && (
                <button
                  className="btn btn-primary"
                  onClick={handlePreview}
                  disabled={generating || !minRequired}
                >
                  {generating
                    ? <><ICN.RefreshCw size={14} /> Tailoring…</>
                    : <><ICN.Sparkles size={14} /> Preview tailored site</>}
                </button>
              )}
              <button className="btn btn-outline" onClick={handleContinueToDeployment}>
                <ICN.Rocket size={14} /> Continue to deployment settings
              </button>
            </div>
          )}
        </div>

        {/* ── Right: Tailored preview pane (shown after generation) ─── */}
        {showPreview && tailoredPages && (
          <div className="ai-intake-preview-column">
            <div className="ai-intake-preview-header">
              <div style={{ fontWeight: 600, fontSize: 14 }}>Tailored preview</div>
              <button className="btn btn-sm btn-primary" onClick={handleContinueToDeployment}>
                <ICN.Rocket size={13} /> Deploy this site
              </button>
            </div>
            <TailoredPreviewPane pages={tailoredPages} />
          </div>
        )}
      </div>
    </>
  );
}
