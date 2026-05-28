// BuilderEditor.jsx — Form editor with live preview (advanced/internal flow).
import React, { useState as useStateB } from 'react';
import { ICN } from '../../../icons';
import { Badge, Tabs, ToggleRow, Empty } from '../../../components';
import { useTemplates } from '../../../use-templates';
import { useDomains } from '../../../use-domains';
import {
  createBuilderSite,
  saveBuilderPage,
  publishBuilderSite,
  createBuilderPage,
  deleteBuilderPage,
  getBuilderSite,
  listBuilderPages,
  createRenderDeployment,
  getRenderSettings,
  getStoredAuth,
  aiEditBuilderPage,
} from '../../../api';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
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

// ─────────────────────────────────────────────────────────────────────────────
// HtmlTemplateEditor — iframe preview + OpenAI chat panel
// ─────────────────────────────────────────────────────────────────────────────

function HtmlTemplateEditor({ allPages, currentPage, onSwitchPage, onHtmlChange, saving }) {
  const [prompt, setPrompt] = useStateB('');
  const [loading, setLoading] = useStateB(false);
  const [history, setHistory] = useStateB([]);
  const [error, setError] = useStateB(null);

  const html = currentPage?.content?.html || '';
  const pagePath = currentPage?.path || '/';

  const handleAiEdit = async (e) => {
    e.preventDefault();
    if (!prompt.trim() || !html) return;
    setLoading(true);
    setError(null);
    try {
      const result = await aiEditBuilderPage(html, prompt.trim(), pagePath);
      onHtmlChange(result.html);
      setHistory(prev => [{ prompt: prompt.trim(), summary: result.summary, ts: Date.now() }, ...prev]);
      setPrompt('');
    } catch (err) {
      setError(err.message || 'AI edit failed. Check your OPENAI_API_KEY.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 340px', height: 'calc(100vh - 140px)', gap: 0, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      {/* Page navigator */}
      <div style={{ borderRight: '1px solid var(--border)', background: 'var(--bg-deep)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, letterSpacing: '.06em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          Pages
        </div>
        {allPages.map((page) => (
          <button
            key={page.id}
            onClick={() => onSwitchPage(page)}
            style={{
              textAlign: 'left', padding: '11px 16px', background: currentPage?.id === page.id ? 'var(--bg-card)' : 'transparent',
              border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer',
              borderLeft: currentPage?.id === page.id ? '3px solid var(--accent)' : '3px solid transparent',
              color: currentPage?.id === page.id ? 'var(--text)' : 'var(--text-muted)', fontSize: 13
            }}
          >
            <div style={{ fontWeight: 500 }}>{page.title}</div>
            <div style={{ fontSize: 11, marginTop: 2, opacity: .6, fontFamily: 'monospace' }}>{page.path || '/'}</div>
          </button>
        ))}
      </div>

      {/* Live iframe preview */}
      <div style={{ background: '#000', position: 'relative', overflow: 'hidden' }}>
        {saving && (
          <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, background: 'rgba(0,0,0,.7)', color: '#fff', fontSize: 11, padding: '4px 10px', borderRadius: 4 }}>
            Saving…
          </div>
        )}
        <iframe
          sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
          srcDoc={html || '<!doctype html><html><body></body></html>'}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          title="Template preview"
        />
      </div>

      {/* AI chat panel */}
      <div style={{ borderLeft: '1px solid var(--border)', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ICN.Sparkles size={15} style={{ color: 'var(--accent)' }} />
            AI Editor
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            Describe what to change on this page — GPT-4o will edit the HTML for you.
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {history.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>
              <div style={{ marginBottom: 6, fontWeight: 500 }}>Try asking:</div>
              {[
                'Change the brand name to "NorthEdge"',
                'Update the accent colour to electric blue',
                'Rewrite the hero headline to target outdoor runners',
                'Add a 20% off sale banner at the top',
                'Translate the entire page to Spanish',
              ].map(s => (
                <button key={s} onClick={() => setPrompt(s)}
                  style={{ display: 'block', textAlign: 'left', padding: '7px 10px', marginBottom: 5, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', width: '100%' }}>
                  "{s}"
                </button>
              ))}
            </div>
          )}
          {history.map((h) => (
            <div key={h.ts} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', fontSize: 12 }}>
              <div style={{ fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>"{h.prompt}"</div>
              <div style={{ color: 'var(--accent)', fontSize: 11 }}>✓ {h.summary}</div>
            </div>
          ))}
          {error && (
            <div style={{ background: 'var(--danger-bg, #fff0f0)', border: '1px solid var(--danger)', borderRadius: 6, padding: '10px 12px', fontSize: 12, color: 'var(--danger)' }}>
              {error}
            </div>
          )}
        </div>
        <form onSubmit={handleAiEdit} style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiEdit(e); }}}
            placeholder="Describe what to change… (Enter to send)"
            rows={3}
            style={{ width: '100%', resize: 'vertical', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontFamily: 'inherit' }}
          />
          <button type="submit" disabled={loading || !prompt.trim()} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
            {loading ? <><ICN.RefreshCw size={14} /> Editing…</> : <><ICN.Sparkles size={14} /> Apply with AI</>}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper sub-components
// ─────────────────────────────────────────────────────────────────────────────

function FormGroup({ label, children }) {
  return (
    <div>
      {label && <div className="label">{label}</div>}
      {children}
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

function ImportedGithubWorkspace({ content, site, navigate }) {
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
        setRenderStatus({ loading: false, settings, deploys: [], error: settings?.error || null });
      })
      .catch((error) => setRenderStatus({ loading: false, settings: null, deploys: [], error: error.message }));
  }, []);

  React.useEffect(() => { refreshRenderStatus(); }, [refreshRenderStatus]);

  const renderActivationPayload = React.useCallback(() => {
    let packageJson = {};
    try { packageJson = contents['package.json'] ? JSON.parse(contents['package.json']) : {}; } catch { packageJson = {}; }
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
    setDeploying(true); setDeployMsg(null);
    try {
      const payload = renderActivationPayload();
      const deploymentPayload = {
        siteId: site?.id, projectId: site?.projectId || site?.id,
        renderServiceId: selectedRenderServiceId || undefined,
        name: payload.name, serviceType: payload.startCommand ? 'web_service' : 'static_site',
        repoUrl: payload.repoUrl, githubRepo: content._repository, branch: payload.branch,
        sourceReference: content._sandboxPreviewUrl || payload.repoUrl,
        buildCommand: payload.buildCommand, startCommand: payload.startCommand,
        outputDirectory: payload.outputDirectory, environment: 'production',
      };
      const deployment = await createRenderDeployment(deploymentPayload);
      setDeployMsg('Deployment started. Pay in Hosting → Billing to keep the site live.');
      navigate({ view: 'hosting-detail', params: { id: deployment.deploymentId } });
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
                {renderStatus.loading ? 'Checking hosting configuration...' : renderStatus.settings?.configured ? 'Ready to publish this app to a dedicated customer hosting environment.' : 'Hosting is not configured yet. Contact support before publishing.'}
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
              <ICN.Rocket size={13} /> {deploying ? "Deploying..." : "Deploy now"}
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
            <div style={{ marginTop: 18, color: "var(--danger)", fontSize: 13 }}>{content._sandboxError}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function PublishModal({ onClose, content, tpl, siteSlug, navigate, existingSiteId, existingPageId, onPublished }) {
  const [phase, setPhase] = useStateB("review");
  const [publishError, setPublishError] = useStateB(null);
  const [liveUrl, setLiveUrl] = useStateB(`https://${siteSlug}.glondia.app`);
  const [deployResult, setDeployResult] = useStateB(null);

  const runPublish = async () => {
    setPhase("building");
    setPublishError(null);
    try {
      let sid = existingSiteId;
      let pid = existingPageId;
      if (!sid) {
        const site = await createBuilderSite({
          name: content.siteName || tpl?.name || content._repository || 'Imported site',
          templateId: tpl?.id || null,
        });
        sid = site.id;
        pid = site.pages?.[0]?.id || null;
      }
      if (pid) { await saveBuilderPage(sid, pid, content); }
      const published = await publishBuilderSite(sid);
      const deployment = await createRenderDeployment({
        siteId: sid, projectId: published?.projectId || sid,
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

  React.useEffect(() => {}, [phase]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(5, 8, 7, 0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(560px, 100%)", background: "var(--bg-elev)", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-lg)", overflow: "hidden" }}>
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
            {publishError && <div style={{ padding: "10px 24px", color: "var(--danger)", fontSize: 13 }}>{publishError}</div>}
            <div style={{ padding: 16, borderTop: "1px solid var(--border)", display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn btn-outline" onClick={onClose}>Keep editing</button>
              <button className="btn btn-primary" onClick={runPublish}><ICN.Rocket size={14} /> Publish now</button>
            </div>
          </>
        )}

        {phase === "building" && (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div style={{ width: 64, height: 64, margin: "0 auto 18px", borderRadius: 999, background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", animation: "pulse 1.2s ease-in-out infinite" }}>
              <ICN.Rocket size={28} />
            </div>
            <h3 style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: 26, margin: 0 }}>Starting deployment…</h3>
            <div className="muted" style={{ marginTop: 8 }}>Creating the hosting app and moving you to Hosting for live monitoring.</div>
            <div style={{ marginTop: 18, display: "grid", gap: 8, textAlign: "left" }}>
              {['Saving latest customer content','Preparing dedicated customer hosting','Triggering Render deployment','Preparing custom domain attachment'].map((step) => (
                <div key={step} className="anim-slideUp" style={{ display: "grid", gridTemplateColumns: "22px 1fr", gap: 10, alignItems: "center", padding: "9px 10px", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--bg-deep)" }}>
                  <ICN.CheckCircle size={14} style={{ color: "var(--accent)" }} />
                  <span style={{ fontSize: 13 }}>{step}</span>
                </div>
              ))}
            </div>
            <div className="term" style={{ marginTop: 22, textAlign: "left", maxHeight: 180 }}>
              <div><span className="ts">14:24:01</span>  <span className="info">▲ Rendering 3 pages from {tpl?.name} template</span></div>
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

// ─────────────────────────────────────────────────────────────────────────────
// BuilderEditor — public export
// ─────────────────────────────────────────────────────────────────────────────

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
  const isHtmlTemplate = content._source === 'html-template' || tpl?.contentJson?._source === 'html-template';
  const [allPages, setAllPages] = useStateB([]);
  const [currentPage, setCurrentPage] = useStateB(null);
  const [savingHtml, setSavingHtml] = useStateB(false);

  const siteSlug = tpl
    ? (content.siteName || tpl.id).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || tpl.id
    : '';

  const update = (k, v) => setContent(prev => {
    const next = { ...prev, [k]: v };
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
        sid = site.id; pid = site.pages?.[0]?.id || null;
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

  React.useEffect(() => {
    if (initialSiteId) return;
    const templateContent = tpl?.contentJson;
    if (templateContent?._source !== 'html-template') return;
    const pages = Array.isArray(templateContent.pages) ? templateContent.pages : [];
    const synthetic = pages.map((p, i) => ({
      id: `tpl-preview-${i}`, title: p.title || `Page ${i + 1}`, path: p.path || '/',
      content: { _source: 'html-template', html: p.html || '', _filename: p.filename || `page${i}.html` },
      sortOrder: i,
    }));
    setAllPages(synthetic);
    if (synthetic.length > 0 && !currentPage) setCurrentPage(synthetic[0]);
    setContent(prev => ({ ...prev, _source: 'html-template' }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tpl?.id, initialSiteId]);

  React.useEffect(() => {
    if (!initialSiteId) return;
    getBuilderSite(initialSiteId).then(site => {
      if (!site) return;
      const homePage = site?.pages?.[0];
      if (homePage?.id) setPageId(homePage.id);
      if (homePage?.content && typeof homePage.content === 'object') {
        setContent(prev => ({ ...prev, siteName: site.name || prev.siteName, ...homePage.content }));
        if (homePage.content?._source === 'html-template') {
          setCurrentPage(homePage);
          listBuilderPages(initialSiteId).then(pages => { setAllPages(pages || []); }).catch(() => {});
        }
      }
      setSiteId(site.id);
      setLoadedSite(site);
    }).catch(() => {});
  }, [initialSiteId]);

  React.useEffect(() => () => clearTimeout(autoSaveTimer.current), []);

  if (templatesLoading && !tpl) {
    return <div style={{ padding: "80px 24px" }}><Empty icon="Layers" title="Loading templates…" /></div>;
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
              ) : tpl?.contentJson?.pages?.[0]?.html ? (
                <iframe
                  sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
                  srcDoc={tpl.contentJson.pages[0].html}
                  style={{ width: '229px', height: '147px', border: 'none', transform: 'scale(0.245)', transformOrigin: 'top left', pointerEvents: 'none', display: 'block' }}
                  title={`${tpl.name} thumbnail`}
                />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-deep)", color: "var(--text-muted)" }}>
                  <ICN.Layers size={16} />
                </div>
              )}
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
          <button className="btn btn-outline" onClick={() => siteId ? window.open(`https://${siteSlug}.glondia.app`, '_blank') : saveDraft()}>
            <ICN.Eye size={14} /> Preview live
          </button>
          <button className="btn btn-primary" onClick={() => isGithubImport ? window.dispatchEvent(new CustomEvent('glondia:imported-publish')) : setPublishing(true)}>
            <ICN.Rocket size={14} /> {isGithubImport ? "Deploy to Render" : "Publish"}
          </button>
        </div>
      </div>

      <div className="card card-flush" style={{ overflow: "hidden", margin: "0 -28px -28px", borderLeft: 0, borderRight: 0, borderBottom: 0, borderRadius: 0 }}>
        {isHtmlTemplate ? (
          <div style={{ padding: '20px 28px' }}>
            <HtmlTemplateEditor
              allPages={allPages.length > 0 ? allPages : (loadedSite?.pages || [])}
              currentPage={currentPage}
              saving={savingHtml}
              onSwitchPage={(page) => {
                setCurrentPage(page);
                setPageId(page.id);
                if (page.content) setContent(page.content);
              }}
              onHtmlChange={async (newHtml) => {
                const updated = { ...content, html: newHtml };
                setContent(updated);
                if (siteId && pageId) {
                  setSavingHtml(true);
                  saveBuilderPage(siteId, pageId, updated).catch(() => {}).finally(() => setSavingHtml(false));
                }
              }}
            />
          </div>
        ) : (
          <div className="bld-split">
            {isGithubImport
              ? <ImportedGithubWorkspace content={content} site={loadedSite} navigate={navigate} />
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
        )}
      </div>

      {publishing && <PublishModal onClose={() => setPublishing(false)} content={content} tpl={tpl} siteSlug={siteSlug} navigate={navigate} existingSiteId={siteId} existingPageId={pageId} onPublished={(sid, pid) => { setSiteId(sid); setPageId(pid); }} />}
    </>
  );
}
