// builder.jsx — Template gallery + simple form editor with live preview
import React, { useState as useStateB } from 'react';
import { ICN } from './icons';
import { GD, TEMPLATES_REPO } from './data';
import { Badge, Tabs, ToggleRow, Empty } from './components';
import { useTemplates } from './use-templates';
import { useSites } from './use-sites';
import { useDomains } from './use-domains';
import {
  createBuilderSite, updateBuilderSite, archiveBuilderSite,
  saveBuilderPage, publishBuilderSite,
  createBuilderPage, deleteBuilderPage, listPageVersions,
  getBuilderSite,
  importBuilderSiteFromGithub,
  parseGithubRepo,
  createRenderDeployment,
  getRenderSettings,
} from './api';
import { STOREFRONT_TEMPLATES, StorefrontPreview, StorefrontModal } from './storefront-templates';

const ROXANNE_IMAGE = "/images/roxanne-ai-card.png";

// ─────────────────────────────────────────────────────────────────────────────
// Template thumbnails — each renders a different small SVG/HTML thumbnail
// based on the motif. Lightweight stand-ins, no real previews.
// ─────────────────────────────────────────────────────────────────────────────

// TplThumb — abstract geometric preview. Shows layout motif using only shapes
// and the template's own accent/surface palette. No fake business content.
function TplThumb({ tpl }) {
  const { accent, surface, motif } = tpl;
  const isDark = surface.startsWith('#0') || surface.startsWith('#1') && parseInt(surface.slice(1), 16) < 0x333333;
  const overlay = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
  const bar = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';

  // ── Layout skeleton helpers ────────────────────────────────────────────────
  const Nav = () => (
    <div style={{ height: 22, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <div style={{ width: 22, height: 22, borderRadius: 4, background: accent, opacity: 0.9 }} />
      <div style={{ flex: 1 }} />
      {[32, 26, 22].map((w, i) => <div key={i} style={{ width: w, height: 7, borderRadius: 99, background: bar }} />)}
    </div>
  );
  const Lines = ({ count = 3, widths = [] }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ height: 7, borderRadius: 99, background: bar, width: widths[i] || (i === count - 1 ? '60%' : '90%') }} />
      ))}
    </div>
  );
  const Pill = ({ label, small }) => (
    <div style={{ display: 'inline-flex', alignItems: 'center', padding: small ? '3px 8px' : '5px 12px', background: accent, color: '#fff', borderRadius: 99, fontSize: small ? 8 : 9, fontWeight: 600, letterSpacing: '0.04em' }}>
      {label}
    </div>
  );

  if (motif === 'monogram') {
    // Personal portfolio — big centered letterform
    return (
      <div style={{ width: '100%', height: '100%', background: surface, display: 'flex', flexDirection: 'column', padding: 14 }}>
        <Nav />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 72, color: accent, opacity: 0.85, lineHeight: 1 }}>G</div>
        </div>
        <Lines count={2} widths={['70%', '45%']} />
      </div>
    );
  }
  if (motif === 'stripes') {
    // Small business — bold header + service list
    return (
      <div style={{ width: '100%', height: '100%', background: surface, padding: 14, display: 'flex', flexDirection: 'column', gap: 0 }}>
        <Nav />
        <div style={{ height: 5, background: accent, width: '100%', marginBottom: 12 }} />
        <div style={{ height: 28, borderRadius: 3, background: overlay, marginBottom: 10 }} />
        {[1,2,3].map(i => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 7 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: accent, flexShrink: 0 }} />
            <div style={{ height: 7, borderRadius: 99, background: bar, flex: 1 }} />
          </div>
        ))}
        <div style={{ marginTop: 'auto' }}><Pill label="Request a quote" small /></div>
      </div>
    );
  }
  if (motif === 'menu') {
    // Restaurant — two-column menu layout
    return (
      <div style={{ width: '100%', height: '100%', background: surface, padding: 14, display: 'flex', flexDirection: 'column' }}>
        <Nav />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[80, 65, 75, 55].map((w, i) => <div key={i} style={{ height: 7, borderRadius: 99, background: bar, width: `${w}%` }} />)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[70, 80, 60, 72].map((w, i) => <div key={i} style={{ height: 7, borderRadius: 99, background: bar, width: `${w}%` }} />)}
          </div>
        </div>
        <div style={{ height: 1, background: overlay, margin: '10px 0' }} />
        <Pill label="Reserve a table" small />
      </div>
    );
  }
  if (motif === 'grid') {
    // Photography — masonry image grid
    return (
      <div style={{ width: '100%', height: '100%', background: surface, padding: 10 }}>
        <Nav />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: '1fr 1.3fr', gap: 5, height: 'calc(100% - 50px)' }}>
          {[0.55,0.45,0.65,0.7,0.5,0.6].map((op, i) => (
            <div key={i} style={{ background: accent, borderRadius: 3, opacity: op }} />
          ))}
        </div>
      </div>
    );
  }
  if (motif === 'blocks') {
    // Agency — editorial case-study layout
    return (
      <div style={{ width: '100%', height: '100%', background: surface, padding: 14, display: 'flex', flexDirection: 'column' }}>
        <Nav />
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ gridColumn: '1 / -1', height: 36, borderRadius: 4, background: `${accent}22` }} />
          {[1,2,3,4].map(i => <div key={i} style={{ borderRadius: 4, background: overlay, minHeight: 24 }} />)}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <div style={{ width: 44, height: 8, borderRadius: 99, background: accent }} />
          <div style={{ width: 44, height: 8, borderRadius: 99, background: bar }} />
        </div>
      </div>
    );
  }
  if (motif === 'lines') {
    // Blog — article list with typographic rhythm
    return (
      <div style={{ width: '100%', height: '100%', background: surface, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Nav />
        {[1,2].map(i => (
          <div key={i} style={{ paddingBottom: 10, borderBottom: `1px solid ${overlay}` }}>
            <div style={{ height: 8, borderRadius: 99, background: accent, opacity: 0.7, width: '80%', marginBottom: 6 }} />
            <Lines count={2} widths={['95%', '65%']} />
          </div>
        ))}
        <Lines count={2} widths={['85%', '55%']} />
      </div>
    );
  }
  if (motif === 'gradient') {
    // SaaS — product landing with hero + pricing hint
    return (
      <div style={{ width: '100%', height: '100%', background: `linear-gradient(150deg, ${surface} 0%, ${surface}cc 100%)`, padding: 14, display: 'flex', flexDirection: 'column' }}>
        <Nav />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
          <div style={{ height: 12, borderRadius: 99, background: accent, opacity: 0.8, width: '70%' }} />
          <Lines count={2} widths={['90%', '60%']} />
          <div style={{ marginTop: 4, display: 'flex', gap: 6 }}>
            <Pill label="Start free" small />
            <div style={{ height: 22, width: 56, borderRadius: 99, background: bar }} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, height: 30 }}>
          {[1,2,3].map(i => <div key={i} style={{ borderRadius: 3, background: overlay }} />)}
        </div>
      </div>
    );
  }
  if (motif === 'spotlight') {
    // Event — dark stage with spotlight + schedule strip
    return (
      <div style={{ width: '100%', height: '100%', background: `radial-gradient(ellipse 70% 60% at 50% 30%, ${accent}55 0%, ${surface} 70%)`, padding: 14, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <Nav />
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: `${accent}33`, border: `2px solid ${accent}66`, margin: '0 auto 8px' }} />
          <div style={{ height: 10, borderRadius: 99, background: isDark ? 'rgba(255,255,255,0.2)' : overlay, width: '60%', margin: '0 auto 4px' }} />
          <div style={{ height: 7, borderRadius: 99, background: bar, width: '40%', margin: '0 auto' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
          {[1,2,3].map(i => <div key={i} style={{ height: 18, borderRadius: 3, background: overlay }} />)}
        </div>
      </div>
    );
  }
  if (motif === 'leaf') {
    // Nonprofit — mission-led with organic shapes
    return (
      <div style={{ width: '100%', height: '100%', background: surface, padding: 14, display: 'flex', flexDirection: 'column' }}>
        <Nav />
        <div style={{ display: 'flex', gap: 10, flex: 1, alignItems: 'flex-start' }}>
          <div style={{ width: 38, height: 38, borderRadius: '50% 0 50% 50%', background: accent, opacity: 0.8, flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <Lines count={3} widths={['90%', '75%', '55%']} />
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <div style={{ height: 28, borderRadius: 4, background: `${accent}20`, marginBottom: 8 }} />
          <Pill label="Get involved" small />
        </div>
      </div>
    );
  }
  // Fallback — generic layout skeleton
  return (
    <div style={{ width: '100%', height: '100%', background: surface, padding: 14, display: 'flex', flexDirection: 'column' }}>
      <Nav />
      <div style={{ height: 32, borderRadius: 4, background: overlay, marginBottom: 10 }} />
      <Lines count={3} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE GALLERY
// ─────────────────────────────────────────────────────────────────────────────

export function BuilderGallery({ navigate }) {
  const { sites, loading: sitesLoading, source: sitesSource } = useSites();
  const [archivingId, setArchivingId] = useStateB(null);

  const handleArchive = async (siteId, e) => {
    e.stopPropagation();
    setArchivingId(siteId);
    try { await archiveBuilderSite(siteId); } catch {} finally { setArchivingId(null); }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Site builder</div>
          <h1>Choose how your site starts</h1>
          <p className="sub">
            Start with RoxanneAI, pick a Glondia template, or bring in an existing project from GitHub or an upload.
          </p>
        </div>
      </div>

      <div className="builder-choice-grid">
        <button type="button" className="builder-choice-card builder-choice-card--roxanne" onClick={() => navigate({ view: "builder-roxanne" })}>
          <div className="roxanne-choice-media">
            <img src={ROXANNE_IMAGE} alt="RoxanneAI" />
          </div>
          <div className="builder-choice-body">
            <span className="choice-icon"><ICN.Sparkles size={18} /></span>
            <div>
              <h2>Build with RoxanneAI</h2>
              <p>Describe the site you want and let RoxanneAI shape the first draft.</p>
            </div>
          </div>
          <span className="choice-cta">Start with AI <ICN.ArrowRight size={14} /></span>
        </button>

        <button type="button" className="builder-choice-card" onClick={() => navigate({ view: "builder-templates" })}>
          <div className="builder-choice-preview template-choice-preview">
            <div /><div /><div /><div />
          </div>
          <div className="builder-choice-body">
            <span className="choice-icon"><ICN.Layers size={18} /></span>
            <div>
              <h2>Use our templates</h2>
              <p>Choose a polished starter and customize content, pages, domain, and publishing.</p>
            </div>
          </div>
          <span className="choice-cta">Browse templates <ICN.ArrowRight size={14} /></span>
        </button>

        <button type="button" className="builder-choice-card builder-import-card" onClick={() => navigate({ view: "builder-import", params: { mode: "github" } })}>
          <div className="builder-choice-preview import-choice-preview">
            <ICN.Code size={26} />
            <span className="mono">index.html</span>
          </div>
          <div className="builder-choice-body">
            <span className="choice-icon"><ICN.Git size={18} /></span>
            <div>
              <h2>Import your own work</h2>
              <p>Connect a repository or upload a finished site package.</p>
            </div>
          </div>
          <span className="choice-cta">Choose import type <ICN.ArrowRight size={14} /></span>
        </button>
      </div>

      {/* ── My sites ─────────────────────────────────────────────────────── */}
      {sitesSource === "api" && (
        <>
          <div className="row between" style={{ marginTop: 8 }}>
            <h2 style={{ margin: 0 }}>My sites</h2>
            <Badge tone="success" dot={false}>API</Badge>
          </div>

          {sitesLoading ? (
            <div className="card" style={{ padding: "32px 24px" }}>
              <Empty icon="Layers" title="Loading your sites…" />
            </div>
          ) : sites.length === 0 ? (
            <div className="card" style={{ padding: "32px 24px" }}>
              <Empty icon="Layers" title="No sites yet"
                body="Create your first site using a template, RoxanneAI, or by importing from Git." />
            </div>
          ) : (
            <div className="grid-2">
              {sites.map(site => {
                const isPublished = site.status === 'published';
                const url = `https://${site.slug}.glondia.app`;
                return (
                  <div key={site.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div className="row between">
                      <div>
                        <div style={{ fontWeight: 600 }}>{site.name}</div>
                        <div className="mono faint" style={{ fontSize: 12, marginTop: 2 }}>{site.slug}.glondia.app</div>
                      </div>
                      <Badge tone={isPublished ? "success" : "warn"} dot={false}>
                        {isPublished ? "Live" : site.status || "Draft"}
                      </Badge>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      {site.pages?.length ?? 0} page{(site.pages?.length ?? 0) !== 1 ? "s" : ""} ·{" "}
                      {site.updatedAt ? new Date(site.updatedAt).toLocaleDateString() : "—"}
                    </div>
                    <div className="row" style={{ gap: 8 }}>
                      {site.templateId && (
                        <button className="btn btn-sm btn-primary" style={{ flex: 1 }}
                          onClick={() => navigate({ view: "builder-editor", params: { id: site.templateId, siteId: site.id } })}>
                          <ICN.Edit size={13} /> Resume
                        </button>
                      )}
                      {isPublished && (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline">
                          <ICN.ExternalLink size={13} /> Visit
                        </a>
                      )}
                      <button className="btn btn-sm btn-ghost" style={{ color: "var(--danger)" }}
                        onClick={(e) => handleArchive(site.id, e)}
                        disabled={archivingId === site.id}>
                        <ICN.Trash size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
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
    setGenerating(true); setGenError(null);

    try {
      const { accessToken } = getStoredAuth();
      if (!accessToken) { setGenError('Sign in to generate a draft.'); setGenerating(false); return; }

      // Pick a template — use first in list or fallback
      const tpl = templates[0];
      const site = await createBuilderSite({ name: bizName.trim(), templateId: tpl?.id });

      // Pre-fill content from the form inputs
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
        <div className="card builder-prompt-panel">
          <div className="label">What should RoxanneAI build?</div>
          <textarea className="input builder-prompt-input" rows={8} value={prompt} onChange={(e) => setPrompt(e.target.value)}
            placeholder="A consulting website for a financial advisory team with Home, Services, About, and Contact pages..." />
          <div className="grid-2" style={{ gap: 12 }}>
            <input className="input" placeholder="Business name *" value={bizName} onChange={(e) => setBizName(e.target.value)} required />
            <select className="select" value={tone} onChange={(e) => setTone(e.target.value)}>
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
            <button className="btn btn-outline" onClick={() => navigate({ view: "builder-gallery" })}>Cancel</button>
            <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
              <ICN.Sparkles size={14} /> {generating ? "Generating…" : "Generate draft"}
            </button>
          </div>
        </div>

        <div className="roxanne-showcase">
          <img src={ROXANNE_IMAGE} alt="RoxanneAI" />
        </div>
      </div>
    </>
  );
}

export function BuilderImport({ navigate }) {
  const [repoUrl, setRepoUrl] = useStateB('');
  const [repoBranch, setRepoBranch] = useStateB('main');
  const [gitBusy, setGitBusy] = useStateB(false);
  const [gitError, setGitError] = useStateB(null);
  const [importPhase, setImportPhase] = useStateB('idle');
  const [renderConfig, setRenderConfig] = useStateB({
    frontendRootDirectory: '',
    frontendBuildCommand: 'npm run build',
    frontendPublishDirectory: 'dist',
    backendRootDirectory: 'server',
    backendBuildCommand: 'npm install',
    backendStartCommand: 'npm start',
    serviceType: 'static_site',
    plan: 'starter',
  });
  const phaseTimer = React.useRef(null);
  const detectedRepo = parseGithubRepo(repoUrl);
  const isImporting = ['pulling', 'building'].includes(importPhase);
  const importStarted = ['pulling', 'building', 'complete', 'error'].includes(importPhase);
  const isStaticSite = renderConfig.serviceType === 'static_site';

  const updateRepoUrl = (value) => {
    setRepoUrl(value);
    setGitError(null);
    if (!gitBusy) setImportPhase(value.trim() ? (parseGithubRepo(value) ? 'detected' : 'checking') : 'idle');
  };

  const updateRenderConfig = (key, value) => {
    setRenderConfig((current) => ({ ...current, [key]: value }));
  };

  const updateServiceType = (serviceType) => {
    setRenderConfig((current) => ({
      ...current,
      serviceType,
      plan: serviceType === 'static_site' ? 'starter' : (current.plan === 'starter' ? 'starter' : current.plan),
    }));
  };

  React.useEffect(() => () => clearTimeout(phaseTimer.current), []);

  const handleGitConnect = async () => {
    const repo = parseGithubRepo(repoUrl);
    if (!repo) {
      setImportPhase(repoUrl.trim() ? 'checking' : 'idle');
      return;
    }
    setGitBusy(true); setGitError(null);
    setImportPhase('pulling');
    clearTimeout(phaseTimer.current);
    phaseTimer.current = setTimeout(() => setImportPhase('building'), 1200);
    try {
      const rootDirectory = isStaticSite ? renderConfig.frontendRootDirectory : renderConfig.backendRootDirectory;
      const buildCommand = isStaticSite ? renderConfig.frontendBuildCommand : renderConfig.backendBuildCommand;
      const outputDirectory = isStaticSite ? renderConfig.frontendPublishDirectory : '';
      const site = await importBuilderSiteFromGithub({
        repoUrl,
        branch: repoBranch || 'main',
        rootDirectory,
        buildCommand,
        outputDirectory,
        renderConfig: {
          provider: 'render',
          serviceType: renderConfig.serviceType,
          plan: renderConfig.plan,
          frontend: {
            rootDirectory: renderConfig.frontendRootDirectory,
            buildCommand: renderConfig.frontendBuildCommand,
            publishDirectory: renderConfig.frontendPublishDirectory,
          },
          backend: {
            rootDirectory: renderConfig.backendRootDirectory,
            buildCommand: renderConfig.backendBuildCommand,
            startCommand: renderConfig.backendStartCommand,
          },
          selected: isStaticSite
            ? {
                rootDirectory: renderConfig.frontendRootDirectory,
                buildCommand: renderConfig.frontendBuildCommand,
                publishDirectory: renderConfig.frontendPublishDirectory,
              }
            : {
                rootDirectory: renderConfig.backendRootDirectory,
                buildCommand: renderConfig.backendBuildCommand,
                startCommand: renderConfig.backendStartCommand,
              },
        },
      });
      clearTimeout(phaseTimer.current);
      setImportPhase('complete');
      window.setTimeout(() => {
        navigate({ view: "builder-editor", params: { id: site.templateId || null, siteId: site.id } });
      }, 700);
    } catch (err) {
      setGitError(err.message || 'Failed to connect repository.');
      setImportPhase('error');
      setGitBusy(false);
    } finally {
      setGitBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <a className="page-eyebrow" href="#" onClick={(e) => { e.preventDefault(); navigate({ view: "builder-gallery" }); }}>
            Back to site builder
          </a>
          <h1>Import your own work</h1>
          <p className="sub">Paste a repository link, import, and Glondia will move into the editor when the files are ready.</p>
        </div>
      </div>

      <div className="card card-flush builder-import-workspace" style={{ overflow: "hidden" }}>
        <div className="bld-split">
          <div className="github-pull-toggle">
            <div className="github-pull-head">
              <div className="github-pull-icon"><ICN.Github size={18} /></div>
              <div>
                <div className="eyebrow">GitHub pull</div>
                <h2>Import from repository</h2>
              </div>
            </div>

            <div className="builder-import-pane">
              <div className="label">Repository URL</div>
              <div className="input-group">
                <input autoFocus className="input mono" placeholder="https://github.com/your-org/your-site"
                  value={repoUrl} onChange={(e) => updateRepoUrl(e.target.value)}
                  onPaste={(e) => {
                    const pasted = e.clipboardData?.getData('text');
                    if (pasted) {
                      e.preventDefault();
                      updateRepoUrl(pasted);
                    }
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleGitConnect()} />
                <button className="btn btn-primary" onClick={handleGitConnect} disabled={gitBusy || importPhase === 'complete' || !detectedRepo}>
                  <ICN.Git size={14} /> {importPhase === 'complete' ? "Opening" : gitBusy ? "Importing" : "Import"}
                </button>
              </div>
              <div style={{ marginTop: 12 }}>
                <div className="label">Branch</div>
                <input className="input mono" placeholder="main" value={repoBranch} onChange={(e) => setRepoBranch(e.target.value)} />
              </div>
              {repoUrl.trim() && !detectedRepo && <div style={{ marginTop: 10, color: "var(--warning)", fontSize: 13 }}>Paste a GitHub repository URL, for example https://github.com/owner/repo.</div>}
              {gitError && <div style={{ marginTop: 10, color: "var(--danger)", fontSize: 13 }}>{gitError}</div>}
              <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>Import starts only after a valid repository is detected and you click Import.</div>
            </div>

            <div className="render-config-panel">
              <div>
                <div className="eyebrow">Render deployment payload</div>
                <h3>Service settings</h3>
              </div>
              <div className="render-config-grid render-config-grid--compact render-config-service-row">
                <label>
                  <span>Service type</span>
                  <select className="input" value={renderConfig.serviceType} onChange={(e) => updateServiceType(e.target.value)}>
                    <option value="static_site">Static Site</option>
                    <option value="web_service">Web Service</option>
                  </select>
                </label>
                <label><span>Plan</span><input className="input mono" value={renderConfig.plan} onChange={(e) => updateRenderConfig('plan', e.target.value)} /></label>
              </div>

              {isStaticSite ? (
                <>
                  <div>
                    <h3>Static site settings</h3>
                  </div>
                  <div className="render-config-grid">
                    <label><span>Root directory</span><input className="input mono" value={renderConfig.frontendRootDirectory} onChange={(e) => updateRenderConfig('frontendRootDirectory', e.target.value)} placeholder="./" /></label>
                    <label><span>Build command</span><input className="input mono" value={renderConfig.frontendBuildCommand} onChange={(e) => updateRenderConfig('frontendBuildCommand', e.target.value)} /></label>
                    <label><span>Publish directory</span><input className="input mono" value={renderConfig.frontendPublishDirectory} onChange={(e) => updateRenderConfig('frontendPublishDirectory', e.target.value)} /></label>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <h3>Web service settings</h3>
                  </div>
                  <div className="render-config-grid">
                    <label><span>Service root</span><input className="input mono" value={renderConfig.backendRootDirectory} onChange={(e) => updateRenderConfig('backendRootDirectory', e.target.value)} placeholder="server" /></label>
                    <label><span>Build command</span><input className="input mono" value={renderConfig.backendBuildCommand} onChange={(e) => updateRenderConfig('backendBuildCommand', e.target.value)} /></label>
                    <label><span>Start command</span><input className="input mono" value={renderConfig.backendStartCommand} onChange={(e) => updateRenderConfig('backendStartCommand', e.target.value)} /></label>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="bld-preview">
            <ImportProgressPreview phase={importPhase} repo={detectedRepo} branch={repoBranch || 'main'} error={gitError} showLoader={importStarted} isImporting={isImporting} />
          </div>
        </div>
      </div>
    </>
  );
}

function ImportProgressPreview({ phase, repo, branch, error, showLoader, isImporting }) {
  const title = repo?.fullName || 'Your repository';
  const activeLabel = {
    idle: 'Paste your GitHub link on the left.',
    checking: 'Checking repository format...',
    detected: 'Repository detected. Click Import to pull files.',
    pulling: 'Pulling files from GitHub...',
    building: 'Installing and building preview...',
    complete: 'Files downloaded. Opening the editor...',
    error: 'Import needs attention.',
  }[phase] || 'Ready when you are.';
  const loaderText = error ? 'Error' : phase === 'complete' ? 'Ready' : 'Importing';

  return (
    <div className={`bld-preview-frame import-loader-frame ${!isImporting ? 'import-loader-frame--still' : ''}`}>
      <div className="import-loader-shell">
        <div className="import-loader-copy">
          <div className="eyebrow">Import pipeline</div>
          <h2>{title}</h2>
          <div className="muted">
            {repo ? <span className="mono">{repo.url} - {branch}</span> : activeLabel}
          </div>
        </div>

        {showLoader ? (
          <div className="loader" aria-live="polite" aria-label={activeLabel}>
            {Array.from({ length: 9 }).map((_, index) => (
              <div className="text" key={index}><span>{loaderText}</span></div>
            ))}
            <div className="line" />
          </div>
        ) : (
          <div className="import-loader-standby">
            <ICN.Git size={18} />
            <span>{repo ? 'Repository detected' : 'Waiting for repository'}</span>
          </div>
        )}

        <div className="term import-loader-term">
          <div><span className="ts">now</span> <span className={error ? "err" : "info"}>{error || activeLabel}</span></div>
          {repo && <div><span className="ts">repo</span> <span className="dim">{repo.owner}/{repo.repo}</span></div>}
          <div><span className="ts">next</span> <span className="ok">Editor opens automatically after import</span></div>
        </div>
      </div>
    </div>
  );
}

export function BuilderTemplates({ navigate }) {
  const { templates, loading, source, error } = useTemplates();
  const [cat, setCat] = useStateB("All");
  const [sfCat, setSfCat] = useStateB("All");
  const [previewTpl, setPreviewTpl] = useStateB(null);

  // Storefront categories
  const sfCats = ["All", ...Array.from(new Set(STOREFRONT_TEMPLATES.map(t => t.category)))];
  const sfFiltered = sfCat === "All" ? STOREFRONT_TEMPLATES : STOREFRONT_TEMPLATES.filter(t => t.category === sfCat);

  // General templates
  const cats = ["All", ...Array.from(new Set(templates.map(t => t.category)))];
  const filtered = cat === "All" ? templates : templates.filter(t => t.category === cat);

  const handleUseStorefront = (t) => {
    setPreviewTpl(null);
    navigate({ view: "builder-editor", params: { id: t.id } });
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Site builder</div>
          <h1>Pick a template</h1>
          <p className="sub">
            Start with a live e-commerce design or a general-purpose starter. Fill in your content and publish to your domain in minutes.
          </p>
        </div>
        <div className="actions">
          {TEMPLATES_REPO && (
            <a href={TEMPLATES_REPO} target="_blank" rel="noopener noreferrer" className="btn btn-outline">
              <ICN.Git size={14} /> Template source
            </a>
          )}
          <button className="btn btn-outline" onClick={() => navigate({ view: "builder-import", params: { mode: "github" } })}><ICN.Git size={14} /> Import from Git</button>
        </div>
      </div>

      {/* ── Storefront templates ─────────────────────────────────────────────── */}
      <div>
        <div className="row between" style={{ marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>Storefront templates</h2>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
              9 full e-commerce designs — hover to see the live page preview.
            </p>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {sfCats.map(c => (
              <button key={c} onClick={() => setSfCat(c)} className="btn btn-sm"
                style={{
                  border: `1px solid ${sfCat === c ? "var(--accent)" : "var(--border)"}`,
                  background: sfCat === c ? "var(--accent-soft)" : "var(--bg-elev)",
                  color: sfCat === c ? "var(--accent-ink)" : "var(--text)",
                  fontWeight: 500,
                }}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="sf-tpl-grid">
          {sfFiltered.map(t => (
            <div className="sf-tpl-card" key={t.id}>
              {/* Live preview thumbnail */}
              <div className="sf-tpl-thumb">
                <StorefrontPreview Comp={t.Comp} />
                {/* Hover overlay */}
                <div className="sf-tpl-overlay">
                  <button className="btn btn-primary"
                    onClick={() => setPreviewTpl(t)}>
                    <ICN.Eye size={14} /> Full preview
                  </button>
                  <button className="btn btn-outline"
                    style={{ background: "rgba(255,255,255,.92)", color: "var(--text)" }}
                    onClick={() => handleUseStorefront(t)}>
                    Use template
                  </button>
                </div>
                {/* Badges */}
                {t.badge && (
                  <span style={{
                    position: "absolute", top: 10, left: 10, zIndex: 2,
                    background: t.featured ? "var(--accent)" : "var(--bg-elev)",
                    color: t.featured ? "#fff" : "var(--text)",
                    border: t.featured ? "none" : "1px solid var(--border)",
                    borderRadius: 999, padding: "3px 9px",
                    fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
                  }}>
                    {t.badge}
                  </span>
                )}
              </div>
              {/* Card footer */}
              <div className="sf-tpl-body">
                <div className="row between" style={{ alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{t.tag}</div>
                  </div>
                  <span className="faint" style={{
                    fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
                    textTransform: "uppercase", marginTop: 2,
                  }}>{t.category}</span>
                </div>
                <div className="row" style={{ gap: 8, marginTop: 10 }}>
                  <button className="btn btn-sm btn-primary" style={{ flex: 1 }}
                    onClick={() => handleUseStorefront(t)}>
                    Use {t.name} <ICN.ArrowRight size={12} />
                  </button>
                  <button className="btn btn-sm btn-outline" title="Full preview"
                    onClick={() => setPreviewTpl(t)}>
                    <ICN.Eye size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── General website templates ────────────────────────────────────────── */}
      <div style={{ marginTop: 48 }}>
        <div className="row between" style={{ marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>General templates</h2>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
              Portfolio, restaurant, blog, agency and more — with Home, About, and Contact built in.
              {TEMPLATES_REPO && (
                <> Source in{' '}
                  <a href={TEMPLATES_REPO} target="_blank" rel="noopener noreferrer"
                     style={{ color: "var(--accent)" }}>templates repo <ICN.ExternalLink size={11} /></a>.
                </>
              )}
            </p>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {cats.map(c => (
              <button key={c} onClick={() => setCat(c)} className="btn btn-sm"
                style={{
                  border: `1px solid ${cat === c ? "var(--accent)" : "var(--border)"}`,
                  background: cat === c ? "var(--accent-soft)" : "var(--bg-elev)",
                  color: cat === c ? "var(--accent-ink)" : "var(--text)",
                  fontWeight: 500,
                }}>
                {c}
              </button>
            ))}
            <div className="muted" style={{ fontSize: 13, paddingLeft: 4, alignSelf: "center" }}>
              {loading ? "Loading…" : `${filtered.length} of ${templates.length}`}
            </div>
          </div>
        </div>

        {/* Source / error badge */}
        {source === "api" && (
          <div className="card" style={{ padding: "10px 14px", fontSize: 13, marginBottom: 14 }}>
            <span className="row" style={{ gap: 8 }}><ICN.Server size={14} /> Templates loaded from backend</span>
          </div>
        )}
        {error && (
          <div className="card" style={{ padding: "10px 14px", fontSize: 13, color: "var(--text-muted)", marginBottom: 14 }}>
            Backend unavailable — showing local template catalogue.
          </div>
        )}

        {loading ? (
          <div className="tpl-grid">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="tpl-card" style={{ opacity: 0.5 }}>
                <div className="tpl-thumb" style={{ background: "var(--bg-deep)" }} />
                <div className="tpl-body">
                  <div style={{ height: 16, background: "var(--bg-deep)", borderRadius: 4, width: "60%", marginBottom: 8 }} />
                  <div style={{ height: 12, background: "var(--bg-deep)", borderRadius: 4, width: "90%" }} />
                </div>
              </div>
            ))}
          </div>
        ) : templates.length === 0 ? (
          <div className="card" style={{ padding: "48px 24px" }}>
            <Empty icon="Layers" title="No templates yet"
              body="Templates will appear here once they are added to the backend."
              action={TEMPLATES_REPO
                ? <a href={TEMPLATES_REPO} target="_blank" rel="noopener noreferrer" className="btn btn-outline"><ICN.Git size={14} /> View template repo</a>
                : null} />
          </div>
        ) : (
          <div className="tpl-grid">
            {filtered.map(t => (
              <div className="tpl-card" key={t.id}>
                <div className="tpl-thumb"><TplThumb tpl={t} /></div>
                <div className="tpl-body">
                  <div className="row between">
                    <h4>{t.name}</h4>
                    <span className="faint" style={{ fontSize: 11 }}>{t.category}</span>
                  </div>
                  <p className="muted" style={{ margin: 0, fontSize: 13 }}>{t.tagline}</p>
                  <div className="tag-row">
                    <span className="ttag">Home</span>
                    <span className="ttag">About</span>
                    <span className="ttag">Contact</span>
                  </div>
                  <div className="row" style={{ gap: 8, marginTop: 12 }}>
                    <button className="btn btn-sm btn-primary" style={{ flex: 1 }}
                            onClick={() => navigate({ view: "builder-editor", params: { id: t.id } })}>
                      Use {t.name} <ICN.ArrowRight size={12} />
                    </button>
                    <button className="btn btn-sm btn-outline" title="Preview"><ICN.Eye size={14} /></button>
                    {TEMPLATES_REPO && (
                      <a href={`${TEMPLATES_REPO}/tree/main/${t.id}`} target="_blank" rel="noopener noreferrer"
                         className="btn btn-sm btn-ghost" title="View source on GitHub">
                        <ICN.Git size={14} />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Full-screen preview modal */}
      {previewTpl && (
        <StorefrontModal
          template={previewTpl}
          onClose={() => setPreviewTpl(null)}
          onUse={handleUseStorefront}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILDER EDITOR — form on left, live preview on right
// ─────────────────────────────────────────────────────────────────────────────

const BLANK_CONTENT = {
  siteName: '',
  tagline: '',
  heroLede: '',
  ctaLabel: 'Get in touch',
  features: [
    { title: '', body: '' },
    { title: '', body: '' },
    { title: '', body: '' },
  ],
  aboutHeading: '',
  about: '',
  contactHeading: '',
  contactEmail: '',
  contactPhone: '',
  contactAddress: '',
};

export function BuilderEditor({ id, siteId: initialSiteId, navigate }) {
  const { templates, loading: templatesLoading } = useTemplates();
  const { domains } = useDomains();
  const tpl = templates.find(t => t.id === id) || templates[0] || null;
  const [tab, setTab] = useStateB("home");
  const [content, setContent] = useStateB({ ...BLANK_CONTENT });
  const [publishing, setPublishing] = useStateB(false);
  const [siteId, setSiteId] = useStateB(initialSiteId || null);
  const [pageId, setPageId] = useStateB(null);
  const [savingDraft, setSavingDraft] = useStateB(false);
  const [draftMsg, setDraftMsg] = useStateB(null);
  const [draftError, setDraftError] = useStateB(null);
  const [selectedDomain, setSelectedDomain] = useStateB('');
  const [loadedSite, setLoadedSite] = useStateB(null);
  const autoSaveTimer = React.useRef(null);
  const isGithubImport = content._source === 'github';
  const siteSlug = tpl
    ? (content.siteName || tpl.id).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || tpl.id
    : '';

  const update = (k, v) => setContent(prev => {
    const next = { ...prev, [k]: v };
    // Schedule auto-save 3s after last change (only when signed in & draft exists)
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      if (siteId && pageId && getStoredAuth().accessToken) {
        saveBuilderPage(siteId, pageId, next).catch(() => {});
      }
    }, 3000);
    return next;
  });

  const saveDraft = async () => {
    clearTimeout(autoSaveTimer.current);
    setSavingDraft(true); setDraftMsg(null); setDraftError(null);
    const { accessToken } = getStoredAuth();
    if (!accessToken) { setDraftError('Sign in to save drafts.'); setSavingDraft(false); return; }
    try {
      let sid = siteId, pid = pageId;
      if (!sid) {
        const site = await createBuilderSite({ name: content.siteName || tpl.name, templateId: tpl.id });
        sid = site.id;
        pid = site.pages?.[0]?.id || null;
        setSiteId(sid); setPageId(pid);
      }
      if (pid) await saveBuilderPage(sid, pid, content);
      setDraftMsg('Draft saved');
      setTimeout(() => setDraftMsg(null), 2500);
    } catch (err) {
      setDraftError(err.message || 'Save failed.');
    } finally {
      setSavingDraft(false);
    }
  };

  // Load existing site content when siteId is provided. Imported GitHub/upload sites
  // live in the local workspace too, so this must not depend on an auth token.
  React.useEffect(() => {
    if (!initialSiteId) return;
    getBuilderSite(initialSiteId).then(site => {
      if (!site) return;
      const homePage = site?.pages?.[0];
      if (homePage?.id) setPageId(homePage.id);
      if (homePage?.content && typeof homePage.content === 'object') {
        setContent(prev => ({
          ...prev,
          siteName: site.name || prev.siteName,
          ...homePage.content,
        }));
      }
      setSiteId(site.id);
      setLoadedSite(site);
    }).catch(() => {});
  }, [initialSiteId]);

  // Cleanup auto-save timer on unmount
  React.useEffect(() => () => clearTimeout(autoSaveTimer.current), []);

  // Loading guard
  if (templatesLoading && !tpl) {
    return (
      <div style={{ padding: "80px 24px" }}>
        <Empty icon="Layers" title="Loading templates…" />
      </div>
    );
  }
  if (!tpl && !isGithubImport) {
    return (
      <div style={{ padding: "80px 24px" }}>
        <Empty icon="Layers" title="Template not found"
          body="This template may have been removed or isn't available yet."
          action={<button className="btn btn-outline" onClick={() => navigate({ view: "builder-templates" })}>Back to templates</button>} />
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <a className="page-eyebrow" href="#" onClick={(e) => { e.preventDefault(); navigate({ view: "builder-templates" }); }}>
            Site builder / Templates
          </a>
          <div className="row" style={{ gap: 14, marginTop: 8 }}>
            <div style={{ width: 56, height: 36, borderRadius: 6, overflow: "hidden", border: "1px solid var(--border)" }}>
              {isGithubImport ? (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-deep)", color: "var(--accent)" }}>
                  <ICN.Github size={18} />
                </div>
              ) : <TplThumb tpl={tpl} />}
            </div>
            <div>
              <h1 style={{ margin: 0 }}>{content.siteName || tpl?.name || content._repository || 'Imported site'}</h1>
              <div className="row" style={{ gap: 10, marginTop: 4, color: "var(--text-muted)", fontSize: 13 }}>
                <span>{isGithubImport ? `${content._repository || 'GitHub repository'} source` : `${tpl.name} template`}</span>
                <span>·</span>
                <span className="mono">{isGithubImport ? content._branch || loadedSite?.branch || 'main' : `${siteSlug}.glondia.app`}</span>
                <span>·</span>
                <Badge tone="warn">Unpublished changes</Badge>
              </div>
            </div>
          </div>
        </div>
        <div className="actions">
          {draftError && <span style={{ fontSize: 12, color: "var(--danger)" }}>{draftError}</span>}
          {draftMsg && <span style={{ fontSize: 12, color: "var(--accent)" }}>{draftMsg}</span>}
          <button className="btn btn-ghost" onClick={saveDraft} disabled={savingDraft} title="Save draft">
            <ICN.Copy size={14} /> {savingDraft ? "Saving…" : "Save draft"}
          </button>
          <button className="btn btn-outline"
            onClick={() => siteId ? window.open(`https://${siteSlug}.glondia.app`, '_blank') : saveDraft()}>
            <ICN.Eye size={14} /> Preview live
          </button>
          <button className="btn btn-primary" onClick={() => isGithubImport ? window.dispatchEvent(new CustomEvent('glondia:imported-publish')) : setPublishing(true)}>
            <ICN.Rocket size={14} /> {isGithubImport ? "Publish to Render" : "Publish"}
          </button>
        </div>
      </div>

      <div className="card card-flush" style={{ overflow: "hidden", margin: "0 -28px -28px", borderLeft: 0, borderRight: 0, borderBottom: 0, borderRadius: 0 }}>
        <div className="bld-split">
          {isGithubImport
            ? <ImportedGithubWorkspace content={content} site={loadedSite} />
            : <BuilderForm tab={tab} setTab={setTab} content={content} update={update} tpl={tpl} siteSlug={siteSlug} domains={domains} selectedDomain={selectedDomain} setSelectedDomain={setSelectedDomain} />}
          <div className="bld-preview">
            {isGithubImport ? (
              <ImportedGithubPreview content={content} />
            ) : (
              <>
                <BuilderPreview tab={tab} content={content} tpl={tpl} />
                <div className="row" style={{ justifyContent: "center", gap: 8, marginTop: 18 }}>
                  <Tabs value={tab} onChange={setTab} options={[
                    { value: "home", label: "Home" },
                    { value: "about", label: "About" },
                    { value: "contact", label: "Contact" },
                  ]} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {publishing && <PublishModal onClose={() => setPublishing(false)} content={content} tpl={tpl} siteSlug={siteSlug} navigate={navigate} existingSiteId={siteId} existingPageId={pageId} onPublished={(sid, pid) => { setSiteId(sid); setPageId(pid); }} />}
    </>
  );
}

function ImportedGithubWorkspace({ content, site }) {
  const githubFiles = Array.isArray(content._githubFiles) ? content._githubFiles : [];
  const sandboxFiles = Array.isArray(content._sandboxFiles) ? content._sandboxFiles : [];
  const files = sandboxFiles.length ? sandboxFiles : githubFiles;
  const contents = content._githubFileContents && typeof content._githubFileContents === 'object' ? content._githubFileContents : {};
  const summary = content._githubSummary || {};
  const loadedPaths = Object.keys(contents);
  const [renderStatus, setRenderStatus] = useStateB({ loading: true, settings: null, deploys: [], error: null });
  const [selectedRenderServiceId, setSelectedRenderServiceId] = useStateB('');
  const [deploying, setDeploying] = useStateB(false);
  const [deployMsg, setDeployMsg] = useStateB(null);

  const refreshRenderStatus = React.useCallback(() => {
    setRenderStatus((current) => ({ ...current, loading: true, error: null }));
    getRenderSettings()
      .then((settings) => {
        setRenderStatus({
          loading: false,
          settings,
          deploys: [],
          error: settings?.error || null,
        });
      })
      .catch((error) => setRenderStatus({ loading: false, settings: null, deploys: [], error: error.message }));
  }, []);

  React.useEffect(() => {
    refreshRenderStatus();
  }, [refreshRenderStatus]);

  const renderActivationPayload = React.useCallback(() => {
    let packageJson = {};
    try {
      packageJson = contents['package.json'] ? JSON.parse(contents['package.json']) : {};
    } catch {
      packageJson = {};
    }
    return {
      repoUrl: `https://github.com/${content._repository}`,
      branch: content._branch || 'main',
      name: content.siteName || content._repository?.split('/').pop(),
      framework: packageJson.scripts?.start ? 'Node' : 'Static',
      buildCommand: packageJson.scripts?.build ? 'npm install && npm run build' : 'npm install',
      startCommand: packageJson.scripts?.start ? 'npm start' : undefined,
      outputDirectory: content._sandboxOutputDirectory === 'runtime' ? 'dist' : content._sandboxOutputDirectory || 'dist',
    };
  }, [content._branch, content._repository, content._sandboxOutputDirectory, content.siteName, contents]);

  const handleRenderDeploy = React.useCallback(async () => {
    setDeploying(true);
    setDeployMsg(null);
    try {
      const payload = renderActivationPayload();
      const deployment = await createRenderDeployment({
        siteId: site?.id,
        projectId: site?.projectId || site?.id,
        renderServiceId: selectedRenderServiceId || undefined,
        name: payload.name,
        serviceType: payload.startCommand ? 'web_service' : 'static_site',
        repoUrl: payload.repoUrl,
        githubRepo: content._repository,
        branch: payload.branch,
        sourceReference: content._sandboxPreviewUrl || payload.repoUrl,
        buildCommand: payload.buildCommand,
        startCommand: payload.startCommand,
        outputDirectory: payload.outputDirectory,
        environment: 'production',
      });
      if (deployment.renderServiceId) setSelectedRenderServiceId(deployment.renderServiceId);
      navigate({ view: "hosting-detail", params: { id: deployment.deploymentId } });
    } catch (error) {
      setDeployMsg(error.message || 'Publishing needs attention.');
    } finally {
      setDeploying(false);
    }
  }, [content._repository, content._sandboxPreviewUrl, navigate, renderActivationPayload, selectedRenderServiceId, site?.id, site?.projectId]);

  React.useEffect(() => {
    const publish = () => handleRenderDeploy();
    window.addEventListener('glondia:imported-publish', publish);
    return () => window.removeEventListener('glondia:imported-publish', publish);
  }, [handleRenderDeploy]);

  return (
    <div className="bld-form">
      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Imported source</div>
        <h2 style={{ margin: "0 0 8px" }}>{content._repository || site?.repositoryUrl || 'GitHub repository'}</h2>
        <div className="muted" style={{ fontSize: 13 }}>
          Branch <span className="mono">{content._branch || site?.branch || 'main'}</span> - {files.length || summary.fileCount || 0} files found - {summary.loadedFileCount || loadedPaths.length} text files loaded
        </div>
      </div>

      <div className="grid-2" style={{ gap: 10 }}>
        <ImportMetric label="Package" value={summary.hasPackageJson ? "Found" : "Missing"} detail="package.json" />
        <ImportMetric label="Sandbox" value={content._sandboxStatus === 'ready' ? "Ready" : content._sandboxStatus === 'failed' ? "Failed" : "Building"} detail={content._sandboxMode === 'runtime' ? 'Runtime server' : content._sandboxOutputDirectory || 'dist'} />
      </div>

      <div>
        <div className="label">Publishing</div>
        <div style={{ background: "var(--bg-deep)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="row between" style={{ gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700 }}>Hosting setup</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {renderStatus.loading
                  ? 'Checking hosting configuration...'
                  : renderStatus.settings?.configured
                    ? 'Ready to publish this app to a dedicated customer hosting environment.'
                    : 'Hosting is not configured yet. Contact support before publishing.'}
              </div>
            </div>
            <Badge tone={renderStatus.settings?.configured ? "success" : "warn"} dot={false}>
              {renderStatus.settings?.configured ? "Ready" : "Setup"}
            </Badge>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            <PublishStep done={!!content._repository} label="Repository connected" />
            <PublishStep done={content._sandboxStatus === 'ready'} label="Build preview prepared" />
            <PublishStep done={!!selectedRenderServiceId} label="Dedicated customer hosting" pendingLabel="Created on publish" />
          </div>
          {renderStatus.error && <div style={{ color: "var(--warning)", fontSize: 13 }}>{renderStatus.error}</div>}
          {deployMsg && <div style={{ color: "var(--accent)", fontSize: 13 }}>{deployMsg}</div>}
          <div className="row" style={{ gap: 8, justifyContent: "space-between" }}>
            <button className="btn btn-sm btn-outline" onClick={refreshRenderStatus} disabled={renderStatus.loading}>Refresh status</button>
            <button className="btn btn-sm btn-primary" onClick={handleRenderDeploy} disabled={deploying}>
              <ICN.Rocket size={13} /> {deploying ? "Publishing..." : "Publish now"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ background: "var(--bg-deep)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: 14 }}>
        <div className="label">Import summary</div>
        <div className="kv" style={{ gridTemplateColumns: "120px 1fr" }}>
          <dt>Files scanned</dt><dd>{files.length || summary.fileCount || 0}</dd>
          <dt>Text loaded</dt><dd>{summary.loadedFileCount || loadedPaths.length}</dd>
          <dt>Preview mode</dt><dd>{content._sandboxMode === 'runtime' ? 'Runtime server' : 'Static build'}</dd>
          <dt>Output</dt><dd className="mono">{content._sandboxOutputDirectory || 'dist'}</dd>
        </div>
      </div>
    </div>
  );
}

function PublishStep({ done, label, pendingLabel = "Waiting" }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "24px 1fr auto", alignItems: "center", gap: 10 }}>
      <div style={{ width: 20, height: 20, borderRadius: 999, display: "grid", placeItems: "center", background: done ? "var(--accent-soft)" : "var(--bg)", color: done ? "var(--accent)" : "var(--text-muted)" }}>
        {done ? <ICN.CheckCircle size={13} /> : <span className="mono" style={{ fontSize: 10 }}>•</span>}
      </div>
      <span style={{ fontSize: 13 }}>{label}</span>
      <Badge tone={done ? "success" : "muted"} dot={false}>{done ? "Ready" : pendingLabel}</Badge>
    </div>
  );
}

function ImportMetric({ label, value, detail }) {
  return (
    <div style={{ background: "var(--bg-deep)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: 14 }}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 16 }}>{value}</div>
      <div className="mono" style={{ color: "var(--text-faint)", fontSize: 12, marginTop: 4 }}>{detail}</div>
    </div>
  );
}

function ImportedGithubPreview({ content }) {
  const logs = Array.isArray(content._sandboxLogs) ? content._sandboxLogs : [];
  const steps = [
    { label: 'Repository connected', done: !!content._repository },
    { label: 'Source pulled', done: (content._githubFiles || []).length > 0 },
    { label: 'Dependencies installed', done: logs.some((log) => String(log.command || '').includes('npm install') && log.ok) },
    { label: 'Sandbox prepared', done: content._sandboxStatus === 'ready' },
    { label: 'Ready for Render publish', done: content._sandboxStatus === 'ready' },
  ];
  return (
    <div className="bld-preview-frame">
      <div style={{ minHeight: 640, padding: 44, display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at 50% 15%, rgba(74,222,128,.16), transparent 38%), var(--bg-deep)" }}>
        <div style={{ width: "min(680px, 100%)", textAlign: "center" }}>
          <div style={{ width: 108, height: 108, borderRadius: 999, margin: "0 auto 24px", border: "1px solid rgba(74,222,128,.35)", display: "grid", placeItems: "center", boxShadow: "0 0 54px rgba(74,222,128,.22)", animation: "pulse 1.8s ease-in-out infinite" }}>
            <ICN.Rocket size={42} style={{ color: "var(--accent)" }} />
          </div>
          <div className="eyebrow">Deployment pipeline</div>
          <h1 style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: 44, margin: "10px 0 14px" }}>{content._repository || 'Imported site'}</h1>
          <p style={{ color: "var(--text-muted)", maxWidth: 620, lineHeight: 1.6, margin: "0 auto 28px" }}>
            Glondia pulled the repository and prepared a sandbox. Use Publish to create or reuse a dedicated customer hosting environment and deploy this app without touching the Glondiasites platform.
          </p>
          <div style={{ display: "grid", gap: 10, textAlign: "left" }}>
            {steps.map((step, index) => (
              <div key={step.label} style={{ display: "grid", gridTemplateColumns: "32px 1fr auto", alignItems: "center", gap: 12, padding: "12px 14px", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "rgba(255,255,255,.03)" }}>
                <div style={{ width: 24, height: 24, borderRadius: 999, display: "grid", placeItems: "center", background: step.done ? "var(--accent-soft)" : "var(--bg)", color: step.done ? "var(--accent)" : "var(--text-muted)" }}>
                  {step.done ? <ICN.CheckCircle size={14} /> : <span className="mono" style={{ fontSize: 11 }}>{index + 1}</span>}
                </div>
                <div style={{ fontWeight: 650 }}>{step.label}</div>
                <Badge tone={step.done ? "success" : "muted"} dot={false}>{step.done ? "Done" : "Waiting"}</Badge>
              </div>
            ))}
          </div>
          {content._sandboxError && (
            <div style={{ marginTop: 18, color: "var(--danger)", fontSize: 13 }}>
              {content._sandboxError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BuilderForm({ tab, setTab, content, update, tpl, siteSlug, domains, selectedDomain, setSelectedDomain }) {
  return (
    <div className="bld-form">
      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Editing</div>
        <div className="tab-row">
          <button className={tab === "home" ? "active" : ""} onClick={() => setTab("home")}>Home</button>
          <button className={tab === "about" ? "active" : ""} onClick={() => setTab("about")}>About</button>
          <button className={tab === "contact" ? "active" : ""} onClick={() => setTab("contact")}>Contact</button>
          <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>Site</button>
        </div>
      </div>

      {tab === "home" && (
        <>
          <FormGroup label="Site name">
            <input className="input" value={content.siteName} onChange={(e) => update("siteName", e.target.value)} />
          </FormGroup>
          <FormGroup label="Hero tagline">
            <input className="input" value={content.tagline} onChange={(e) => update("tagline", e.target.value)} />
          </FormGroup>
          <FormGroup label="Lede paragraph">
            <textarea className="input" rows={4} value={content.heroLede} onChange={(e) => update("heroLede", e.target.value)} />
          </FormGroup>
          <FormGroup label="Primary button label">
            <input className="input" value={content.ctaLabel} onChange={(e) => update("ctaLabel", e.target.value)} />
          </FormGroup>

          <div>
            <div className="label">Features (3)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {content.features.map((f, i) => (
                <div key={i} style={{ background: "var(--bg-deep)", borderRadius: "var(--r-sm)", padding: 12 }}>
                  <input className="input" style={{ marginBottom: 6 }} value={f.title}
                         onChange={(e) => update("features", content.features.map((g, j) => j === i ? { ...g, title: e.target.value } : g))} />
                  <textarea className="input" rows={2} value={f.body}
                            onChange={(e) => update("features", content.features.map((g, j) => j === i ? { ...g, body: e.target.value } : g))} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {tab === "about" && (
        <>
          <FormGroup label="About heading">
            <input className="input" value={content.aboutHeading} placeholder="About the studio"
                   onChange={(e) => update("aboutHeading", e.target.value)} />
          </FormGroup>
          <FormGroup label="About body">
            <textarea className="input" rows={10} value={content.about} placeholder="Tell your story…"
                      onChange={(e) => update("about", e.target.value)} />
          </FormGroup>
          <FormGroup label="Photo">
            <div style={{ height: 120, background: "var(--bg-deep)", borderRadius: "var(--r-sm)", border: "1px dashed var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>
              <span className="row" style={{ gap: 8 }}><ICN.Image size={16} /> Drag an image or click to upload</span>
            </div>
          </FormGroup>
        </>
      )}

      {tab === "contact" && (
        <>
          <FormGroup label="Contact heading">
            <input className="input" value={content.contactHeading} placeholder="Say hello"
                   onChange={(e) => update("contactHeading", e.target.value)} />
          </FormGroup>
          <FormGroup label="Email">
            <input className="input mono" value={content.contactEmail} onChange={(e) => update("contactEmail", e.target.value)} />
          </FormGroup>
          <FormGroup label="Phone">
            <input className="input mono" value={content.contactPhone} onChange={(e) => update("contactPhone", e.target.value)} />
          </FormGroup>
          <FormGroup label="Address">
            <textarea className="input" rows={2} value={content.contactAddress} onChange={(e) => update("contactAddress", e.target.value)} />
          </FormGroup>
          <FormGroup label="Form delivery">
            <select className="select">
              <option>Email to {content.contactEmail}</option>
              <option>Forward to webhook URL</option>
              <option>Both</option>
            </select>
          </FormGroup>
        </>
      )}

      {tab === "settings" && (
        <>
          <FormGroup label="Glondia subdomain">
            <div className="input-group">
              <input className="input mono" value={siteSlug} readOnly />
              <span className="btn btn-outline" style={{ cursor: "default", borderLeftWidth: 0 }}>.glondia.app</span>
            </div>
          </FormGroup>
          <FormGroup label="Custom domain">
            <select className="select" value={selectedDomain} onChange={(e) => setSelectedDomain(e.target.value)}>
              <option value="">— Use Glondia subdomain</option>
              {(domains || []).filter(d => d.rawStatus === 'active' || d.rawStatus === 'verified').map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </FormGroup>
          <FormGroup label="Theme accent">
            <div className="row" style={{ gap: 8 }}>
              {[tpl.accent, "#198754", "#1d4e6e", "#9a3412", "#2a4d9a", "#1a1f1d"].map((c, i) => (
                <button key={i} style={{ width: 30, height: 30, borderRadius: 999, background: c, border: i === 0 ? "2px solid var(--text)" : "1px solid var(--border)" }} />
              ))}
            </div>
          </FormGroup>
          <FormGroup label="Footer note">
            <input className="input" placeholder={`© ${new Date().getFullYear()} ${content.siteName || 'Your site name'}`} />
          </FormGroup>
          <FormGroup label="Show contact form on home">
            <ToggleRow label="" sub="" defaultOn />
          </FormGroup>
        </>
      )}
    </div>
  );
}

function FormGroup({ label, children }) {
  return (
    <div>
      {label && <div className="label">{label}</div>}
      {children}
    </div>
  );
}

function BuilderPreview({ tab, content, tpl }) {
  return (
    <div className="bld-preview-frame" style={{ "--accent": tpl.accent }}>
      <div className="tpv-nav">
        <span className="brand" style={{ color: tpl.accent }}>{content.siteName}</span>
        <a href="#" style={{ color: tab === "home" ? tpl.accent : undefined, fontWeight: tab === "home" ? 600 : 400 }}>Home</a>
        <a href="#" style={{ color: tab === "about" ? tpl.accent : undefined, fontWeight: tab === "about" ? 600 : 400 }}>About</a>
        <a href="#" style={{ color: tab === "contact" ? tpl.accent : undefined, fontWeight: tab === "contact" ? 600 : 400 }}>Contact</a>
      </div>

      {tab === "home" && (
        <>
          <div className="tpv-hero">
            <h1>{content.tagline}</h1>
            <p>{content.heroLede}</p>
            <button className="btn" style={{ background: tpl.accent }}>{content.ctaLabel}</button>
          </div>
          <div className="tpv-grid">
            {content.features.map((f, i) => (
              <div className="tpv-feat" key={i}>
                <h4>{f.title}</h4>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "about" && (
        <div style={{ padding: 56, maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
          <h1 style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: 40, letterSpacing: "-0.015em", margin: "0 0 18px", color: tpl.accent }}>
            {content.aboutHeading || 'About the studio'}
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: "#3a3f3c", maxWidth: 56 + "ch", margin: "0 auto" }}>{content.about}</p>
          <div style={{ width: 200, height: 200, borderRadius: "50%", background: tpl.surface, margin: "32px auto 0", display: "flex", alignItems: "center", justifyContent: "center", color: tpl.accent, fontFamily: "var(--serif)", fontSize: 60 }}>
            {(content.siteName || tpl.name).split(" ").map(s => s[0]).slice(0, 2).join("").toLowerCase()}
          </div>
        </div>
      )}

      {tab === "contact" && (
        <div style={{ padding: 56 }}>
          <h1 style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: 40, letterSpacing: "-0.015em", margin: "0 0 22px", color: tpl.accent, textAlign: "center" }}>
            {content.contactHeading || 'Say hello'}
          </h1>
          <div className="tpv-contact">
            <div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.08 + "em", color: "#8a928e", fontWeight: 600 }}>Email</div>
                <div className="mono" style={{ fontSize: 15, marginTop: 4 }}>{content.contactEmail}</div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.08 + "em", color: "#8a928e", fontWeight: 600 }}>Phone</div>
                <div className="mono" style={{ fontSize: 15, marginTop: 4 }}>{content.contactPhone}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.08 + "em", color: "#8a928e", fontWeight: 600 }}>Visit</div>
                <div style={{ marginTop: 4, color: "#3a3f3c" }}>{content.contactAddress}</div>
              </div>
            </div>
            <div>
              <input className="input" placeholder="Your name" />
              <input className="input" placeholder="Email" style={{ marginTop: 10 }} />
              <textarea className="input" placeholder="Message" rows={4} style={{ marginTop: 10 }} />
              <button className="btn" style={{ background: tpl.accent, color: "#fff", width: "100%", marginTop: 10 }}>Send message</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PublishModal({ onClose, content, tpl, siteSlug, navigate, existingSiteId, existingPageId, onPublished }) {
  const [phase, setPhase] = useStateB("review"); // review | building | done
  const [publishError, setPublishError] = useStateB(null);
  const [liveUrl, setLiveUrl] = useStateB(`https://${siteSlug}.glondia.app`);
  const [deployResult, setDeployResult] = useStateB(null);

  const runPublish = async () => {
    setPhase("building");
    setPublishError(null);

    if (false) {
    if (false) {
      // Offline demo — animate and show done
      setTimeout(() => setPhase("done"), 2400);
      return;
    }
    }

    try {
      let sid = existingSiteId;
      let pid = existingPageId;

      // 1. Create site if no draft exists yet
      if (!sid) {
        const site = await createBuilderSite({
          name: content.siteName || tpl?.name || content._repository || 'Imported site',
          templateId: tpl?.id || null,
        });
        sid = site.id;
        pid = site.pages?.[0]?.id || null;
      }

      // 2. Save latest content
      if (pid) {
        await saveBuilderPage(sid, pid, content);
      }

      // 3. Publish locally and start a managed Render deployment session
      const published = await publishBuilderSite(sid);
      const deployment = await createRenderDeployment({
        siteId: sid,
        projectId: published?.projectId || sid,
        name: content.siteName || content._repository || tpl?.name || 'Glondia site',
        slug: published?.slug || siteSlug,
        serviceType: content._sandboxMode === 'node' ? 'web_service' : 'static_site',
        repoUrl: content._repository ? `https://github.com/${content._repository}` : null,
        sourceReference: content._sandboxPreviewUrl || content._source || 'builder',
        branch: content._branch || 'main',
        buildCommand: content._renderConfig?.buildCommand || content._sandboxBuildCommand || null,
        outputDirectory: content._sandboxOutputDirectory || 'dist',
        environment: 'production',
      });
      onPublished?.(sid, pid);
      onClose();
      navigate({ view: "hosting-detail", params: { id: deployment.deploymentId } });
    } catch (err) {
      setPublishError(err.message || "Publish failed. Please try again.");
      setPhase("review");
    }
  };

  // Demo fallback for unauthenticated state
  React.useEffect(() => {
    // no-op: actual publish logic is in runPublish
  }, [phase]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(5, 8, 7, 0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
           style={{
             width: "min(560px, 100%)",
             background: "var(--bg-elev)",
             borderRadius: "var(--r-lg)",
             boxShadow: "var(--shadow-lg)",
             overflow: "hidden",
           }}>
        {phase === "review" && (
          <>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
              <div className="row between">
                <h3 style={{ margin: 0, fontFamily: "var(--serif)", fontWeight: 500, fontSize: 22 }}>Publish your site</h3>
                <button className="btn btn-icon btn-ghost" onClick={onClose}><ICN.X size={16} /></button>
              </div>
            </div>
            <div style={{ padding: 24 }}>
              <p className="muted" style={{ marginTop: 0 }}>This will publish <b style={{ color: "var(--text)" }}>{content.siteName || content._repository || 'this site'}</b> to its customer hosting environment and start a production deployment.</p>
              <div className="kv" style={{ marginTop: 16 }}>
                <dt>Source</dt><dd>{content._repository ? <span className="mono">{content._repository}</span> : `${tpl?.name || 'Builder'} template`}</dd>
                <dt>Hosting</dt><dd className="mono">Dedicated customer environment</dd>
                <dt>Provider</dt><dd><Badge tone="success">Render</Badge></dd>
                <dt>Preview</dt><dd className="mono">{content._sandboxPreviewUrl || 'Current build output'}</dd>
              </div>
            </div>
            {publishError && (
              <div style={{ padding: "10px 24px", color: "var(--danger)", fontSize: 13 }}>{publishError}</div>
            )}
            <div style={{ padding: 16, borderTop: "1px solid var(--border)", display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn btn-outline" onClick={onClose}>Keep editing</button>
              <button className="btn btn-primary" onClick={runPublish}>
                <ICN.Rocket size={14} /> Publish now
              </button>
            </div>
          </>
        )}

        {phase === "building" && (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div style={{
              width: 64, height: 64, margin: "0 auto 18px",
              borderRadius: 999, background: "var(--accent-soft)", color: "var(--accent)",
              display: "flex", alignItems: "center", justifyContent: "center",
              animation: "pulse 1.2s ease-in-out infinite",
            }}>
              <ICN.Rocket size={28} />
            </div>
            <h3 style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: 26, margin: 0 }}>Starting deployment…</h3>
            <div className="muted" style={{ marginTop: 8 }}>Creating the hosting app and moving you to Hosting for live monitoring.</div>
            <div style={{ marginTop: 18, display: "grid", gap: 8, textAlign: "left" }}>
              {[
                'Saving latest customer content',
                'Preparing dedicated customer hosting',
                'Triggering Render deployment',
                'Preparing custom domain attachment',
              ].map((step) => (
                <div key={step} className="anim-slideUp" style={{ display: "grid", gridTemplateColumns: "22px 1fr", gap: 10, alignItems: "center", padding: "9px 10px", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--bg-deep)" }}>
                  <ICN.CheckCircle size={14} style={{ color: "var(--accent)" }} />
                  <span style={{ fontSize: 13 }}>{step}</span>
                </div>
              ))}
            </div>
            <div className="term" style={{ marginTop: 22, textAlign: "left", maxHeight: 180 }}>
              <div><span className="ts">14:24:01</span>  <span className="info">▲ Rendering 3 pages from {tpl.name} template</span></div>
              <div><span className="ts">14:24:04</span>  <span className="dim">  - Compiling components…</span></div>
              <div><span className="ts">14:24:09</span>  <span className="ok">  ✓ Pages built (Home, About, Contact)</span></div>
              <div><span className="ts">14:24:09</span>  <span className="info">  Uploading to CDN — 18 regions</span></div>
              <div><span className="ts">14:24:14</span>  <span className="info">  Issuing SSL for {siteSlug}.glondia.app</span></div>
            </div>
          </div>
        )}

        {phase === "done" && (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div style={{ width: 64, height: 64, margin: "0 auto 18px", borderRadius: 999, background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ICN.Check size={32} stroke={2.5} />
            </div>
            <h3 style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: 28, margin: 0 }}>Your site is live!</h3>
            <p className="muted" style={{ maxWidth: 40 + "ch", margin: "10px auto 0" }}>
              The Render deployment has started for the Glondiasites app. Visit the live link below, then attach a custom domain when you are ready.
            </p>
            {(deployResult?.serviceId || deployResult?.renderServiceId) && (
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                Render service <span className="mono">{deployResult.serviceId || deployResult.renderServiceId}</span>
              </div>
            )}
            <div style={{ marginTop: 22, padding: 14, background: "var(--bg-deep)", borderRadius: "var(--r-sm)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="mono" style={{ color: "var(--accent)" }}>{liveUrl}</span>
              <button className="btn btn-sm btn-outline" onClick={() => navigator.clipboard?.writeText(liveUrl)}><ICN.Copy size={12} /></button>
            </div>
            <div style={{ marginTop: 14, padding: 14, border: "1px solid var(--border)", borderRadius: "var(--r-sm)", textAlign: "left" }}>
              <div style={{ fontWeight: 700 }}>Attach a domain name</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Connect a custom domain to this published site from Domains.</div>
            </div>
            <div className="row" style={{ justifyContent: "center", gap: 10, marginTop: 24 }}>
              <button className="btn btn-outline" onClick={() => { onClose(); navigate({ view: "hosting-list" }); }}>View in hosting</button>
              <button className="btn btn-outline" onClick={() => { onClose(); navigate({ view: "domains" }); }}>Attach domain</button>
              <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                <ICN.ExternalLink size={14} /> Visit site
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

