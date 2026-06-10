/**
 * TemplateConfigurator.jsx
 *
 * Multi-step wizard that collects all client configuration for a template,
 * uses AI to assist/auto-fill fields, then submits to:
 *   POST /api/template-ai/deploy
 *
 * Which generates the site via OpenAI, pushes to GitHub, and returns
 * a pre-filled Render deploy config for the user to review and click Deploy.
 *
 * Steps:
 *   1 — Business Basics   (manual: name, email, location, logo)
 *   2 — Your Offer        (AI-assisted: offer, audience, tagline)
 *   3 — Pages & Nav       (select which pages to include)
 *   4 — Products          (up to 4 products with name, spec/tag, price)
 *   5 — Branding          (AI-assisted: colours, style mood)
 *   6 — Review & Generate
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AiInputField } from './AiInputField.jsx';
import { useAiAssist }  from './useAiAssist.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
const STEPS    = ['Basics', 'Offer', 'Pages', 'Products', 'Branding', 'Review'];

const EMPTY_PRODUCT = { name: '', spec: '', price: '' };

function slugify(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── Step components ───────────────────────────────────────────────────────────

function StepBasics({ config, setConfig }) {
  return (
    <div className="wizard-step">
      <h2>Tell us about your business</h2>
      <p className="wizard-step-sub">These fields are required and set by you — no AI here.</p>

      <div className="field-group">
        <label htmlFor="businessName">Business Name *</label>
        <input
          id="businessName"
          className="glondia-input"
          value={config.businessName || ''}
          onChange={(e) => setConfig((p) => ({ ...p, businessName: e.target.value, slug: slugify(e.target.value) }))}
          placeholder="e.g. Summit Gear Co."
          required
        />
      </div>

      <div className="field-group">
        <label htmlFor="contactEmail">Contact Email *</label>
        <input
          id="contactEmail"
          className="glondia-input"
          type="email"
          value={config.contactEmail || ''}
          onChange={(e) => setConfig((p) => ({ ...p, contactEmail: e.target.value }))}
          placeholder="hello@yourbusiness.com"
          required
        />
      </div>

      <div className="field-group">
        <label htmlFor="location">Location</label>
        <input
          id="location"
          className="glondia-input"
          value={config.location || ''}
          onChange={(e) => setConfig((p) => ({ ...p, location: e.target.value }))}
          placeholder="e.g. Port Moresby, Papua New Guinea"
        />
      </div>

      <div className="field-group">
        <label htmlFor="industry">Industry / Niche *</label>
        <input
          id="industry"
          className="glondia-input"
          value={config.industry || ''}
          onChange={(e) => setConfig((p) => ({ ...p, industry: e.target.value }))}
          placeholder="e.g. Outdoor gear, fashion drops, tech accessories"
          required
        />
      </div>

      <div className="field-group">
        <label>Logo</label>
        <div className="logo-upload-area">
          {config.logoDataUrl ? (
            <div className="logo-preview">
              <img src={config.logoDataUrl} alt="Logo preview" />
              <button type="button" className="btn-sm btn-ghost" onClick={() => setConfig((p) => ({ ...p, logoDataUrl: null, logoFileName: null }))}>
                Remove
              </button>
            </div>
          ) : (
            <label className="logo-upload-dropzone">
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => setConfig((p) => ({ ...p, logoDataUrl: ev.target.result, logoFileName: file.name }));
                  reader.readAsDataURL(file);
                }}
              />
              <span className="upload-icon">🖼</span>
              <span>Click to upload logo (PNG, SVG, JPG)</span>
            </label>
          )}
        </div>
        <p className="field-hint">Optional — AI will generate a placeholder if not provided.</p>
      </div>

      <div className="field-group">
        <label htmlFor="slug">Site Slug (URL)</label>
        <input
          id="slug"
          className="glondia-input"
          value={config.slug || ''}
          onChange={(e) => setConfig((p) => ({ ...p, slug: slugify(e.target.value) }))}
          placeholder="Auto-generated from business name"
        />
        <p className="field-hint">Your site will be at <code>{config.slug || 'your-site'}.glondia.app</code></p>
      </div>
    </div>
  );
}

function StepOffer({ config, setConfig, aiProps }) {
  return (
    <div className="wizard-step">
      <h2>Your offer &amp; audience</h2>
      <p className="wizard-step-sub">AI can help you write these. Type a draft or click ✨ AI Assist.</p>

      <AiInputField
        fieldName="offer"
        label="Main Offer"
        value={config.offer || ''}
        onChange={(v) => setConfig((p) => ({ ...p, offer: v }))}
        placeholder="What's your main product or service promise?"
        aiAssisted
        hint="e.g. 'The best waterproof alpine gear in the Pacific.'"
        {...aiProps}
      />

      <AiInputField
        fieldName="audience"
        label="Target Audience"
        value={config.audience || ''}
        onChange={(v) => setConfig((p) => ({ ...p, audience: v }))}
        placeholder="Who is your customer?"
        aiAssisted
        hint="e.g. 'Outdoor adventurers in PNG and the Pacific.'"
        {...aiProps}
      />

      <AiInputField
        fieldName="tagline"
        label="Brand Tagline"
        value={config.tagline || ''}
        onChange={(v) => setConfig((p) => ({ ...p, tagline: v }))}
        placeholder="Short, punchy brand line — max 8 words"
        aiAssisted
        hint="e.g. 'Built for the tenth season.'"
        {...aiProps}
      />

      <AiInputField
        fieldName="aboutText"
        label="About Us (short)"
        type="textarea"
        value={config.aboutText || ''}
        onChange={(v) => setConfig((p) => ({ ...p, aboutText: v }))}
        placeholder="2-3 sentences about your brand story"
        aiAssisted
        hint="Used in footer and about sections."
        {...aiProps}
      />
    </div>
  );
}

function StepPages({ config, setConfig, templateConfig }) {
  const supportedPages = templateConfig?.supportedPages || [];

  function togglePage(pagePath) {
    const current  = config.selectedPages || supportedPages.map((p) => p.path);
    const updated  = current.includes(pagePath)
      ? current.filter((p) => p !== pagePath)
      : [...current, pagePath];
    setConfig((prev) => ({ ...prev, selectedPages: updated }));
  }

  const selected = config.selectedPages || supportedPages.map((p) => p.path);

  return (
    <div className="wizard-step">
      <h2>Pages &amp; Navigation</h2>
      <p className="wizard-step-sub">Choose which pages to include. Home is always included.</p>

      <div className="pages-grid">
        {supportedPages.map((page) => {
          const isHome    = page.path === '/';
          const isSelected = selected.includes(page.path);
          return (
            <button
              key={page.path}
              type="button"
              className={`page-toggle ${isSelected ? 'selected' : ''} ${isHome ? 'locked' : ''}`}
              onClick={() => !isHome && togglePage(page.path)}
              disabled={isHome}
            >
              <span className="page-toggle-icon">{isSelected ? '✓' : '+'}</span>
              <span className="page-toggle-label">{page.title}</span>
              <span className="page-toggle-path">{page.path}</span>
            </button>
          );
        })}
      </div>

      <p className="field-hint">{selected.length} page{selected.length !== 1 ? 's' : ''} selected. Nav links will be generated automatically.</p>
    </div>
  );
}

function StepProducts({ config, setConfig }) {
  const products = config.products || [{ ...EMPTY_PRODUCT }, { ...EMPTY_PRODUCT }, { ...EMPTY_PRODUCT }, { ...EMPTY_PRODUCT }];

  function updateProduct(index, field, value) {
    const updated = products.map((p, i) => i === index ? { ...p, [field]: value } : p);
    setConfig((prev) => ({ ...prev, products: updated }));
  }

  return (
    <div className="wizard-step">
      <h2>Your products</h2>
      <p className="wizard-step-sub">Add up to 4 featured products. AI will generate realistic placeholders for any you leave blank.</p>

      {products.map((product, i) => (
        <div key={i} className="product-row">
          <span className="product-num">0{i + 1}</span>
          <div className="product-fields">
            <input
              className="glondia-input"
              placeholder="Product name"
              value={product.name}
              onChange={(e) => updateProduct(i, 'name', e.target.value)}
            />
            <input
              className="glondia-input"
              placeholder="Spec / tag (e.g. Waterproof / 28K)"
              value={product.spec}
              onChange={(e) => updateProduct(i, 'spec', e.target.value)}
            />
            <input
              className="glondia-input"
              placeholder="Price (e.g. $240)"
              value={product.price}
              onChange={(e) => updateProduct(i, 'price', e.target.value)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function StepBranding({ config, setConfig, aiProps }) {
  const MOODS = ['Bold & Dark', 'Light & Minimal', 'Earthy & Warm', 'Neon & Electric', 'Corporate & Clean', 'Editorial & Fashion'];

  return (
    <div className="wizard-step">
      <h2>Branding &amp; Style</h2>
      <p className="wizard-step-sub">Choose a mood and accent colour. AI will suggest a palette.</p>

      <div className="field-group">
        <label>Style Mood</label>
        <div className="mood-grid">
          {MOODS.map((mood) => (
            <button
              key={mood}
              type="button"
              className={`mood-btn ${config.mood === mood ? 'selected' : ''}`}
              onClick={() => setConfig((p) => ({ ...p, mood }))}
            >
              {mood}
            </button>
          ))}
        </div>
      </div>

      <div className="field-group">
        <label htmlFor="accentColor">Accent Colour</label>
        <div className="color-row">
          <input
            id="accentColor"
            type="color"
            value={config.accentColor || '#d4ff3a'}
            onChange={(e) => setConfig((p) => ({ ...p, accentColor: e.target.value }))}
            className="color-picker"
          />
          <span className="color-value">{config.accentColor || '#d4ff3a'}</span>
          <button
            type="button"
            className={`ai-assist-btn ${aiProps.loadingFields?.colourSuggestion ? 'loading' : ''}`}
            onClick={() => aiProps.triggerAssist?.('colourSuggestion', config.mood || config.industry)}
            disabled={aiProps.loadingFields?.colourSuggestion}
          >
            {aiProps.loadingFields?.colourSuggestion ? '⏳ Thinking…' : '✨ Suggest palette'}
          </button>
        </div>
        {aiProps.suggestions?.colourSuggestion && (
          <div className="ai-suggestion">
            <p className="ai-suggestion-label">✨ AI palette suggestion</p>
            <pre className="ai-suggestion-text">{aiProps.suggestions.colourSuggestion}</pre>
            <div className="ai-suggestion-actions">
              <button type="button" className="ai-suggestion-accept" onClick={() => {
                try {
                  const parsed = JSON.parse(aiProps.suggestions.colourSuggestion);
                  setConfig((p) => ({ ...p, accentColor: parsed.accent || p.accentColor, aiPalette: parsed }));
                } catch { /* ignore parse error */ }
                aiProps.dismissSuggestion?.('colourSuggestion');
              }}>Apply palette</button>
              <button type="button" className="ai-suggestion-dismiss" onClick={() => aiProps.dismissSuggestion?.('colourSuggestion')}>Dismiss</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StepReview({ config, templateConfig, onCleanAll, isCleaning, onDeploy, isDeploying, deployResult }) {
  if (deployResult) {
    return (
      <div className="wizard-step deploy-result">
        <div className="deploy-success-badge">✓ Generated &amp; pushed to GitHub</div>
        <h2>Your site is ready to deploy</h2>
        <p>Review the config below and click <strong>Deploy to Render</strong> to go live.</p>

        <div className="deploy-config-card">
          <div className="config-row"><span>Site name</span><code>{deployResult.renderConfig?.name}</code></div>
          <div className="config-row"><span>GitHub repo</span><a href={deployResult.github?.githubUrl} target="_blank" rel="noreferrer">{deployResult.github?.githubUrl}</a></div>
          <div className="config-row"><span>Branch</span><code>{deployResult.renderConfig?.branch}</code></div>
          <div className="config-row"><span>Root directory</span><code>{deployResult.renderConfig?.rootDir}</code></div>
          <div className="config-row"><span>Build command</span><code>{deployResult.renderConfig?.buildCommand}</code></div>
          <div className="config-row"><span>Publish dir</span><code>{deployResult.renderConfig?.publishDir}</code></div>
        </div>

        <a
          href={`/hosting?prefill=${encodeURIComponent(JSON.stringify(deployResult.renderConfig))}`}
          className="btn-deploy"
        >
          Deploy to Render →
        </a>

        <p className="deploy-note">
          You can make manual changes in the Render dashboard. If the deploy fails, diagnose it there.
        </p>
      </div>
    );
  }

  return (
    <div className="wizard-step">
      <h2>Review &amp; Generate</h2>
      <p className="wizard-step-sub">Everything looks good? Clean up with AI, then generate your site.</p>

      <div className="review-grid">
        <div className="review-section">
          <h3>Business</h3>
          <p><b>Name:</b> {config.businessName}</p>
          <p><b>Email:</b> {config.contactEmail}</p>
          <p><b>Location:</b> {config.location || '—'}</p>
          <p><b>Industry:</b> {config.industry}</p>
          <p><b>Slug:</b> {config.slug}</p>
          {config.logoDataUrl && <p><b>Logo:</b> <img src={config.logoDataUrl} alt="" style={{ height: 32, verticalAlign: 'middle' }} /></p>}
        </div>
        <div className="review-section">
          <h3>Content</h3>
          <p><b>Offer:</b> {config.offer || '—'}</p>
          <p><b>Audience:</b> {config.audience || '—'}</p>
          <p><b>Tagline:</b> {config.tagline || '—'}</p>
          <p><b>Template:</b> {templateConfig?.name}</p>
          <p><b>Pages:</b> {(config.selectedPages || []).join(', ')}</p>
        </div>
        <div className="review-section">
          <h3>Products</h3>
          {(config.products || []).filter((p) => p.name).map((p, i) => (
            <p key={i}><b>{p.name}</b> — {p.spec} — {p.price}</p>
          ))}
          {!(config.products || []).some((p) => p.name) && <p className="muted">AI will generate products based on your industry.</p>}
        </div>
        <div className="review-section">
          <h3>Branding</h3>
          <p><b>Mood:</b> {config.mood || '—'}</p>
          <p><b>Accent:</b> <span className="color-swatch" style={{ background: config.accentColor || '#d4ff3a' }} /> {config.accentColor || '#d4ff3a'}</p>
        </div>
      </div>

      <div className="review-actions">
        <button type="button" className="btn-clean" onClick={onCleanAll} disabled={isCleaning || isDeploying}>
          {isCleaning ? '⏳ Cleaning…' : '✨ Clean up all with AI'}
        </button>
        <button type="button" className="btn-generate" onClick={onDeploy} disabled={isDeploying || isCleaning}>
          {isDeploying ? '⏳ Generating & pushing to GitHub…' : '🚀 Generate & Push to GitHub'}
        </button>
      </div>

      {isDeploying && (
        <div className="deploy-progress">
          <div className="deploy-progress-bar" />
          <p>OpenAI is building your site… this takes 20–40 seconds.</p>
        </div>
      )}
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

export function TemplateConfigurator({ templateId = 'forge', onClose }) {
  const [step, setStep]                 = useState(0);
  const [config, setConfig]             = useState({ templateId });
  const [templateConfig, setTemplateConfig] = useState(null);
  const [loadingConfig, setLoadingConfig]   = useState(true);
  const [isCleaning, setIsCleaning]     = useState(false);
  const [isDeploying, setIsDeploying]   = useState(false);
  const [deployResult, setDeployResult] = useState(null);
  const [globalError, setGlobalError]   = useState(null);

  // Load template config (pages, sections, hints)
  useEffect(() => {
    setLoadingConfig(true);
    fetch(`${API_BASE}/template-ai/config/${templateId}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setTemplateConfig(d.config); })
      .catch(() => {})
      .finally(() => setLoadingConfig(false));
  }, [templateId]);

  // AI assist hook — passes all current config as context
  const getContext = useCallback((excludeField) => {
    const ctx = {};
    for (const [k, v] of Object.entries(config)) {
      if (k !== excludeField && typeof v === 'string') ctx[k] = v;
    }
    return ctx;
  }, [config]);

  const aiAssist = useAiAssist({ templateId, getContext });

  const aiProps = {
    suggestions      : aiAssist.suggestions,
    loadingFields    : aiAssist.loadingFields,
    errors           : aiAssist.errors,
    onFieldChange    : aiAssist.onFieldChange,
    triggerAssist    : aiAssist.triggerAssist,
    acceptSuggestion : aiAssist.acceptSuggestion,
    dismissSuggestion: aiAssist.dismissSuggestion
  };

  async function handleCleanAll() {
    setIsCleaning(true);
    try {
      const resp = await fetch(`${API_BASE}/template-ai/clean`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body   : JSON.stringify({ config, templateId })
      });
      const data = await resp.json();
      if (data.ok && data.cleaned) setConfig(data.cleaned);
    } catch (err) {
      setGlobalError('AI cleanup failed. Your data is unchanged.');
    } finally {
      setIsCleaning(false);
    }
  }

  async function handleDeploy() {
    if (!config.businessName) return setGlobalError('Business name is required.');
    if (!config.contactEmail) return setGlobalError('Contact email is required.');
    setIsDeploying(true);
    setGlobalError(null);
    try {
      const resp = await fetch(`${API_BASE}/template-ai/deploy`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body   : JSON.stringify({ templateId, clientConfig: config })
      });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error || 'Deploy failed.');
      setDeployResult(data);
      setStep(5); // jump to review/result
    } catch (err) {
      setGlobalError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsDeploying(false);
    }
  }

  if (loadingConfig) {
    return (
      <div className="template-configurator loading">
        <div className="spinner" />
        <p>Loading template…</p>
      </div>
    );
  }

  const canProceed = () => {
    if (step === 0) return config.businessName && config.contactEmail && config.industry;
    return true;
  };

  return (
    <div className="template-configurator">
      {/* Header */}
      <div className="wizard-header">
        <div className="wizard-header-meta">
          <span className="wizard-template-badge">{templateConfig?.name || templateId}</span>
          <h1 className="wizard-title">Configure your site</h1>
        </div>
        {onClose && (
          <button type="button" className="wizard-close" onClick={onClose}>✕</button>
        )}
      </div>

      {/* Step progress */}
      <div className="wizard-steps-bar">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            className={`wizard-step-tab ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
            onClick={() => i < step && setStep(i)}
          >
            <span className="step-num">{i < step ? '✓' : i + 1}</span>
            <span className="step-label">{label}</span>
          </button>
        ))}
      </div>

      {/* Step content */}
      <div className="wizard-body">
        {globalError && (
          <div className="wizard-error">{globalError} <button onClick={() => setGlobalError(null)}>✕</button></div>
        )}

        {step === 0 && <StepBasics    config={config} setConfig={setConfig} />}
        {step === 1 && <StepOffer     config={config} setConfig={setConfig} aiProps={aiProps} />}
        {step === 2 && <StepPages     config={config} setConfig={setConfig} templateConfig={templateConfig} />}
        {step === 3 && <StepProducts  config={config} setConfig={setConfig} />}
        {step === 4 && <StepBranding  config={config} setConfig={setConfig} aiProps={aiProps} />}
        {step === 5 && (
          <StepReview
            config={config}
            templateConfig={templateConfig}
            onCleanAll={handleCleanAll}
            isCleaning={isCleaning}
            onDeploy={handleDeploy}
            isDeploying={isDeploying}
            deployResult={deployResult}
          />
        )}
      </div>

      {/* Footer nav */}
      {step < 5 && (
        <div className="wizard-footer">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            ← Back
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setStep((s) => Math.min(5, s + 1))}
            disabled={!canProceed()}
          >
            {step === 4 ? 'Review →' : 'Next →'}
          </button>
        </div>
      )}
    </div>
  );
}
