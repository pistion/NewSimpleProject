import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ICN } from './icons';
import { Badge, Empty, StatusBadge, Tabs } from './components';
import {
  addHostingDomain,
  attachHostingDisk,
  captureHostingPayPalOrder,
  createHostingPayPalOrder,
  deleteHostingDeployment,
  deleteHostingDomain,
  deleteHostingEnvVar,
  getHostingPaymentStatus,
  getHostingService,
  getPayPalClientSettings,
  getRenderDeploymentLogs,
  getRenderDeploymentStatus,
  listHostingDeployments,
  listHostingDomains,
  listHostingEnvVars,
  redeployRenderDeployment,
  suspendHostingDeployment,
  syncHostingEnvVars,
  updateHostingEnvVar,
  upsertHostingEnvVar,
  verifyHostingDomain,
  verifyRenderDeploymentUrl,
} from './api';

export function HostingList({ navigate }) {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
          <h1>Hosted apps</h1>
          <p className="sub">Monitor deployments, open failed apps, and manage Render settings without leaving Glondia.</p>
        </div>
        <div className="actions">
          <button className="btn btn-outline" onClick={() => navigate({ view: 'builder-gallery' })}><ICN.Layers size={14} /> Site builder</button>
          <button className="btn btn-primary" onClick={() => navigate({ view: 'builder-import', params: { mode: 'github' } })}><ICN.Git size={14} /> Deploy from GitHub</button>
        </div>
      </div>

      {error && <div className="card" style={{ padding: '10px 14px', color: 'var(--danger)', fontSize: 13 }}>{error}</div>}

      {loading ? (
        <div className="card" style={{ padding: '42px 24px' }}>
          <Empty icon="Server" title="Loading hosting apps..." />
        </div>
      ) : apps.length === 0 ? (
        <div className="card" style={{ padding: '48px 24px' }}>
          <Empty
            icon="Server"
            title="No hosted apps yet"
            body="Deploy from the site builder or import a GitHub project to create your first hosting app."
            action={<button className="btn btn-primary" onClick={() => navigate({ view: 'builder-gallery' })}><ICN.Rocket size={14} /> Open site builder</button>}
          />
        </div>
      ) : (
        <div className="grid-2">
          {apps.map((app) => <HostingAppCard key={app.deploymentId} app={app} navigate={navigate} />)}
        </div>
      )}
    </>
  );
}

function HostingAppCard({ app, navigate }) {
  const building = Boolean(app.renderServiceId) && ['preparing', 'queued', 'building', 'deploying', 'verifying'].includes(app.status);
  return (
    <button
      type="button"
      className="card"
      onClick={() => navigate({ view: 'hosting-detail', params: { id: app.deploymentId } })}
      style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 14, color: 'inherit' }}
    >
      <div className="row between">
        <div className="row" style={{ gap: 12, minWidth: 0 }}>
          <span className="proj-thumb" style={{ width: 40, height: 40, fontSize: 15 }}>{(app.serviceName || 'A')[0]}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{app.serviceName}</div>
            <div className="mono faint" style={{ fontSize: 12 }}>{app.githubRepo || app.sourceReference || app.renderServiceId || app.deploymentId}</div>
          </div>
        </div>
        <StatusBadge value={statusLabel(app.status)} />
      </div>
      {building && <DeploymentPulse compact />}
      <div className="kv" style={{ gridTemplateColumns: '110px 1fr', gap: '6px 14px' }}>
        <dt>Step</dt><dd>{app.currentStep || statusLabel(app.status)}</dd>
        <dt>Build</dt><dd className="mono">{app.buildStatus || 'pending'}</dd>
        <dt>Live URL</dt><dd className="mono">{app.liveUrl ? app.liveUrl.replace(/^https?:\/\//, '') : 'Pending'}</dd>
        <dt>Branch</dt><dd className="mono">{app.githubBranch || app.environmentConfiguration?.branch || 'main'}</dd>
        <dt>Last deploy</dt><dd>{formatDate(app.lastDeployedAt || app.updatedAt)}</dd>
      </div>
      <div className="row" style={{ gap: 8 }}>
        {app.liveUrl && (
          <a className="btn btn-sm btn-outline" href={app.liveUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
            <ICN.ExternalLink size={13} /> View Live Site
          </a>
        )}
        <span className="btn btn-sm btn-primary">Manage</span>
      </div>
    </button>
  );
}

export function HostingDetail({ id, navigate }) {
  const deploymentId = id;
  const [app, setApp] = useState(null);
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState('Overview');

  const load = async () => {
    const [hosting, nextStatus, nextLogs] = await Promise.all([
      getHostingService(deploymentId),
      getRenderDeploymentStatus(deploymentId).catch(() => null),
      getRenderDeploymentLogs(deploymentId).catch(() => []),
    ]);
    setApp(hosting);
    setStatus(nextStatus);
    setLogs(nextLogs || []);
  };

  useEffect(() => {
    let cancelled = false;
    const run = () => load().catch((err) => { if (!cancelled) setError(err.message || 'Hosting app could not be loaded.'); }).finally(() => { if (!cancelled) setLoading(false); });
    run();
    const interval = setInterval(run, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [deploymentId]);

  const merged = useMemo(() => ({ ...(app || {}), ...(status || {}) }), [app, status]);
  const isLive = merged.status === 'live';
  const isFailed = merged.status === 'failed';
  const isUnverified = merged.status === 'deployed_unverified';
  const isDeleted = merged.status === 'deleted';

  const runAction = async (name, fn) => {
    setBusy(name);
    setError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.message || 'Action failed.');
    } finally {
      setBusy('');
    }
  };

  if (loading) return <div className="card" style={{ padding: 42 }}><Empty icon="Server" title="Loading hosting app..." /></div>;
  if (!app) return <div className="card" style={{ padding: 42 }}><Empty icon="AlertCircle" title="Hosting app not found" action={<button className="btn btn-outline" onClick={() => navigate({ view: 'hosting-list' })}>Back to Hosting</button>} /></div>;

  return (
    <>
      <div className="page-head">
        <div>
          <button className="page-eyebrow" style={{ background: 'none', border: 0, padding: 0, color: 'var(--text-muted)' }} onClick={() => navigate({ view: 'hosting-list' })}>Back to Hosting</button>
          <div className="row" style={{ gap: 14, marginTop: 8 }}>
            <span className="proj-thumb" style={{ width: 44, height: 44, fontSize: 16 }}>{(app.serviceName || 'A')[0]}</span>
            <div>
              <h1 style={{ margin: 0 }}>{app.serviceName}</h1>
              <div className="row" style={{ gap: 10, marginTop: 6, color: 'var(--text-muted)', fontSize: 13 }}>
                <span className="mono">{app.renderServiceId || app.deploymentId}</span>
                <span>·</span>
                <StatusBadge value={statusLabel(merged.status)} />
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
        <DeploymentStatusPanel app={merged} logs={logs} isLive={isLive} isFailed={isFailed} isUnverified={isUnverified} onVerify={() => runAction('verify', () => verifyRenderDeploymentUrl(deploymentId))} busy={busy} />
        <AdminPanel
          app={merged}
          busy={busy}
          onSuspend={() => window.confirm('Suspend this site?') && runAction('suspend', () => suspendHostingDeployment(deploymentId))}
          onDelete={() => window.confirm('Delete this hosted site? This cannot be undone.') && runAction('delete', async () => {
            await deleteHostingDeployment(deploymentId);
            navigate({ view: 'hosting-list' });
          })}
        />
      </div>

      <Tabs value={tab} onChange={setTab} options={['Overview', 'Billing', 'Environment Variables', 'Persistent Disk', 'Domains', 'Build Logs', 'Render Settings']} />

      {tab === 'Overview' && <OverviewTab app={merged} logs={logs} />}
      {tab === 'Billing' && <BillingTab deploymentId={deploymentId} />}
      {tab === 'Environment Variables' && <EnvironmentTab deploymentId={deploymentId} onChanged={load} />}
      {tab === 'Persistent Disk' && <DiskTab deploymentId={deploymentId} app={merged} onChanged={load} />}
      {tab === 'Domains' && <DomainsTab deploymentId={deploymentId} onChanged={load} />}
      {tab === 'Build Logs' && <LogsPanel logs={logs} />}
      {tab === 'Render Settings' && <RenderSettingsTab app={merged} />}
    </>
  );
}

function DeploymentStatusPanel({ app, logs, isLive, isFailed, isUnverified, onVerify, busy }) {
  const hasRenderService = Boolean(app.renderServiceId);
  const shouldAnimate = hasRenderService && ['preparing', 'queued', 'building', 'deploying', 'verifying'].includes(app.status);
  return (
    <div className="card">
      <div className="row between">
        <div>
          <div className="page-eyebrow" style={{ marginBottom: 6 }}>Deployment status</div>
          <h2 style={{ margin: 0 }}>{statusLabel(app.status)}</h2>
        </div>
        <StatusBadge value={statusLabel(app.status)} />
      </div>
      {!hasRenderService && <RenderNotStartedBlock app={app} />}
      {shouldAnimate && <DeploymentPulse />}
      {isFailed && <FailureBlock app={app} />}
      {isLive && <SuccessBlock app={app} />}
      {isUnverified && <WarmingBlock app={app} />}
      <div className="kv" style={{ marginTop: 16, gridTemplateColumns: '150px 1fr' }}>
        <dt>Current step</dt><dd>{app.currentStep || statusLabel(app.status)}</dd>
        <dt>Build status</dt><dd className="mono">{app.buildStatus || 'pending'}</dd>
        <dt>Service status</dt><dd>{hasRenderService ? app.status || 'preparing' : 'Render deployment not started'}</dd>
        <dt>URL verification</dt><dd>{app.urlReachable ? 'Reachable' : app.liveUrl ? 'Warming up' : 'Pending URL'}</dd>
      </div>
      {app.liveUrl && !app.urlReachable && (
        <button className="btn btn-sm btn-outline" style={{ marginTop: 14 }} onClick={onVerify} disabled={busy === 'verify'}>
          <ICN.Refresh size={13} /> Retry URL verification
        </button>
      )}
      <div style={{ marginTop: 16 }}>
        <div className="label">Recent logs</div>
        <MiniLogs logs={logs.slice(0, 4)} />
      </div>
    </div>
  );
}

function RenderNotStartedBlock({ app }) {
  return (
    <div style={{ marginTop: 18, padding: 14, border: '1px solid var(--warning)', borderRadius: 'var(--r-sm)', background: 'var(--bg-deep)' }}>
      <div className="row" style={{ gap: 8, color: 'var(--warning)', fontWeight: 700 }}><ICN.AlertCircle size={16} /> Render deployment not started</div>
      <div className="muted" style={{ marginTop: 8 }}>{app.errorMessage || 'Render has not returned a real service ID yet. Check Render credentials and retry deployment.'}</div>
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
  return (
    <div style={{ marginTop: 18, padding: 14, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--bg-deep)' }}>
      <div className="row" style={{ gap: 8, color: 'var(--accent)', fontWeight: 700 }}><ICN.CheckCircle size={16} /> Deployment is live</div>
      <div className="mono" style={{ marginTop: 8, wordBreak: 'break-all' }}>{app.liveUrl}</div>
    </div>
  );
}

function WarmingBlock({ app }) {
  return (
    <div style={{ marginTop: 18, padding: 14, border: '1px solid var(--warning)', borderRadius: 'var(--r-sm)', background: 'var(--bg-deep)' }}>
      <div className="row" style={{ gap: 8, color: 'var(--warning)', fontWeight: 700 }}><ICN.Refresh size={16} /> Deployed, still warming up</div>
      <div className="mono" style={{ marginTop: 8, wordBreak: 'break-all' }}>{app.liveUrl || 'URL pending from Render'}</div>
    </div>
  );
}

function FailureBlock({ app }) {
  return (
    <div style={{ marginTop: 18, padding: 14, border: '1px solid var(--danger)', borderRadius: 'var(--r-sm)', background: 'var(--bg-deep)' }}>
      <div className="row" style={{ gap: 8, color: 'var(--danger)', fontWeight: 700 }}><ICN.AlertCircle size={16} /> Deployment failed</div>
      <div className="muted" style={{ marginTop: 8 }}>{app.errorMessage || 'Review logs and settings, then redeploy.'}</div>
    </div>
  );
}

function AdminPanel({ app, busy, onSuspend, onDelete }) {
  const hasRenderService = Boolean(app.renderServiceId);
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Admin controls</h2>
      <div className="kv" style={{ gridTemplateColumns: '140px 1fr', marginBottom: 16 }}>
        <dt>Deployment ID</dt><dd className="mono">{app.deploymentId}</dd>
        <dt>Render deploy</dt><dd className="mono">{app.renderDeployId || 'Pending'}</dd>
        <dt>Created</dt><dd>{formatDate(app.createdAt)}</dd>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        <button className="btn btn-outline" disabled={!hasRenderService || busy === 'suspend' || app.status === 'suspended' || app.status === 'deleted'} onClick={onSuspend}><ICN.Power size={14} /> Suspend Site</button>
        <button className="btn btn-danger" disabled={!hasRenderService || busy === 'delete' || app.status === 'deleted'} onClick={onDelete}><ICN.Trash size={14} /> Delete Site</button>
      </div>
    </div>
  );
}

function OverviewTab({ app, logs }) {
  return (
    <div className="grid-side">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Hosting app</h2>
        <div className="kv">
          <dt>Repository</dt><dd className="mono">{app.githubRepo || app.repoUrl || 'Builder source'}</dd>
          <dt>Branch</dt><dd className="mono">{app.githubBranch || app.environmentConfiguration?.branch || 'main'}</dd>
          <dt>Service type</dt><dd><Badge tone="info" dot={false}>{app.serviceType}</Badge></dd>
          <dt>Live URL</dt><dd className="mono">{app.liveUrl || 'Pending'}</dd>
        </div>
      </div>
      <LogsPanel logs={logs.slice(0, 8)} />
    </div>
  );
}

function EnvironmentTab({ deploymentId, onChanged }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ key: '', value: '', secret: true, environment: 'production' });
  const [editing, setEditing] = useState('');
  const [error, setError] = useState('');

  const load = () => listHostingEnvVars(deploymentId).then((items) => setRows(items || []));
  useEffect(() => { load().catch(() => setRows([])); }, [deploymentId]);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      if (editing) await updateHostingEnvVar(deploymentId, editing, form);
      else await upsertHostingEnvVar(deploymentId, form);
      setForm({ key: '', value: '', secret: true, environment: 'production' });
      setEditing('');
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="grid-side">
      <form className="card" onSubmit={submit}>
        <h2 style={{ marginTop: 0 }}>Environment variables</h2>
        <div className="grid-2">
          <div><label className="label">Key</label><input className="input mono" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} disabled={!!editing} /></div>
          <div><label className="label">Value</label><input className="input mono" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></div>
          <div><label className="label">Environment</label><select className="select" value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value })}><option>production</option><option>preview</option><option>development</option></select></div>
          <label className="row" style={{ gap: 8, alignItems: 'center', marginTop: 24 }}><input type="checkbox" checked={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.checked })} /> Secret / encrypted</label>
        </div>
        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{error}</div>}
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button type="button" className="btn btn-outline" onClick={() => syncHostingEnvVars(deploymentId).then(load).then(onChanged)}><ICN.Refresh size={14} /> Sync to Render</button>
          <button className="btn btn-primary">{editing ? 'Save variable' : 'Add variable'}</button>
        </div>
      </form>
      <div className="card card-flush">
        <div className="card-head"><h2>Stored variables</h2><span className="meta">{rows.length} keys</span></div>
        <table className="tbl"><thead><tr><th>Key</th><th>Value</th><th>Scope</th><th>Sync</th><th></th></tr></thead><tbody>
          {rows.length === 0 ? <tr><td colSpan={5}>No environment variables yet.</td></tr> : rows.map((row) => (
            <tr key={row.key}>
              <td className="mono">{row.key}</td><td className="mono">{row.valuePreview || '********'}</td><td>{row.environment}</td><td>{row.renderSynced ? 'Synced' : 'Pending'}</td>
              <td style={{ textAlign: 'right' }}>
                <button className="btn btn-sm btn-ghost" onClick={() => { setEditing(row.key); setForm({ key: row.key, value: '', secret: row.encrypted !== false, environment: row.environment || 'production' }); }}><ICN.Edit size={13} /></button>
                <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => deleteHostingEnvVar(deploymentId, row.key).then(load).then(onChanged)}><ICN.Trash size={13} /></button>
              </td>
            </tr>
          ))}
        </tbody></table>
      </div>
    </div>
  );
}

function DiskTab({ deploymentId, app, onChanged }) {
  const [form, setForm] = useState({ name: 'data', mountPath: '/var/data', sizeGB: 1, region: app.environmentConfiguration?.region || 'oregon' });
  const disks = app.diskMetadata || [];
  const supported = app.serviceType === 'web_service';
  return (
    <div className="grid-side">
      <form className="card" onSubmit={(event) => { event.preventDefault(); attachHostingDisk(deploymentId, form).then(onChanged); }}>
        <h2 style={{ marginTop: 0 }}>SSD / persistent disk</h2>
        {!supported && <div className="muted" style={{ color: 'var(--warning)', marginBottom: 12 }}>Persistent disks are not supported for this Render service type.</div>}
        <div className="grid-2">
          <div><label className="label">Disk name</label><input className="input mono" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">Disk size</label><input className="input mono" type="number" min="1" max="1024" value={form.sizeGB} onChange={(e) => setForm({ ...form, sizeGB: Number(e.target.value) })} /></div>
          <div><label className="label">Mount path</label><input className="input mono" value={form.mountPath} onChange={(e) => setForm({ ...form, mountPath: e.target.value })} /></div>
          <div><label className="label">Region</label><input className="input mono" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} /></div>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}><button className="btn btn-primary" disabled={!supported}>Attach disk</button></div>
      </form>
      <MetadataTable rows={disks} empty="No persistent disk configured." />
    </div>
  );
}

function DomainsTab({ deploymentId, onChanged }) {
  const [domain, setDomain] = useState('');
  const [items, setItems] = useState([]);
  const load = () => listHostingDomains(deploymentId).then((rows) => setItems(rows || []));
  useEffect(() => { load().catch(() => setItems([])); }, [deploymentId]);
  return (
    <div className="grid-side">
      <form className="card" onSubmit={(event) => { event.preventDefault(); addHostingDomain(deploymentId, { domain }).then(() => { setDomain(''); return load(); }).then(onChanged); }}>
        <h2 style={{ marginTop: 0 }}>Custom domains</h2>
        <label className="label">Domain name</label>
        <div className="row" style={{ gap: 8 }}><input className="input mono" placeholder="example.com" value={domain} onChange={(e) => setDomain(e.target.value)} /><button className="btn btn-primary">Add domain</button></div>
      </form>
      <div style={{ display: 'grid', gap: 12 }}>
        {items.length === 0 ? <div className="card"><Empty icon="Globe" title="No domains connected" /></div> : items.map((item) => (
          <div className="card" key={item.domainId}>
            <div className="row between"><div><div className="mono" style={{ fontWeight: 700 }}>{item.name}</div><div className="muted" style={{ fontSize: 13 }}>DNS {item.verificationStatus} · SSL {item.sslStatus}</div></div><div className="row" style={{ gap: 6 }}><button className="btn btn-sm btn-outline" onClick={() => verifyHostingDomain(deploymentId, item.domainId).then(load).then(onChanged)}>Retry verification</button><button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => deleteHostingDomain(deploymentId, item.domainId).then(load).then(onChanged)}><ICN.Trash size={13} /></button></div></div>
            <table className="tbl" style={{ marginTop: 12 }}><thead><tr><th>Type</th><th>Name</th><th>Value</th></tr></thead><tbody>{(item.dnsRecords || []).map((record, index) => <tr key={index}><td>{record.type}</td><td className="mono">{record.name}</td><td className="mono">{record.value}</td></tr>)}</tbody></table>
          </div>
        ))}
      </div>
    </div>
  );
}

function RenderSettingsTab({ app }) {
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Render service settings</h2>
      <div className="kv">
        <dt>Service ID</dt><dd className="mono">{app.renderServiceId || 'Pending'}</dd>
        <dt>Service type</dt><dd>{app.serviceType}</dd>
        <dt>Build command</dt><dd className="mono">{app.environmentConfiguration?.buildCommand || 'Not set'}</dd>
        <dt>Start command</dt><dd className="mono">{app.environmentConfiguration?.startCommand || 'Not set'}</dd>
        <dt>Output directory</dt><dd className="mono">{app.environmentConfiguration?.outputDirectory || 'Not set'}</dd>
      </div>
    </div>
  );
}

function LogsPanel({ logs }) {
  return <div className="card"><h2 style={{ marginTop: 0 }}>Deployment logs</h2><MiniLogs logs={logs} /></div>;
}

function MiniLogs({ logs }) {
  return (
    <div className="term" style={{ maxHeight: 280 }}>
      {(logs || []).length === 0 ? <div><span className="dim">No logs yet.</span></div> : logs.map((log) => (
        <div key={log.id || `${log.timestamp}-${log.message}`}><span className="ts">{formatTime(log.createdAt || log.timestamp)}</span> <span className={log.level === 'error' ? 'err' : log.level === 'warn' ? 'dim' : 'info'}>{log.message || log.msg}</span></div>
      ))}
    </div>
  );
}

function MetadataTable({ rows, empty }) {
  return (
    <div className="card card-flush"><div className="card-head"><h2>Configured disks</h2><span className="meta">{rows.length} items</span></div><table className="tbl"><thead><tr><th>Name</th><th>Mount</th><th>Size</th><th>Status</th></tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={4}>{empty}</td></tr> : rows.map((row) => <tr key={row.diskId || row.name}><td className="mono">{row.name}</td><td className="mono">{row.mountPath}</td><td>{row.sizeGB} GB</td><td>{row.status}</td></tr>)}</tbody></table></div>
  );
}

function statusLabel(status) {
  return {
    configuration_required: 'Preparing',
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

// ── Billing Tab ───────────────────────────────────────────────────────────────

function BillingTab({ deploymentId }) {
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [paypalError, setPaypalError] = useState('');

  const load = () => {
    setFetchError('');
    return getHostingPaymentStatus(deploymentId)
      .then((s) => setBilling(s))
      .catch((e) => setFetchError(e.message || 'Could not load billing status.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [deploymentId]);

  if (loading) return <div className="card" style={{ padding: 36 }}><Empty icon="CreditCard" title="Loading billing status…" /></div>;

  if (billing?.paid) {
    return (
      <div className="card">
        <div className="row" style={{ gap: 10, color: 'var(--accent)', marginBottom: 16 }}>
          <ICN.ShieldCheck size={18} />
          <h2 style={{ margin: 0 }}>Payment received</h2>
        </div>
        <div className="kv" style={{ gridTemplateColumns: '160px 1fr' }}>
          <dt>Status</dt><dd><Badge tone="success">Paid</Badge></dd>
          <dt>Paid at</dt><dd>{billing.paidAt ? new Date(billing.paidAt).toLocaleString() : 'On file'}</dd>
          <dt>Total charged</dt><dd>${billing.amounts?.totalAmount || '—'}</dd>
          <dt>Platform fee</dt><dd>${billing.amounts?.markupAmount || '—'}</dd>
          <dt>Hosting cost</dt><dd>${billing.amounts?.actualAmount || '—'}</dd>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>Your site will remain live. No further action required.</p>
      </div>
    );
  }

  const overdue = billing?.overdue;
  const hoursLeft = billing?.hoursRemaining ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ borderColor: overdue ? 'var(--danger)' : 'var(--warning)', borderWidth: 1.5 }}>
        <div className="row" style={{ gap: 10, color: overdue ? 'var(--danger)' : 'var(--warning)', marginBottom: 12, fontWeight: 700, fontSize: 15 }}>
          <ICN.AlertCircle size={17} />
          {overdue
            ? 'Site suspended — payment overdue'
            : `Pay to keep your site live · ${hoursLeft > 0 ? `${hoursLeft}h remaining` : 'due now'}`}
        </div>

        <p className="muted" style={{ margin: '0 0 18px', fontSize: 13 }}>
          {overdue
            ? 'Your Render service was suspended because no payment was received within 24 hours of deployment. Complete payment below to restore it.'
            : `Your site will be automatically suspended if payment is not received within 24 hours of deployment. ${hoursLeft > 0 ? `You have ${hoursLeft} hour${hoursLeft === 1 ? '' : 's'} left.` : 'Pay now to avoid interruption.'}`}
        </p>

        <div className="kv" style={{ gridTemplateColumns: '160px 1fr', marginBottom: 18 }}>
          <dt>Deployed at</dt><dd>{billing?.deployedAt ? new Date(billing.deployedAt).toLocaleString() : '—'}</dd>
          <dt>Payment deadline</dt><dd>{billing?.deadlineAt ? new Date(billing.deadlineAt).toLocaleString() : '—'}</dd>
          <dt>Grace period</dt><dd>{billing?.graceHours || 24} hours</dd>
        </div>

        {paypalError && (
          <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12, padding: '8px 12px', background: 'var(--bg-deep)', borderRadius: 'var(--r-sm)', border: '1px solid var(--danger)' }}>
            <ICN.AlertCircle size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            {paypalError}
          </div>
        )}

        <HostingPayPalButton
          deploymentId={deploymentId}
          onPaid={() => { setPaypalError(''); load(); }}
          onError={(msg) => setPaypalError(msg)}
        />
      </div>

      {fetchError && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{fetchError}</div>}
    </div>
  );
}

function HostingPayPalButton({ deploymentId, onPaid, onError }) {
  const ref = useRef(null);
  const checkoutRef = useRef(null);
  const buttonsRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const setup = async () => {
      try {
        const settings = await getPayPalClientSettings();
        if (!settings.configured || !settings.clientId) {
          onError?.('PayPal is not configured on this server. Contact support to arrange payment.');
          return;
        }
        await loadPayPalSdkForHosting(settings.clientId);
        if (cancelled || !ref.current || !window.paypal?.Buttons) return;
        ref.current.innerHTML = '';
        const buttons = window.paypal.Buttons({
          style: { layout: 'vertical', shape: 'rect', label: 'pay' },
          createOrder: async () => {
            const order = await createHostingPayPalOrder({ deploymentId });
            checkoutRef.current = order.checkoutOrderId;
            return order.providerOrderId;
          },
          onApprove: async (data) => {
            const result = await captureHostingPayPalOrder({
              checkoutOrderId: checkoutRef.current,
              providerOrderId: data.orderID,
            });
            onPaid?.(result);
          },
          onError: (err) => onError?.(err?.message || 'PayPal checkout failed.'),
          onCancel: () => onError?.('PayPal payment was cancelled.'),
        });
        buttonsRef.current = buttons;
        await buttons.render(ref.current);
      } catch (err) {
        if (!cancelled) onError?.(err.message || 'PayPal checkout is unavailable.');
      }
    };
    setup();
    return () => {
      cancelled = true;
      buttonsRef.current?.close?.();
      buttonsRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={ref} />;
}

function loadPayPalSdkForHosting(clientId) {
  if (window.paypal?.Buttons) return Promise.resolve();
  const existing = document.querySelector('script[data-glondia-paypal]');
  if (existing) return new Promise((resolve, reject) => {
    existing.addEventListener('load', resolve, { once: true });
    existing.addEventListener('error', reject, { once: true });
  });
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.dataset.glondiaPaypal = 'true';
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture`;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load PayPal checkout.'));
    document.head.appendChild(script);
  });
}
