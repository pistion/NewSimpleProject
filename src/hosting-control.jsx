import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ICN } from './icons';
import { Badge, Empty, StatusBadge, Tabs } from './components';
import {
  getDeploymentLogStreamUrl,
  getHostingPaymentStatus,
  getHostingService,
  getRenderDeploymentStatus,
  getRenderSettings,
  listHostingDeployments,
  redeployRenderDeployment,
  suspendHostingDeployment,
  deleteHostingDeployment,
  verifyRenderDeploymentUrl,
  listHostingEnvVars,
  upsertHostingEnvVar,
  deleteHostingEnvVar,
  syncHostingEnvVars,
  listHostingDisks,
  attachHostingDisk,
  updateHostingDisk,
  deleteHostingDisk,
  listHostingDomains,
  addHostingDomain,
  deleteHostingDomain,
  verifyHostingDomain,
  updateHostingSettings,
} from './api';

// ── Source-type helpers ─────────────────────────────────────────────────────

function getHostingSourceType(app) {
  if (app?.source === 'zip-upload' || app?.generatedSite?.sourceType === 'uploaded-zip-source-artifact') return 'zip-upload';
  if (app?.source === 'ai-tailored-template' || app?.sourceReference === 'roxanne-ai-tailored-template') return 'roxanne-ai';
  if (app?.githubRepo || app?.source === 'github') return 'github';
  return 'builder';
}

function isZipUpload(app) { return getHostingSourceType(app) === 'zip-upload'; }
function isRoxanneGenerated(app) { return getHostingSourceType(app) === 'roxanne-ai'; }

function sourceLabel(app) {
  const t = getHostingSourceType(app);
  if (t === 'zip-upload') return 'ZIP Upload';
  if (t === 'roxanne-ai') return 'RoxanneAI generated';
  if (t === 'github') return 'GitHub import';
  return 'Builder';
}

function sourceBadgeTone(app) {
  const t = getHostingSourceType(app);
  if (t === 'zip-upload') return 'info';
  if (t === 'roxanne-ai') return 'info';
  if (t === 'github') return 'muted';
  return 'muted';
}

/** The root Render should pull from — NOT the local siteDir. */
function getRenderSourceRoot(app) {
  return (
    app?.generatedSite?.sourceArtifact?.targetRoot ||
    app?.generatedSite?.githubTargetRoot ||
    app?.render?.githubPublish?.targetRoot ||
    app?.environmentConfiguration?.rootDirectory ||
    ''
  );
}

function hasRealRenderId(id) { return id && !String(id).includes('_pending'); }

// ── Hosting List ────────────────────────────────────────────────────────────

export function HostingList({ navigate }) {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('apps');

  useEffect(() => {
    let cancelled = false;
    listHostingDeployments()
      .then((items) => { if (!cancelled) setApps(items || []); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Hosting apps could not be loaded.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Hosting</div>
          <h1>Render Hosting</h1>
          <p className="sub">Deploy and manage apps created from GitHub, ZIP imports, or RoxanneAI Site Builder templates.</p>
        </div>
        <div className="actions">
          {tab === 'apps' && (
            <>
              <button className="btn btn-outline" onClick={() => navigate({ view: 'builder-templates' })}><ICN.Layers size={14} /> Site builder</button>
              <button className="btn btn-primary" onClick={() => navigate({ view: 'builder-import', params: { mode: 'github' } })}><ICN.Git size={14} /> Deploy from GitHub</button>
            </>
          )}
        </div>
      </div>

      <Tabs value={tab} onChange={setTab} options={[{ value: 'apps', label: 'My apps' }, { value: 'settings', label: 'Settings' }]} />

      {tab === 'apps' ? (
        <>
          {error && <div className="card" style={{ padding: '10px 14px', color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
          {loading ? (
            <div className="card" style={{ padding: '42px 24px' }}><Empty icon="Server" title="Loading hosting apps..." /></div>
          ) : apps.length === 0 ? (
            <div className="card" style={{ padding: '48px 24px' }}>
              <Empty
                icon="Server"
                title="No hosted apps yet"
                body="Build with the Site Builder or deploy from GitHub to create your first hosting app."
                action={<button className="btn btn-primary" onClick={() => navigate({ view: 'builder-templates' })}><ICN.Layers size={14} /> Site builder</button>}
              />
            </div>
          ) : (
            <div className="grid-2">{apps.map((app) => <HostingAppCard key={app.deploymentId || app.id} app={app} navigate={navigate} />)}</div>
          )}
        </>
      ) : <HostingSettings />}
    </>
  );
}

// ── Hosting App Card ────────────────────────────────────────────────────────

function HostingAppCard({ app, navigate }) {
  const src = sourceLabel(app);
  const building = ['preparing', 'queued', 'building', 'deploying', 'verifying'].includes(app.status);
  return (
    <button
      type="button"
      className="card"
      onClick={() => navigate({ view: 'hosting-detail', params: { id: app.deploymentId || app.id } })}
      style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 14, color: 'inherit' }}
    >
      <div className="row between">
        <div className="row" style={{ gap: 12, minWidth: 0 }}>
          <span className="proj-thumb" style={{ width: 40, height: 40, fontSize: 15 }}>{(app.serviceName || app.siteName || 'A')[0]}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{app.serviceName || app.siteName}</div>
            <div className="mono faint" style={{ fontSize: 12 }}>{src}</div>
          </div>
        </div>
        <StatusBadge value={statusLabel(app.status)} />
      </div>
      <Badge tone={sourceBadgeTone(app)} dot={false}>{src}</Badge>
      {building && <DeploymentPulse compact />}
      <div className="kv" style={{ gridTemplateColumns: '110px 1fr', gap: '6px 14px' }}>
        <dt>Step</dt><dd>{app.currentStep || statusLabel(app.status)}</dd>
        <dt>Build</dt><dd className="mono">{app.buildStatus || 'pending'}</dd>
        <dt>Live URL</dt><dd className="mono">{app.liveUrl ? app.liveUrl.replace(/^https?:\/\//, '') : 'Pending'}</dd>
        <dt>Source</dt><dd className="mono">{src}</dd>
      </div>
      <div className="row" style={{ gap: 8 }}>
        {app.liveUrl && <a className="btn btn-sm btn-outline" href={app.liveUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}><ICN.ExternalLink size={13} /> View Live Site</a>}
        <span className="btn btn-sm btn-primary">Manage</span>
      </div>
    </button>
  );
}

// ── Hosting Detail ──────────────────────────────────────────────────────────

export function HostingDetail({ id, navigate }) {
  const deploymentId = id;
  const [app, setApp] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState('Overview');

  const load = useCallback(async () => {
    const [hosting, nextStatus] = await Promise.all([
      getHostingService(deploymentId),
      getRenderDeploymentStatus(deploymentId).catch(() => null),
    ]);
    setApp(hosting);
    setStatus(nextStatus);
  }, [deploymentId]);

  useEffect(() => {
    let cancelled = false;
    const run = () => load().catch((err) => { if (!cancelled) setError(err.message || 'Hosting app could not be loaded.'); }).finally(() => { if (!cancelled) setLoading(false); });
    run();
    const interval = setInterval(run, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [deploymentId, load]);

  const merged = useMemo(() => ({ ...(app || {}), ...(status || {}) }), [app, status]);
  const isDeleted = merged.status === 'deleted';

  const runAction = async (name, fn) => {
    setBusy(name);
    setError('');
    try { await fn(); await load(); } catch (err) { setError(err.message || 'Action failed.'); } finally { setBusy(''); }
  };

  if (loading) return <div className="card" style={{ padding: 42 }}><Empty icon="Server" title="Loading hosting app..." /></div>;
  if (!app) return <div className="card" style={{ padding: 42 }}><Empty icon="AlertCircle" title="Hosting app not found" action={<button className="btn btn-outline" onClick={() => navigate({ view: 'hosting-list' })}>Back to Hosting</button>} /></div>;

  const src = sourceLabel(merged);

  return (
    <>
      <div className="page-head">
        <div>
          <button className="page-eyebrow" style={{ background: 'none', border: 0, padding: 0, color: 'var(--text-muted)' }} onClick={() => navigate({ view: 'hosting-list' })}>Back to Hosting</button>
          <div className="row" style={{ gap: 14, marginTop: 8 }}>
            <span className="proj-thumb" style={{ width: 44, height: 44, fontSize: 16 }}>{(merged.serviceName || 'A')[0]}</span>
            <div>
              <h1 style={{ margin: 0 }}>{merged.serviceName || merged.siteName}</h1>
              <div className="row" style={{ gap: 10, marginTop: 6, color: 'var(--text-muted)', fontSize: 13, flexWrap: 'wrap' }}>
                <span className="mono">{hasRealRenderId(merged.renderServiceId) ? merged.renderServiceId : merged.deploymentId}</span>
                <span>·</span>
                <StatusBadge value={statusLabel(merged.status)} />
                <Badge tone={sourceBadgeTone(merged)} dot={false}>{src}</Badge>
              </div>
            </div>
          </div>
        </div>
        <div className="actions">
          {merged.liveUrl && <a className="btn btn-outline" href={merged.liveUrl} target="_blank" rel="noopener noreferrer"><ICN.ExternalLink size={14} /> View Live Site</a>}
          {merged.liveUrl && <button className="btn btn-outline" onClick={() => navigator.clipboard?.writeText(merged.liveUrl)}><ICN.Copy size={14} /> Copy URL</button>}
          <button className="btn btn-primary" disabled={!!busy || isDeleted} onClick={() => runAction('redeploy', () => redeployRenderDeployment(deploymentId))}><ICN.Refresh size={14} /> Redeploy</button>
        </div>
      </div>

      {error && <div className="card" style={{ padding: '10px 14px', color: 'var(--danger)', fontSize: 13 }}>{error}</div>}

      <div className="grid-side">
        <DeploymentStatusPanel app={merged} onVerify={() => runAction('verify', () => verifyRenderDeploymentUrl(deploymentId))} busy={busy} />
        <AdminPanel
          app={merged}
          busy={busy}
          onSuspend={() => window.confirm('Suspend this site?') && runAction('suspend', () => suspendHostingDeployment(deploymentId))}
          onDelete={() => window.confirm('Delete this hosted site? This cannot be undone.') && runAction('delete', async () => { await deleteHostingDeployment(deploymentId); navigate({ view: 'hosting-list' }); })}
        />
      </div>

      <Tabs value={tab} onChange={setTab} options={['Overview', 'Billing', 'Build Logs', 'Render Settings', 'Env Vars', 'Domains']} />

      {tab === 'Overview' && <OverviewTab app={merged} deploymentId={deploymentId} />}
      {tab === 'Billing' && <BillingTab deploymentId={deploymentId} />}
      {tab === 'Build Logs' && <LiveLogsPanel deploymentId={deploymentId} />}
      {tab === 'Render Settings' && <RenderSettingsTab app={merged} deploymentId={deploymentId} onReload={load} />}
      {tab === 'Env Vars' && <EnvVarsTab deploymentId={deploymentId} />}
      {tab === 'Domains' && <DomainsTab app={merged} deploymentId={deploymentId} />}
    </>
  );
}

// ── Deployment Status Panel ─────────────────────────────────────────────────

function DeploymentStatusPanel({ app, onVerify, busy }) {
  const hasRealRenderService = hasRealRenderId(app.renderServiceId);
  const hasRealRenderDeploy = hasRealRenderId(app.renderDeployId);
  const renderAttempted = Boolean(app.render?.attempted || hasRealRenderService || hasRealRenderDeploy);
  const renderPending = !renderAttempted && (String(app.renderServiceId || '').includes('_pending') || app.render?.skippedReason);
  const shouldAnimate = ['preparing', 'queued', 'building', 'deploying', 'verifying'].includes(app.status) && !renderPending;
  const src = sourceLabel(app);

  return (
    <div className="card">
      <div className="row between">
        <div>
          <div className="page-eyebrow" style={{ marginBottom: 6 }}>{src} deployment status</div>
          <h2 style={{ margin: 0 }}>{statusLabel(app.status)}</h2>
        </div>
        <StatusBadge value={statusLabel(app.status)} />
      </div>
      {(isZipUpload(app) || isRoxanneGenerated(app)) && <SourcePackageBlock app={app} />}
      {renderAttempted && <RenderStartedBlock app={app} />}
      {!renderAttempted && renderPending && <RenderNotStartedBlock app={app} />}
      {shouldAnimate && <DeploymentPulse />}
      {app.status === 'failed' && <FailureBlock app={app} />}
      {app.status === 'live' && <SuccessBlock app={app} />}
      {app.status === 'deployed_unverified' && <WarmingBlock app={app} />}
      <div className="kv" style={{ marginTop: 16, gridTemplateColumns: '150px 1fr' }}>
        <dt>Current step</dt><dd>{app.currentStep || statusLabel(app.status)}</dd>
        <dt>Build status</dt><dd className="mono">{app.buildStatus || 'pending'}</dd>
        <dt>Render handoff</dt><dd>{renderAttempted ? 'Started' : renderPending ? 'Waiting for configuration' : 'Ready'}</dd>
        <dt>URL verification</dt><dd>{app.urlReachable ? 'Reachable' : app.liveUrl ? 'Warming up' : 'Pending URL'}</dd>
      </div>
      {app.liveUrl && !app.urlReachable && <button className="btn btn-sm btn-outline" style={{ marginTop: 14 }} onClick={onVerify} disabled={busy === 'verify'}><ICN.Refresh size={13} /> Retry URL verification</button>}
    </div>
  );
}

// ── Source Package Block (ZIP + RoxanneAI) ──────────────────────────────────

function SourcePackageBlock({ app }) {
  const generated = app.generatedSite || {};
  const zip = isZipUpload(app);
  const renderRoot = getRenderSourceRoot(app);
  const sourceRepo = app.environmentConfiguration?.sourceRepository || '';
  return (
    <div style={{ marginTop: 18, padding: 14, border: '1px solid var(--accent)', borderRadius: 'var(--r-sm)', background: 'var(--accent-soft)' }}>
      <div className="row" style={{ gap: 8, color: 'var(--accent)', fontWeight: 700 }}>
        <ICN.CheckCircle size={16} /> {zip ? 'ZIP source package prepared' : 'Generated Vite React site prepared'}
      </div>
      <div className="kv" style={{ marginTop: 10, gridTemplateColumns: '155px 1fr', fontSize: 12.5 }}>
        {zip && generated.uploadedFileName && <><dt>Uploaded file</dt><dd className="mono">{generated.uploadedFileName}</dd></>}
        <dt>Deployable files</dt><dd>{Array.isArray(generated.files) ? generated.files.length : 0}</dd>
        {zip && Array.isArray(generated.ignoredFiles) && <><dt>Ignored files</dt><dd>{generated.ignoredFiles.length}</dd></>}
        <dt>Framework</dt><dd className="mono">{generated.framework || generated.projectType || 'vite-react'}</dd>
        {sourceRepo && <><dt>Source repository</dt><dd className="mono" style={{ wordBreak: 'break-all' }}>{sourceRepo}</dd></>}
        {renderRoot && <><dt>Render root directory</dt><dd className="mono" style={{ wordBreak: 'break-all' }}>{renderRoot}</dd></>}
        {generated.siteDir && <><dt>Internal storage path</dt><dd className="mono" style={{ wordBreak: 'break-all', opacity: 0.7 }}>{generated.siteDir}</dd></>}
      </div>
    </div>
  );
}

// ── Render Started Block ────────────────────────────────────────────────────

function RenderStartedBlock({ app }) {
  return (
    <div style={{ marginTop: 18, padding: 14, border: '1px solid var(--accent)', borderRadius: 'var(--r-sm)', background: 'var(--bg-deep)' }}>
      <div className="row" style={{ gap: 8, color: 'var(--accent)', fontWeight: 700 }}><ICN.CheckCircle size={16} /> Render deployment started</div>
      <div className="kv" style={{ marginTop: 10, gridTemplateColumns: '130px 1fr', fontSize: 12.5 }}>
        <dt>Service ID</dt><dd className="mono">{hasRealRenderId(app.renderServiceId) ? app.renderServiceId : 'Pending'}</dd>
        <dt>Deploy ID</dt><dd className="mono">{hasRealRenderId(app.renderDeployId) ? app.renderDeployId : 'Pending'}</dd>
        <dt>Current step</dt><dd>{app.currentStep || statusLabel(app.status)}</dd>
        {app.liveUrl && <><dt>Live URL</dt><dd className="mono" style={{ wordBreak: 'break-all' }}><a href={app.liveUrl} target="_blank" rel="noopener noreferrer">{app.liveUrl}</a></dd></>}
      </div>
    </div>
  );
}

function RenderNotStartedBlock({ app }) {
  const reason = app.render?.skippedReason || app.errorMessage || 'Render has not received a deployable source repository/API configuration yet.';
  return (
    <div style={{ marginTop: 18, padding: 14, border: '1px solid var(--warning)', borderRadius: 'var(--r-sm)', background: 'var(--bg-deep)' }}>
      <div className="row" style={{ gap: 8, color: 'var(--warning)', fontWeight: 700 }}><ICN.AlertCircle size={16} /> Render handoff pending</div>
      <div className="muted" style={{ marginTop: 8 }}>{reason}</div>
      <div className="mono" style={{ marginTop: 8, fontSize: 12 }}>Required: RENDER_API_KEY and RENDER_OWNER_ID. For generated sites, also set RENDER_GENERATED_SITES_REPO_URL.</div>
    </div>
  );
}

function DeploymentPulse({ compact = false }) {
  return (
    <div style={{ marginTop: compact ? 0 : 18, display: 'grid', gap: 8 }}>
      <div style={{ height: compact ? 6 : 8, borderRadius: 999, background: 'var(--bg-deep)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: '42%', background: 'var(--accent)', borderRadius: 999, animation: 'pulse 1.2s ease-in-out infinite' }} />
      </div>
      {!compact && <div className="muted" style={{ fontSize: 13 }}>Preparing, sending to Render, building, deploying, then verifying the live URL.</div>}
    </div>
  );
}

function SuccessBlock({ app }) {
  return <div style={{ marginTop: 18, padding: 14, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--bg-deep)' }}><div className="row" style={{ gap: 8, color: 'var(--accent)', fontWeight: 700 }}><ICN.CheckCircle size={16} /> Deployment is live</div><div className="mono" style={{ marginTop: 8, wordBreak: 'break-all' }}>{app.liveUrl}</div></div>;
}

function WarmingBlock({ app }) {
  return <div style={{ marginTop: 18, padding: 14, border: '1px solid var(--warning)', borderRadius: 'var(--r-sm)', background: 'var(--bg-deep)' }}><div className="row" style={{ gap: 8, color: 'var(--warning)', fontWeight: 700 }}><ICN.Refresh size={16} /> Deployed, still warming up</div><div className="mono" style={{ marginTop: 8, wordBreak: 'break-all' }}>{app.liveUrl || 'URL pending from Render'}</div></div>;
}

function FailureBlock({ app }) {
  return <div style={{ marginTop: 18, padding: 14, border: '1px solid var(--danger)', borderRadius: 'var(--r-sm)', background: 'var(--bg-deep)' }}><div className="row" style={{ gap: 8, color: 'var(--danger)', fontWeight: 700 }}><ICN.AlertCircle size={16} /> Deployment failed</div><div className="muted" style={{ marginTop: 8 }}>{app.errorMessage || 'Review logs and settings, then redeploy.'}</div></div>;
}

function AdminPanel({ app, busy, onSuspend, onDelete }) {
  const realService = hasRealRenderId(app.renderServiceId);
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Admin controls</h2>
      <div className="kv" style={{ gridTemplateColumns: '140px 1fr', marginBottom: 16 }}>
        <dt>Deployment ID</dt><dd className="mono">{app.deploymentId}</dd>
        <dt>Render service</dt><dd className="mono">{realService ? app.renderServiceId : 'Pending configuration'}</dd>
        <dt>Render deploy</dt><dd className="mono">{hasRealRenderId(app.renderDeployId) ? app.renderDeployId : 'Pending'}</dd>
        <dt>Created</dt><dd>{formatDate(app.createdAt)}</dd>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        <button className="btn btn-outline" disabled={!realService || busy === 'suspend' || app.status === 'suspended' || app.status === 'deleted'} onClick={onSuspend}><ICN.Power size={14} /> Suspend Site</button>
        <button className="btn btn-danger" disabled={!realService || busy === 'delete' || app.status === 'deleted'} onClick={onDelete}><ICN.Trash size={14} /> Delete Site</button>
      </div>
    </div>
  );
}

// ── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ app, deploymentId }) {
  const generated = app.generatedSite || {};
  const settings = app.environmentConfiguration || {};
  const renderRoot = getRenderSourceRoot(app);
  return (
    <div className="grid-side">
      <div style={{ display: 'grid', gap: 16 }}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Hosting app</h2>
          <div className="kv">
            <dt>Source</dt><dd className="mono">{sourceLabel(app)}</dd>
            <dt>Branch</dt><dd className="mono">{app.githubBranch || settings.branch || 'main'}</dd>
            <dt>Service type</dt><dd><Badge tone="info" dot={false}>{app.serviceType}</Badge></dd>
            <dt>Live URL</dt><dd className="mono">{app.liveUrl || 'Pending'}</dd>
            {settings.sourceRepository && <><dt>Source repository</dt><dd className="mono" style={{ wordBreak: 'break-all' }}>{settings.sourceRepository}</dd></>}
            {renderRoot && <><dt>Render root</dt><dd className="mono" style={{ wordBreak: 'break-all' }}>{renderRoot}</dd></>}
            <dt>Build command</dt><dd className="mono">{settings.buildCommand || generated.buildCommand || 'Not set'}</dd>
            <dt>Publish directory</dt><dd className="mono">{settings.outputDirectory || generated.publishDirectory || 'dist'}</dd>
          </div>
        </div>
        {(isZipUpload(app) || isRoxanneGenerated(app)) && (
          <div className="card">
            <h2 style={{ marginTop: 0 }}>{isZipUpload(app) ? 'ZIP package details' : 'Generated site package'}</h2>
            <div className="kv">
              {generated.uploadedFileName && <><dt>Uploaded file</dt><dd className="mono">{generated.uploadedFileName}</dd></>}
              <dt>Framework</dt><dd className="mono">{generated.framework || generated.projectType || 'vite-react'}</dd>
              <dt>Package manager</dt><dd className="mono">{generated.packageManager || 'npm'}</dd>
              <dt>Deployable files</dt><dd>{Array.isArray(generated.files) ? generated.files.length : 0}</dd>
              {Array.isArray(generated.ignoredFiles) && <><dt>Ignored files</dt><dd>{generated.ignoredFiles.length}</dd></>}
              {generated.siteDir && <><dt>Internal storage path</dt><dd className="mono" style={{ wordBreak: 'break-all', opacity: 0.7, fontSize: 12 }}>{generated.siteDir}</dd></>}
              {Array.isArray(generated.pages) && generated.pages.length > 0 && <><dt>Pages</dt><dd>{generated.pages.map((p) => p.title).join(', ')}</dd></>}
            </div>
          </div>
        )}
      </div>
      <LiveLogsPanel deploymentId={deploymentId} compact />
    </div>
  );
}

// ── Render Settings Tab (editable) ──────────────────────────────────────────

function RenderSettingsTab({ app, deploymentId, onReload }) {
  const settings = app.environmentConfiguration || {};
  const render = app.render || {};
  const realService = hasRealRenderId(app.renderServiceId);
  const isWebService = app.serviceType === 'web_service';

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [form, setForm] = useState({
    serviceType: app.serviceType || 'static_site',
    branch: settings.branch || 'main',
    rootDirectory: settings.rootDirectory || '',
    buildCommand: settings.buildCommand || '',
    outputDirectory: settings.outputDirectory || '',
    startCommand: settings.startCommand || '',
    plan: app.plan || 'starter',
    sourceRepository: settings.sourceRepository || '',
  });

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await updateHostingSettings(deploymentId, { render: form });
      setEditing(false);
      if (onReload) await onReload();
    } catch (err) {
      setSaveError(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid-side">
      <div className="card">
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Render service settings</h2>
          {!editing && <button className="btn btn-sm btn-outline" onClick={() => setEditing(true)}><ICN.Edit size={13} /> Edit</button>}
        </div>
        {saveError && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{saveError}</div>}
        {editing ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <label><span className="label">Service type</span>
              <select className="input" value={form.serviceType} onChange={(e) => update('serviceType', e.target.value)}>
                <option value="static_site">Static Site</option>
                <option value="web_service">Web Service</option>
              </select>
            </label>
            <label><span className="label">Source repository</span><input className="input mono" value={form.sourceRepository} onChange={(e) => update('sourceRepository', e.target.value)} placeholder="https://github.com/owner/repo" /></label>
            <label><span className="label">Branch</span><input className="input mono" value={form.branch} onChange={(e) => update('branch', e.target.value)} /></label>
            <label><span className="label">Root directory</span><input className="input mono" value={form.rootDirectory} onChange={(e) => update('rootDirectory', e.target.value)} placeholder="./" /></label>
            <label><span className="label">Build command</span><input className="input mono" value={form.buildCommand} onChange={(e) => update('buildCommand', e.target.value)} /></label>
            {form.serviceType === 'static_site' ? (
              <label><span className="label">Publish directory</span><input className="input mono" value={form.outputDirectory} onChange={(e) => update('outputDirectory', e.target.value)} placeholder="dist" /></label>
            ) : (
              <label><span className="label">Start command</span><input className="input mono" value={form.startCommand} onChange={(e) => update('startCommand', e.target.value)} placeholder="npm start" /></label>
            )}
            <label><span className="label">Plan</span><input className="input mono" value={form.plan} onChange={(e) => update('plan', e.target.value)} /></label>
            <div className="row" style={{ gap: 8, marginTop: 6 }}>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save settings'}</button>
              <button className="btn btn-outline" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="kv">
            <dt>Service ID</dt><dd className="mono">{realService ? app.renderServiceId : 'Pending configuration'}</dd>
            <dt>Deploy ID</dt><dd className="mono">{hasRealRenderId(app.renderDeployId) ? app.renderDeployId : 'Pending'}</dd>
            <dt>Service type</dt><dd>{app.serviceType}</dd>
            <dt>Source repository</dt><dd className="mono" style={{ wordBreak: 'break-all' }}>{settings.sourceRepository || app.repoUrl || 'Not configured'}</dd>
            <dt>Branch</dt><dd className="mono">{settings.branch || 'main'}</dd>
            <dt>Root directory</dt><dd className="mono" style={{ wordBreak: 'break-all' }}>{getRenderSourceRoot(app) || 'Not set'}</dd>
            <dt>Build command</dt><dd className="mono">{settings.buildCommand || 'Not set'}</dd>
            <dt>Output directory</dt><dd className="mono">{settings.outputDirectory || 'Not set'}</dd>
            {isWebService && <><dt>Start command</dt><dd className="mono">{settings.startCommand || 'Not set'}</dd></>}
            <dt>Plan</dt><dd className="mono">{app.plan || 'starter'}</dd>
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Handoff status</h2>
        <div className="kv">
          <dt>Configured</dt><dd>{render.configured ? 'Yes' : 'No / unknown'}</dd>
          <dt>Attempted</dt><dd>{render.attempted ? 'Yes' : 'No'}</dd>
          <dt>Skipped reason</dt><dd className="mono" style={{ wordBreak: 'break-word' }}>{render.skippedReason || 'None'}</dd>
          <dt>Error</dt><dd className="mono" style={{ wordBreak: 'break-word' }}>{render.error?.message || app.errorMessage || 'None'}</dd>
        </div>
      </div>

      {isWebService && <DiskPanel deploymentId={deploymentId} />}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Database</h2>
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>
          <ICN.Database size={24} style={{ opacity: 0.5, marginBottom: 8 }} />
          <div style={{ fontWeight: 600, marginBottom: 4 }}>PostgreSQL database</div>
          <div className="muted" style={{ fontSize: 13 }}>Database provisioning is coming soon. Render Postgres databases will be managed here.</div>
        </div>
      </div>
    </div>
  );
}

// ── Disk Panel ──────────────────────────────────────────────────────────────

function DiskPanel({ deploymentId }) {
  const [disks, setDisks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', mountPath: '/data', sizeGB: 1 });
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    listHostingDisks(deploymentId).then(setDisks).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [deploymentId]);

  useEffect(reload, [reload]);

  const handleAdd = async () => {
    setBusy(true); setError('');
    try { await attachHostingDisk(deploymentId, form); setAdding(false); setForm({ name: '', mountPath: '/data', sizeGB: 1 }); reload(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const handleDelete = async (diskId) => {
    if (!window.confirm('Delete this disk?')) return;
    setBusy(true); setError('');
    try { await deleteHostingDisk(deploymentId, diskId); reload(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="card">
      <div className="row between"><h2 style={{ margin: 0 }}>Persistent Disk</h2><button className="btn btn-sm btn-outline" onClick={() => setAdding(!adding)}>+ Add disk</button></div>
      {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{error}</div>}
      {adding && (
        <div style={{ display: 'grid', gap: 8, marginTop: 12, padding: 12, background: 'var(--bg-deep)', borderRadius: 'var(--r-sm)' }}>
          <label><span className="label">Disk name</span><input className="input mono" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="my-disk" /></label>
          <label><span className="label">Mount path</span><input className="input mono" value={form.mountPath} onChange={(e) => setForm((f) => ({ ...f, mountPath: e.target.value }))} /></label>
          <label><span className="label">Size (GB)</span><input type="number" className="input mono" min={1} max={1024} value={form.sizeGB} onChange={(e) => setForm((f) => ({ ...f, sizeGB: Number(e.target.value) }))} /></label>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={busy}>{busy ? 'Creating...' : 'Create disk'}</button>
            <button className="btn btn-outline btn-sm" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}
      {loading ? <div className="muted" style={{ marginTop: 10 }}>Loading disks...</div> : disks.length === 0 ? <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>No disks attached. Web services can use persistent disks for storage.</div> : (
        <div style={{ marginTop: 12 }}>
          {disks.map((d) => (
            <div key={d.diskId} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div><div className="mono" style={{ fontWeight: 600 }}>{d.name}</div><div className="muted" style={{ fontSize: 12 }}>{d.mountPath} · {d.sizeGB} GB</div></div>
              <button className="btn btn-sm btn-danger" onClick={() => handleDelete(d.diskId)} disabled={busy}><ICN.Trash size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Environment Variables Tab ───────────────────────────────────────────────

function EnvVarsTab({ deploymentId }) {
  const [vars, setVars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const reload = useCallback(() => {
    listHostingEnvVars(deploymentId).then((r) => setVars(Array.isArray(r) ? r : [])).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [deploymentId]);

  useEffect(reload, [reload]);

  const handleAdd = async () => {
    if (!newKey.trim()) return;
    setBusy(true); setError('');
    try { await upsertHostingEnvVar(deploymentId, { key: newKey.trim(), value: newValue }); setNewKey(''); setNewValue(''); reload(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const handleDelete = async (key) => {
    setBusy(true); setError('');
    try { await deleteHostingEnvVar(deploymentId, key); reload(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const handleSync = async () => {
    setBusy(true); setError(''); setSyncMsg('');
    try { const r = await syncHostingEnvVars(deploymentId); setSyncMsg(`Synced ${r.synced || 0} env vars to Render. Redeploy to apply.`); reload(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Environment Variables</h2>
        <button className="btn btn-sm btn-outline" onClick={handleSync} disabled={busy}>Sync to Render</button>
      </div>
      {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>{error}</div>}
      {syncMsg && <div style={{ color: 'var(--accent)', fontSize: 13, marginBottom: 8 }}>{syncMsg}</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input className="input mono" placeholder="KEY" value={newKey} onChange={(e) => setNewKey(e.target.value)} style={{ flex: '0 0 200px' }} />
        <input className="input mono" placeholder="value" value={newValue} onChange={(e) => setNewValue(e.target.value)} style={{ flex: 1 }} />
        <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={busy || !newKey.trim()}>Add</button>
      </div>

      {loading ? <div className="muted">Loading...</div> : vars.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>No environment variables configured.</div> : (
        <div style={{ display: 'grid', gap: 2 }}>
          {vars.map((v) => (
            <div key={v.key} className="row between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <div className="row" style={{ gap: 12, minWidth: 0 }}>
                <span className="mono" style={{ fontWeight: 600, minWidth: 140 }}>{v.key}</span>
                <span className="mono muted" style={{ fontSize: 12 }}>{v.valuePreview || 'hidden'}</span>
              </div>
              <button className="btn btn-sm btn-danger" onClick={() => handleDelete(v.key)} disabled={busy}><ICN.Trash size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Custom Domains Tab ──────────────────────────────────────────────────────

function DomainsTab({ app, deploymentId }) {
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    listHostingDomains(deploymentId).then((r) => setDomains(Array.isArray(r) ? r : [])).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [deploymentId]);

  useEffect(reload, [reload]);

  const handleAdd = async () => {
    if (!newDomain.trim()) return;
    setBusy(true); setError('');
    try { await addHostingDomain(deploymentId, { domain: newDomain.trim() }); setNewDomain(''); reload(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const handleDelete = async (domainId) => {
    if (!window.confirm('Remove this domain?')) return;
    setBusy(true); setError('');
    try { await deleteHostingDomain(deploymentId, domainId); reload(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const handleVerify = async (domainId) => {
    setBusy(true); setError('');
    try { await verifyHostingDomain(deploymentId, domainId); reload(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Custom Domains</h2>
      {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input className="input mono" placeholder="example.com" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} style={{ flex: 1 }} onKeyDown={(e) => e.key === 'Enter' && handleAdd()} />
        <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={busy || !newDomain.trim()}>Add domain</button>
      </div>

      {loading ? <div className="muted">Loading...</div> : domains.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>No custom domains. Add one above.</div> : (
        <div style={{ display: 'grid', gap: 12 }}>
          {domains.map((d) => (
            <div key={d.domainId} style={{ padding: 12, background: 'var(--bg-deep)', borderRadius: 'var(--r-sm)' }}>
              <div className="row between">
                <div>
                  <div className="mono" style={{ fontWeight: 600 }}>{d.name}</div>
                  <div className="row" style={{ gap: 8, marginTop: 4 }}>
                    <Badge tone={d.status === 'active' ? 'success' : 'warn'} dot={false}>{d.verificationStatus || d.status}</Badge>
                    {d.sslStatus && <Badge tone={String(d.sslStatus).includes('issued') ? 'success' : 'muted'} dot={false}>SSL: {d.sslStatus}</Badge>}
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn btn-sm btn-outline" onClick={() => handleVerify(d.domainId)} disabled={busy}>Verify</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(d.domainId)} disabled={busy}><ICN.Trash size={12} /></button>
                </div>
              </div>
              {Array.isArray(d.dnsRecords) && d.dnsRecords.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>DNS Records to configure:</div>
                  {d.dnsRecords.map((r, i) => (
                    <div key={i} className="mono" style={{ display: 'flex', gap: 12, padding: '2px 0' }}>
                      <span style={{ width: 50 }}>{r.type}</span>
                      <span style={{ flex: 1 }}>{r.name}</span>
                      <span style={{ flex: 1, wordBreak: 'break-all' }}>{r.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Live Logs Panel ─────────────────────────────────────────────────────────

function LiveLogsPanel({ deploymentId, compact = false }) {
  const [lines, setLines] = useState([]);
  const [streamStatus, setStreamStatus] = useState(null);
  const [connState, setConnState] = useState('connecting');
  const [connError, setConnError] = useState('');
  const bottomRef = useRef(null);
  const seenIds = useRef(new Set());

  useEffect(() => {
    setLines([]);
    seenIds.current = new Set();
    setConnState('connecting');
    setConnError('');
    const es = new EventSource(getDeploymentLogStreamUrl(deploymentId));
    es.addEventListener('open', () => setConnState('live'));
    es.addEventListener('log', (e) => {
      try {
        const log = JSON.parse(e.data);
        const key = log.id || `${log.source}:${log.timestamp}:${log.message}`;
        if (seenIds.current.has(key)) return;
        seenIds.current.add(key);
        setLines((prev) => [...prev, log]);
      } catch { /* ignore */ }
    });
    es.addEventListener('status', (e) => { try { setStreamStatus(JSON.parse(e.data)); } catch { /* ignore */ } });
    es.addEventListener('done', () => { setConnState('ended'); es.close(); });
    es.addEventListener('error', () => { setConnState((prev) => prev === 'ended' ? 'ended' : 'error'); setConnError('Stream disconnected — showing logs received so far.'); es.close(); });
    return () => es.close();
  }, [deploymentId]);

  useEffect(() => { if (!compact) bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [lines.length, compact]);
  const maxH = compact ? 220 : 520;

  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: compact ? 14 : 18 }}>{compact ? 'Live logs' : 'Build Logs'}</h2>
        <div className="row" style={{ gap: 8 }}>
          {connState === 'connecting' && <Badge tone="muted" dot>Connecting…</Badge>}
          {connState === 'live' && <Badge tone="success" dot>Live</Badge>}
          {connState === 'ended' && <Badge tone="info" dot={false}>Stream ended</Badge>}
          {connState === 'error' && <Badge tone="danger" dot={false}>Disconnected</Badge>}
        </div>
      </div>
      {streamStatus && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}><Badge tone={streamStatus.status === 'live' ? 'success' : streamStatus.status === 'failed' ? 'danger' : 'muted'} dot={false}>{streamStatus.currentStep || streamStatus.status || 'Preparing'}</Badge></div>}
      {streamStatus?.errorMessage && <div style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 10, padding: '7px 10px', background: 'var(--bg-deep)', borderRadius: 'var(--r-sm)', border: '1px solid var(--danger)' }}>{streamStatus.errorMessage}</div>}
      <div className="term" style={{ maxHeight: maxH, overflowY: 'auto' }}>
        {lines.length === 0 && connState === 'connecting' && <div><span className="dim">Connecting to log stream…</span></div>}
        {lines.length === 0 && connState !== 'connecting' && <div><span className="dim">No log lines yet. The deployment record may still be preparing.</span></div>}
        {lines.map((log, i) => <div key={log.id || i} style={{ display: 'flex', gap: 8, lineHeight: 1.5 }}><span className="ts" style={{ flexShrink: 0 }}>{formatTime(log.timestamp || log.createdAt)}</span><span className="dim" style={{ flexShrink: 0 }}>[{log.source === 'render' ? 'render' : 'sys'}]</span><span className={log.level === 'error' ? 'err' : log.level === 'warn' ? 'warn' : log.source === 'render' ? '' : 'dim'}>{log.message || log.msg}</span></div>)}
        <div ref={bottomRef} />
      </div>
      {connError && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{connError}</p>}
    </div>
  );
}

// ── Billing Tab ─────────────────────────────────────────────────────────────

function BillingTab({ deploymentId }) {
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    setFetchError('');
    getHostingPaymentStatus(deploymentId)
      .then((s) => setBilling(s))
      .catch((e) => setFetchError(e.message || 'Could not load billing status.'))
      .finally(() => setLoading(false));
  }, [deploymentId]);

  if (loading) return <div className="card" style={{ padding: 36 }}><Empty icon="CreditCard" title="Loading billing status…" /></div>;
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Billing status</h2>
      {fetchError && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{fetchError}</div>}
      <div className="kv">
        <dt>Status</dt><dd><Badge tone={billing?.paid ? 'success' : 'warn'}>{billing?.paymentStatus || 'pending'}</Badge></dd>
        <dt>Grace period</dt><dd>{billing?.hoursRemaining != null ? `${billing.hoursRemaining} hours remaining` : 'Not calculated'}</dd>
        <dt>Deadline</dt><dd>{billing?.deadlineAt ? new Date(billing.deadlineAt).toLocaleString() : 'Pending'}</dd>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>Billing is informational for this generated-site flow until final payment enforcement is enabled.</p>
    </div>
  );
}

// ── Global Hosting Settings ─────────────────────────────────────────────────

function HostingSettings() {
  const [settings, setSettings] = useState(null);
  useEffect(() => { getRenderSettings().then(setSettings).catch(() => setSettings(null)); }, []);
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Render provider settings</h2>
      <div className="kv">
        <dt>Configured</dt><dd>{settings?.configured ? 'Yes' : 'No'}</dd>
        <dt>Provider</dt><dd>{settings?.provider || 'render'}</dd>
        <dt>Missing</dt><dd className="mono">{settings?.required?.length ? settings.required.join(', ') : 'None reported'}</dd>
      </div>
      <p className="muted" style={{ marginTop: 14 }}>Generated RoxanneAI sites also need RENDER_GENERATED_SITES_REPO_URL configured for Render to pull from.</p>
    </div>
  );
}

// ── Utilities ───────────────────────────────────────────────────────────────

function statusLabel(status) {
  return {
    configuration_required: 'Preparing',
    prepared: 'Generated - Render Pending',
    generated: 'Generated',
    preparing: 'Preparing',
    queued: 'Queued',
    building: 'Building',
    deploying: 'Deploying',
    deployed: 'Verifying URL',
    deployed_unverified: 'Deployed - Warming Up',
    live: 'Live',
    failed: 'Failed',
    suspended: 'Suspended',
    deleted: 'Deleted',
  }[status] || status || 'Preparing';
}

function formatDate(value) {
  if (!value) return 'Not completed';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not completed' : date.toLocaleString();
}

function formatTime(value) {
  if (!value) return '--:--:--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '--:--:--' : date.toLocaleTimeString([], { hour12: false });
}
