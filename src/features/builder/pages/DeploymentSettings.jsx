// DeploymentSettings.jsx — Final step: preview, configure Render hosting, deploy.
import React, { useState as useStateB } from 'react';
import { ICN } from '../../../icons';
import { useTemplates } from '../../../use-templates';
import { createBuilderSite, publishBuilderSite, createRenderDeployment, getStoredAuth } from '../../../api';
import { deployTailoredTemplate, getTailoredTemplateSite, getTailoredTemplatePreviewUrl } from '../../../api/template-ai.js';

const PLAN_COPY = {
  starter: { label: 'Starter', estimate: '$0/mo while available on free/static hosting', note: 'Best for early preview sites and simple static launches.' },
  standard: { label: 'Standard', estimate: 'Estimated paid hosting plan', note: 'Use when traffic, builds, or uptime needs grow.' },
  pro: { label: 'Pro', estimate: 'Estimated higher-capacity hosting plan', note: 'Use for production sites that need more resources.' },
};

function DeployingOverlay({ siteName }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(5,7,6,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="card" style={{ width: 'min(520px, 100%)', padding: 28, textAlign: 'center' }}>
        <div style={{ width: 54, height: 54, borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <ICN.Rocket size={24} />
        </div>
        <h2 style={{ margin: '0 0 8px' }}>Uploading to Glondia Hosting</h2>
        <p className="muted" style={{ margin: 0 }}>Preparing {siteName || 'your site'}, generating files, and opening the Hosting dashboard.</p>
        <div className="ai-intake-progress" style={{ marginTop: 20 }}><div className="ai-intake-progress-bar" style={{ width: '72%' }} /></div>
      </div>
    </div>
  );
}

export function BuilderDeploymentSettings({ siteId, templateId, templateType, navigate }) {
  const { templates } = useTemplates();
  const template = templates.find(t => t.id === templateId) || null;

  const [siteName, setSiteName] = useStateB('');
  const [serviceType, setServiceType] = useStateB('static_site');
  const [plan, setPlan] = useStateB('starter');
  const [environment, setEnvironment] = useStateB('production');
  const [subdomain, setSubdomain] = useStateB('');
  const [repoUrl, setRepoUrl] = useStateB('');
  const [branch, setBranch] = useStateB('main');
  const [rootDirectory, setRootDirectory] = useStateB('');
  const [showAdvanced, setShowAdvanced] = useStateB(false);
  const [deploying, setDeploying] = useStateB(false);
  const [deployError, setDeployError] = useStateB(null);
  const [deployMsg, setDeployMsg] = useStateB(null);
  const [tailoredSite, setTailoredSite] = useStateB(null);
  const [previewPage, setPreviewPage] = useStateB(null);
  const [loadingPreview, setLoadingPreview] = useStateB(false);

  React.useEffect(() => {
    if (!siteId) return;
    setLoadingPreview(true);
    getTailoredTemplateSite(siteId)
      .then((site) => {
        setTailoredSite(site);
        if (site?.pages?.length > 0) setPreviewPage(site.pages[0]);
        if (site?.answers?.businessName) {
          setSiteName((current) => current || site.answers.businessName);
          setSubdomain((current) => current || slugify(site.answers.businessName));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingPreview(false));
  }, [siteId]);

  const tailoredPages = tailoredSite?.pages || [];
  const siteSlug = slugify(subdomain || siteName || 'my-site');
  const selectedPlan = PLAN_COPY[plan] || PLAN_COPY.starter;
  const buildCommand = 'npm run build';
  const publishDirectory = 'dist';
  const hasSourceRepo = Boolean(repoUrl.trim());

  const handleOpenPreview = () => {
    if (!siteId || tailoredPages.length === 0) {
      setDeployError('Preview is not ready yet. Regenerate the site with RoxanneAI first.');
      return;
    }
    const pageIndex = Math.max(0, tailoredPages.findIndex((page) => page === previewPage));
    const url = getTailoredTemplatePreviewUrl(siteId, pageIndex);
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) setDeployError('Browser blocked the preview popup. Allow popups and try again.');
  };

  const handleDeploy = async () => {
    if (!siteName.trim()) { setDeployError('Please enter a site name.'); return; }
    const { accessToken } = getStoredAuth();
    if (!accessToken) { setDeployError('Sign in to deploy.'); return; }

    setDeploying(true);
    setDeployError(null);
    setDeployMsg(null);

    try {
      let deployment;
      if (siteId) {
        deployment = await deployTailoredTemplate(siteId, {
          siteName: siteName.trim(),
          slug: siteSlug,
          serviceType,
          plan,
          environment,
          buildCommand,
          publishDirectory,
          source: 'template',
          sourceReference: `templates/${templateId}`,
          repoUrl: repoUrl.trim() || undefined,
          branch: branch.trim() || 'main',
          rootDirectory: rootDirectory.trim() || undefined,
        });
      } else {
        const site = await createBuilderSite({ name: siteName.trim(), templateId: templateId || null });
        const published = await publishBuilderSite(site.id);
        deployment = await createRenderDeployment({
          siteId: site.id, projectId: published?.projectId || site.id, name: siteName.trim(), slug: siteSlug,
          serviceType, sourceReference: 'builder', environment, repoUrl: repoUrl.trim() || undefined,
          branch: branch.trim() || 'main', rootDirectory: rootDirectory.trim() || undefined,
        });
      }

      setDeployMsg(deployment?.render?.attempted ? 'Hosting handoff started. Redirecting to Hosting settings...' : 'Generated site prepared. Redirecting to Hosting settings...');
      if (deployment?.deploymentId) window.setTimeout(() => navigate({ view: 'hosting-detail', params: { id: deployment.deploymentId } }), 700);
    } catch (err) {
      setDeployError(err.message || 'Deployment failed. Please try again.');
      setDeploying(false);
    }
  };

  return (
    <>
      {deploying && <DeployingOverlay siteName={siteName} />}

      <div className="page-head">
        <div>
          <a className="page-eyebrow" href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'builder-ai-intake', params: { templateId, templateType } }); }}>Site builder / RoxanneAI setup</a>
          <h1>Hosting handoff</h1>
          <p className="sub">Review the generated site, preview in a new tab, then send it to Hosting.</p>
        </div>
        <div className="actions">
          <button className="btn btn-outline" onClick={handleOpenPreview} disabled={tailoredPages.length === 0}><ICN.ExternalLink size={14} /> Preview site</button>
          <button className="btn btn-outline" onClick={() => navigate({ view: 'builder-templates' })}>← Templates</button>
        </div>
      </div>

      <div className={`deploy-settings-layout${tailoredPages.length > 0 ? ' deploy-settings-layout--with-preview' : ''}`}>
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div><div className="label">Generated from</div><div style={{ fontWeight: 600, fontSize: 15, marginTop: 4 }}>{template?.name || templateId || 'Selected template'}</div>{tailoredSite?.answers?.businessName && <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>Customized for {tailoredSite.answers.businessName}</div>}</div>
          <div><div className="label">Site name *</div><input className="input" value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="My awesome store" autoFocus /></div>
          <div><div className="label">Glondia subdomain</div><input className="input" value={subdomain} onChange={(e) => setSubdomain(e.target.value)} placeholder={slugify(siteName || 'my-site')} /><div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Will be available at <span className="mono">{siteSlug}.glondia.app</span></div></div>
          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><div><div className="label">Build command</div><input className="input mono" value={buildCommand} readOnly /></div><div><div className="label">Publish directory</div><input className="input mono" value={publishDirectory} readOnly /></div></div>
          <div><div className="label">Environment</div><select className="select" value={environment} onChange={(e) => setEnvironment(e.target.value)}><option value="production">Production</option><option value="preview">Preview</option></select></div>

          <div className="card" style={{ padding: 14, background: 'var(--bg-deep)', fontSize: 13 }}>
            <div className="row between" style={{ gap: 12 }}><div><div style={{ fontWeight: 600 }}>Source repository handoff</div><div className="muted" style={{ marginTop: 3 }}>Optional here. If blank, configured in the Glondia backend. Service controls stay in Hosting.</div></div><button type="button" className="btn btn-sm btn-outline" onClick={() => setShowAdvanced(!showAdvanced)}>{showAdvanced ? 'Hide' : 'Configure'}</button></div>
            {showAdvanced && <div style={{ display: 'grid', gap: 12, marginTop: 14 }}><div><div className="label">Repository URL</div><input className="input" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/pistion/glondia-generated-sites" /></div><div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><div><div className="label">Branch</div><input className="input" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" /></div><div><div className="label">Root directory</div><input className="input" value={rootDirectory} onChange={(e) => setRootDirectory(e.target.value)} placeholder={`generated-template-sites/${siteSlug}`} /></div></div></div>}
          </div>

          {deployError && <div style={{ color: 'var(--danger)', fontSize: 13, padding: '10px 12px', background: 'var(--danger-soft, #fff0f0)', border: '1px solid var(--danger)', borderRadius: 'var(--r-sm)' }}>{deployError}</div>}
          {deployMsg && <div style={{ color: 'var(--accent)', fontSize: 13 }}>{deployMsg}</div>}
          <div className="row" style={{ gap: 10, justifyContent: 'flex-end' }}><button className="btn btn-outline" onClick={() => navigate({ view: 'builder-ai-intake', params: { templateId, templateType } })}>← Back to RoxanneAI</button><button className="btn btn-outline" onClick={handleOpenPreview} disabled={tailoredPages.length === 0}><ICN.ExternalLink size={14} /> Preview site</button><button className="btn btn-primary" onClick={handleDeploy} disabled={deploying || !siteName.trim()}><ICN.Rocket size={14} /> Send to Hosting</button></div>
        </div>

        {tailoredPages.length > 0 && <div className="deploy-preview-column"><div className="deploy-preview-header"><div style={{ fontWeight: 600, fontSize: 13 }}>Generated site preview</div>{tailoredPages.length > 1 && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{tailoredPages.map((page, i) => <button key={i} className={`btn btn-sm ${previewPage === page ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPreviewPage(page)}>{page.title || `Page ${i + 1}`}</button>)}</div>}</div><iframe sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox" srcDoc={previewPage?.html || tailoredPages[0]?.html || '<!doctype html><html><body></body></html>'} className="deploy-preview-iframe" title="Tailored site preview" /></div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: 20 }}><div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>What happens when you send to Hosting</div>{['Backend saves the generated Vite React site files and JSON brief', hasSourceRepo ? 'Frontend sends your selected source repo to the backend' : 'Backend uses env source repo if configured', `Template copies publish under generated-template-sites/${siteSlug}`, 'A Hosting deployment record is created', 'You are redirected to Hosting settings either way', 'Hosting logs show deployment status and service setup'].map((step, i) => <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10, fontSize: 13 }}><div style={{ width: 22, height: 22, borderRadius: 999, flexShrink: 0, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{i + 1}</div><span style={{ paddingTop: 2 }}>{step}</span></div>)}</div>
          <div className="card" style={{ padding: 16, fontSize: 13 }}><div style={{ fontWeight: 600, marginBottom: 6 }}>Preview before handoff</div><div className="muted" style={{ marginBottom: 12 }}>Open the generated customized site through the backend preview route before creating the Hosting record.</div><button className="btn btn-sm btn-outline" onClick={handleOpenPreview} disabled={tailoredPages.length === 0}><ICN.ExternalLink size={14} /> Preview site</button></div>
          {loadingPreview && <div className="card" style={{ padding: 16, fontSize: 13 }}>Loading generated site...</div>}
        </div>
      </div>
    </>
  );
}

function slugify(value) { return String(value || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site'; }
