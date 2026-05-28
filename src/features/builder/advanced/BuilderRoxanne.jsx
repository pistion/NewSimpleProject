// BuilderRoxanne.jsx — AI-assisted site generation (advanced/internal flow).
import React, { useState as useStateB } from 'react';
import { ICN } from '../../../icons';
import { useTemplates } from '../../../use-templates';
import { createBuilderSite, saveBuilderPage, getStoredAuth } from '../../../api';

const ROXANNE_IMAGE = "/images/roxanne-ai-card.png";

function AiSiteGeneratingLoader({ businessName, pages }) {
  const letters = 'Generating'.split('');
  const pageList = pages?.length ? pages.join(', ') : 'site pages';
  return (
    <div className="ai-site-loader-card" aria-live="polite" aria-busy="true">
      <div className="ai-site-loader-copy">
        <div className="eyebrow">RoxanneAI is building</div>
        <h2>{businessName?.trim() || 'Your site draft'}</h2>
        <p>{pageList}</p>
      </div>
      <div className="loader-wrapper ai-site-loader-wrapper" aria-label="Generating site draft">
        {letters.map((letter, index) => (
          <span className="loader-letter" key={`${letter}-${index}`}>{letter}</span>
        ))}
        <div className="loader" />
      </div>
      <div className="ai-site-loader-steps">
        <span>Structuring pages</span>
        <span>Writing first-pass content</span>
        <span>Preparing the editor</span>
      </div>
    </div>
  );
}

function waitForMinimumLoaderTime(startedAt, minimumMs = 1200) {
  const remaining = minimumMs - (Date.now() - startedAt);
  return remaining > 0 ? new Promise((resolve) => setTimeout(resolve, remaining)) : Promise.resolve();
}

export function BuilderRoxanne({ navigate }) {
  const { templates } = useTemplates();
  const [prompt, setPrompt] = useStateB('');
  const [bizName, setBizName] = useStateB('');
  const [tone, setTone] = useStateB('Professional');
  const [pages, setPages] = useStateB(['Home', 'About', 'Contact']);
  const [generating, setGenerating] = useStateB(false);
  const [genError, setGenError] = useStateB(null);
  const PAGE_OPTIONS = ['Home', 'About', 'Services', 'Contact', 'Blog', 'Pricing', 'Portfolio'];

  const togglePage = (p) => setPages(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  const handleGenerate = async () => {
    if (!bizName.trim()) { setGenError('Enter a business name to continue.'); return; }
    const { accessToken } = getStoredAuth();
    if (!accessToken) { setGenError('Sign in to generate a draft.'); return; }
    const startedAt = Date.now();
    setGenerating(true); setGenError(null);

    try {
      const tpl = templates[0];
      const site = await createBuilderSite({ name: bizName.trim(), templateId: tpl?.id });

      if (site?.pages?.[0]?.id) {
        await saveBuilderPage(site.id, site.pages[0].id, {
          siteName: bizName.trim(),
          tagline: `${bizName.trim()} — ${tone.toLowerCase()} · trusted · results-driven`,
          heroLede: prompt.trim() || `We are ${bizName.trim()}, committed to excellence and delivering real value.`,
          ctaLabel: 'Get in touch',
          features: [
            { title: 'Our mission', body: `${bizName.trim()} exists to serve and grow with you.` },
            { title: 'What we do', body: prompt.trim().slice(0, 120) || 'World-class service tailored to your needs.' },
            { title: 'Why choose us', body: `Trusted by clients who value ${tone.toLowerCase()} results.` },
          ],
          aboutHeading: `About ${bizName.trim()}`,
          about: prompt.trim() || `${bizName.trim()} is a ${tone.toLowerCase()} business dedicated to its clients.`,
          contactHeading: 'Say hello',
          contactEmail: '', contactPhone: '', contactAddress: '',
        });
      }
      await waitForMinimumLoaderTime(startedAt);
      navigate({ view: 'builder-editor', params: { id: tpl?.id, siteId: site.id } });
    } catch (err) {
      setGenError(err.message || 'Generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <a className="page-eyebrow" href="#" onClick={(e) => { e.preventDefault(); navigate({ view: "builder-gallery" }); }}>
            Back to site builder
          </a>
          <h1>Build with RoxanneAI</h1>
          <p className="sub">Give RoxanneAI the business, audience, pages, and tone. Glondia will turn it into an editable site draft.</p>
        </div>
      </div>

      <div className="builder-start-split">
        <div className={`card builder-prompt-panel ${generating ? 'builder-prompt-panel--generating' : ''}`}>
          <div className="label">What should RoxanneAI build?</div>
          <textarea className="input builder-prompt-input" rows={8} value={prompt} onChange={(e) => setPrompt(e.target.value)}
            disabled={generating}
            placeholder="A consulting website for a financial advisory team with Home, Services, About, and Contact pages..." />
          <div className="grid-2" style={{ gap: 12 }}>
            <input className="input" placeholder="Business name *" value={bizName} onChange={(e) => setBizName(e.target.value)} disabled={generating} required />
            <select className="select" value={tone} onChange={(e) => setTone(e.target.value)} disabled={generating}>
              {['Professional', 'Luxury', 'Friendly', 'Minimal', 'Bold', 'Creative'].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <div className="label" style={{ marginBottom: 8 }}>Pages to include</div>
            <div className="row wrap" style={{ gap: 8 }}>
              {PAGE_OPTIONS.map(p => (
                <button key={p} type="button"
                  className="btn btn-sm"
                  onClick={() => togglePage(p)}
                  disabled={generating}
                  style={{
                    border: `1px solid ${pages.includes(p) ? "var(--accent)" : "var(--border)"}`,
                    background: pages.includes(p) ? "var(--accent-soft)" : "var(--bg-elev)",
                    color: pages.includes(p) ? "var(--accent-ink)" : "var(--text)",
                    fontWeight: 500,
                  }}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          {genError && <div style={{ color: "var(--danger)", fontSize: 13 }}>{genError}</div>}
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 4 }}>
            <button className="btn btn-outline" onClick={() => navigate({ view: "builder-gallery" })} disabled={generating}>Cancel</button>
            <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
              <ICN.Sparkles size={14} /> {generating ? "Building pages..." : "Generate draft"}
            </button>
          </div>
        </div>

        {generating ? (
          <AiSiteGeneratingLoader businessName={bizName} pages={pages} />
        ) : (
          <div className="roxanne-showcase">
            <img src={ROXANNE_IMAGE} alt="RoxanneAI" />
          </div>
        )}
      </div>
    </>
  );
}
