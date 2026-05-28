import React, { useEffect, useMemo, useRef, useState } from 'react';
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
} from './api';

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

function HostingAppCard({ app, navigate }) {
  const isGenerated = app.source === 'ai-tailored-template' || app.generatedSite;
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
            <div className="mono faint" style={{ fontSize: 12 }}>{isGenerated ? 'RoxanneAI generated site' : (app.githubRepo || app.sourceReference || app.renderServiceId || app.deploymentId)}</div>
          </div>
        </div>
        <StatusBadge value={statusLabel(app.status)} />
      </div>
      {isGenerated && <Badge tone="info" dot={false}>Generated Vite React site</Badge>}
      {building && <DeploymentPulse compact />}
      <div className="kv" style={{ gridTemplateColumns: '110px 1fr', gap: '6px 14px' }}>
        <dt>Step</dt><dd>{app.currentStep || statusLabel(app.status)}</dd>
        <dt>Build</dt><dd className="mono">{app.buildStatus || 'pending'}</dd>
        <dt>Live URL</dt><dd className="mono">{app.liveUrl ? app.liveUrl.replace(/^https?:\/\//, '') : 'Pending'}</dd>
        <dt>Source</dt><dd className="mono">{isGenerated ? 'RoxanneAI' : (app.sourceReference || 'GitHub')}</dd>
      </div>
      <div className="row" style={{ gap: 8 }}>
        {app.liveUrl && <a className="btn btn-sm btn-outline" href={app.liveUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}><ICN.ExternalLink size={13} /> View Live Site</a>}
        <span className="btn btn-sm btn-primary">Manage</span>
      </div>
    </button>
  );
}

export function HostingDetail({ id, navigate }) {
  const deploymentId = id;
  const [app, setApp] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState('Overview');

  const load = async () => {
    const [hosting, nextStatus] = await Promise.all([
      getHostingService(deploymentId),
      getRenderDeploymentStatus(deploymentId).catch(() => null),
    ]);
    setApp(hosting);
    setStatus(nextStatus);
  };

  useEffect(() => {
    let cancelled = false;
    const run = () => load().catch((err) => { if (!cancelled) setError(err.message || 'Hosting app could not be loaded.'); }).finally(() => { if (!cancelled) setLoading(false); });
    run();
    const interval = setInterval(run, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [deploymentId]);

  const merged = useMemo(() => ({ ...(app || {}), ...(status || {}) }), [app, status]);
  const isDeleted = merged.status === 'deleted';

  const runAction = async (name, fn) => {
    setBusy(name);
    setError('');
    try { await fn(); await load(); } catch (err) { setError(err.message || 'Action failed.'); } finally { setBusy(''); }
  };

  if (loading) return <div className="card" style={{ padding: 42 }}><Empty icon="Server" title="Loading hosting app..." /></div>;
  if (!app) return <div className="card" style={{ padding: 42 }}><Empty icon="AlertCircle" title="Hosting app not found" action={<button className="btn btn-outline" onClick={() => navigate({ view: 'hosting-list' })}>Back to Hosting</button>} /></div>;

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
                <span className="mono">{merged.renderServiceId || merged.deploymentId}</span>
                <span>·</span>
                <StatusBadge value={statusLabel(merged.status)} />
                {isGeneratedSite(merged) && <Badge tone="info" dot={false}>RoxanneAI generated</Badge>}
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

      <Tabs value={tab} onChange={setTab} options={['Overview', 'Billing', 'Build Logs', 'Render Settings']} />

      {tab === 'Overview' && <OverviewTab app={merged} deploymentId={deploymentId} />}
      {tab === 'Billing' && <BillingTab deploymentId={deploymentId} />}
      {tab === 'Build Logs' && <LiveLogsPanel deploymentId={deploymentId} />}
      {tab === 'Render Settings' && <RenderSettingsTab app={merged} />}
    </>
  );
}

function DeploymentStatusPanel({ app, onVerify, busy }) {
  const generated = isGeneratedSite(app);
  const renderPending = String(app.renderServiceId || '').includes('_pending') || app.render?.skippedReason;
  const shouldAnimate = ['preparing', 'queued', 'building', 'deploying', 'verifying'].includes(app.status) && !renderPending;
  return (
    <div className="card">
      <div className="row between">
        <div>
          <div className="page-eyebrow" style={{ marginBottom: 6 }}>{generated ? 'RoxanneAI deployment status' : 'Deployment status'}</div>
          <h2 style={{ margin: 0 }}>{statusLabel(app.status)}</h2>
        </div>
        <StatusBadge value={statusLabel(app.status)} />
      </div>
      {generated && <GeneratedSiteBlock app={app} />}
      {renderPending && <RenderNotStartedBlock app={app} />}
      {shouldAnimate && <DeploymentPulse />}
      {app.status === 'failed' && <FailureBlock app={app} />}
      {app.status === 'live' && <SuccessBlock app={app} />}
      {app.status === 'deployed_unverified' && <WarmingBlock app={app} />}
      <div className="kv" style={{ marginTop: 16, gridTemplateColumns: '150px 1fr' }}>
        <dt>Current step</dt><dd>{app.currentStep || statusLabel(app.status)}</dd>
        <dt>Build status</dt><dd className="mono">{app.buildStatus || 'pending'}</dd>
        <dt>Render handoff</dt><dd>{app.render?.attempted ? 'Attempted' : renderPending ? 'Waiting for configuration' : 'Ready'}</dd>
        <dt>URL verification</dt><dd>{app.urlReachable ? 'Reachable' : app.liveUrl ? 'Warming up' : 'Pending URL'}</dd>
      </div>
      {app.liveUrl && !app.urlReachable && <button className="btn btn-sm btn-outline" style={{ marginTop: 14 }} onClick={onVerify} disabled={busy === 'verify'}><ICN.Refresh size={13} /> Retry URL verification</button>}
    </div>
  );
}

function GeneratedSiteBlock({ app }) {
  const generated = app.generatedSite || {};
  return (
    <div style={{ marginTop: 18, padding: 14, border: '1px solid var(--accent)', borderRadius: 'var(--r-sm)', background: 'var(--accent-soft)' }}>
      <div className="row" style={{ gap: 8, color: 'var(--accent)', fontWeight: 700 }}><ICN.CheckCircle size={16} /> Generated Vite React site prepared</div>
      <div className="kv" style={{ marginTop: 10, gridTemplateColumns: '135px 1fr', fontSize: 12.5 }}>
        <dt>Generated files</dt><dd>{Array.isArray(generated.files) ? generated.files.length : 0}</dd>
        <dt>Framework</dt><dd className="mono">{generated.framework || 'vite-react'}</dd>
        <dt>Source folder</dt><dd className="mono" style={{ wordBreak: 'break-all' }}>{generated.siteDir || 'Pending'}</dd>
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
      <div className="mono" style={{ marginTop: 8, fontSize: 12 }}>Required: RENDER_API_KEY, RENDER_OWNER_ID, and RENDER_GENERATED_SITES_REPO_URL or repoUrl.</div>
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
  const hasRealRenderService = app.renderServiceId && !String(app.renderServiceId).includes('_pending');
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Admin controls</h2>
      <div className="kv" style={{ gridTemplateColumns: '140px 1fr', marginBottom: 16 }}>
        <dt>Deployment ID</dt><dd className="mono">{app.deploymentId}</dd>
        <dt>Render service</dt><dd className="mono">{hasRealRenderService ? app.renderServiceId : 'Pending configuration'}</dd>
        <dt>Render deploy</dt><dd className="mono">{app.renderDeployId && !String(app.renderDeployId).includes('_pending') ? app.renderDeployId : 'Pending'}</dd>
        <dt>Created</dt><dd>{formatDate(app.createdAt)}</dd>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        <button className="btn btn-outline" disabled={!hasRealRenderService || busy === 'suspend' || app.status === 'suspended' || app.status === 'deleted'} onClick={onSuspend}><ICN.Power size={14} /> Suspend Site</button>
        <button className="btn btn-danger" disabled={!hasRealRenderService || busy === 'delete' || app.status === 'deleted'} onClick={onDelete}><ICN.Trash size={14} /> Delete Site</button>
      </div>
    </div>
  );
}

function OverviewTab({ app, deploymentId }) {
  return (
    <div className="grid-side">
      <div style={{ display: 'grid', gap: 16 }}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Hosting app</h2>
          <div className="kv">
            <dt>Source</dt><dd className="mono">{isGeneratedSite(app) ? 'RoxanneAI generated template' : (app.githubRepo || app.repoUrl || 'Builder source')}</dd>
            <dt>Branch</dt><dd className="mono">{app.githubBranch || app.environmentConfiguration?.branch || 'main'}</dd>
            <dt>Service type</dt><dd><Badge tone="info" dot={false}>{app.serviceType}</Badge></dd>
            <dt>Live URL</dt><dd className="mono">{app.liveUrl || 'Pending'}</dd>
          </div>
        </div>
        {isGeneratedSite(app) && <GeneratedMetadataCard app={app} />}
      </div>
      <LiveLogsPanel deploymentId={deploymentId} compact />
    </div>
  );
}

function GeneratedMetadataCard({ app }) {
  const generated = app.generatedSite || {};
  const settings = app.environmentConfiguration || {};
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Generated site package</h2>
      <div className="kv">
        <dt>Framework</dt><dd className="mono">{generated.framework || 'vite-react'}</dd>
        <dt>Package manager</dt><dd className="mono">{generated.packageManager || 'npm'}</dd>
        <dt>Build command</dt><dd className="mono">{settings.buildCommand || generated.buildCommand || 'npm install && npm run build'}</dd>
        <dt>Publish directory</dt><dd className="mono">{settings.outputDirectory || generated.publishDirectory || 'dist'}</dd>
        <dt>Generated folder</dt><dd className="mono" style={{ wordBreak: 'break-all' }}>{generated.siteDir || settings.rootDirectory || 'Pending'}</dd>
        <dt>Pages</dt><dd>{Array.isArray(generated.pages) ? generated.pages.map((p) => p.title).join(', ') : 'Generated pages pending'}</dd>
      </div>
    </div>
  );
}

function RenderSettingsTab({ app }) {
  const settings = app.environmentConfiguration || {};
  const render = app.render || {};
  return (
    <div className="grid-side">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Render service settings</h2>
        <div className="kv">
          <dt>Service ID</dt><dd className="mono">{app.renderServiceId && !String(app.renderServiceId).includes('_pending') ? app.renderServiceId : 'Pending configuration'}</dd>
          <dt>Deploy ID</dt><dd className="mono">{app.renderDeployId && !String(app.renderDeployId).includes('_pending') ? app.renderDeployId : 'Pending'}</dd>
          <dt>Service type</dt><dd>{app.serviceType}</dd>
          <dt>Source repository</dt><dd className="mono" style={{ wordBreak: 'break-all' }}>{settings.sourceRepository || app.repoUrl || 'Not configured'}</dd>
          <dt>Root directory</dt><dd className="mono" style={{ wordBreak: 'break-all' }}>{settings.rootDirectory || 'Not set'}</dd>
          <dt>Build command</dt><dd className="mono">{settings.buildCommand || 'Not set'}</dd>
          <dt>Output directory</dt><dd className="mono">{settings.outputDirectory || 'Not set'}</dd>
        </div>
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
    </div>
  );
}

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
      <p className="muted" style={{ marginTop: 14 }}>Generated RoxanneAI sites also need a source repo configured through RENDER_GENERATED_SITES_REPO_URL or the deploy settings screen.</p>
    </div>
  );
}

function isGeneratedSite(app) {
  return Boolean(app?.generatedSite || app?.source === 'ai-tailored-template' || app?.sourceReference === 'roxanne-ai-tailored-template');
}

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
