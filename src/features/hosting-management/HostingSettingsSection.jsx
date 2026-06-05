import React, { useState } from 'react';
import { ICN } from '../../icons';
import {
  purgeHostingCache,
  redeployHostingWithSettings,
  syncHostingDeployment,
  updateHostingBuildSettings,
  updateHostingDeploySettings,
  updateHostingSettings,
  updateHostingSourceSettings,
} from '../../api';
import { getRenderSourceRoot } from './shared';
import { Notice } from './SectionShell';

export default function HostingSettingsSection({ app, deploymentId, onReload, isStatic, onPurgeCache, busy: outerBusy }) {
  const config = app.environmentConfiguration || {};
  const [serviceForm, setServiceForm] = useState({
    serviceName: app.serviceName || app.siteName || '',
    serviceType: app.serviceType || 'static_site',
    plan: app.plan || '',
    region: app.region || '',
  });
  const [sourceForm, setSourceForm] = useState({
    sourceRepository: config.sourceRepository || app.repoUrl || '',
    branch: config.branch || app.githubBranch || 'main',
    rootDirectory: getRenderSourceRoot(app),
  });
  const [buildForm, setBuildForm] = useState({
    buildCommand: config.buildCommand || app.generatedSite?.buildCommand || '',
    outputDirectory: config.outputDirectory || app.generatedSite?.publishDirectory || 'dist',
  });
  const [deployForm, setDeployForm] = useState({
    autoDeploy: config.autoDeploy ?? true,
    healthCheckPath: config.healthCheckPath || '/',
  });
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const run = async (name, action, success) => {
    setBusy(name); setMsg(''); setErr('');
    try {
      await action();
      setMsg(success);
      onReload?.();
    } catch (error) { setErr(error.message || 'Action failed.'); }
    finally { setBusy(''); }
  };

  const allBusy = busy || outerBusy;
  const fullSettingsPayload = () => ({
    ...serviceForm,
    ...sourceForm,
    ...buildForm,
    ...deployForm,
  });

  return (
    <div className="grid-side hosting-section-grid">
      <div className="hosting-stack">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Service settings</h2>
          <div className="hosting-form-grid">
            <label><span className="label">Service name</span><input className="input" value={serviceForm.serviceName} onChange={(event) => setServiceForm((current) => ({ ...current, serviceName: event.target.value }))} /></label>
            <label><span className="label">Service type</span><select className="select" value={serviceForm.serviceType} onChange={(event) => setServiceForm((current) => ({ ...current, serviceType: event.target.value }))}><option value="static_site">Static site</option><option value="web_service">Web service</option></select></label>
            <label><span className="label">Plan</span><input className="input" value={serviceForm.plan} onChange={(event) => setServiceForm((current) => ({ ...current, plan: event.target.value }))} /></label>
            <label><span className="label">Region</span><input className="input" value={serviceForm.region} onChange={(event) => setServiceForm((current) => ({ ...current, region: event.target.value }))} /></label>
          </div>
          <button className="btn btn-primary" disabled={!!allBusy} onClick={() => run('service', () => updateHostingSettings(deploymentId, serviceForm), 'Service settings saved.')}>Save service</button>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Source settings</h2>
          <div className="hosting-form-grid">
            <label><span className="label">Repository</span><input className="input mono" value={sourceForm.sourceRepository} onChange={(event) => setSourceForm((current) => ({ ...current, sourceRepository: event.target.value }))} /></label>
            <label><span className="label">Branch</span><input className="input mono" value={sourceForm.branch} onChange={(event) => setSourceForm((current) => ({ ...current, branch: event.target.value }))} /></label>
            <label><span className="label">Root directory</span><input className="input mono" value={sourceForm.rootDirectory} onChange={(event) => setSourceForm((current) => ({ ...current, rootDirectory: event.target.value }))} /></label>
          </div>
          <button className="btn btn-primary" disabled={!!allBusy} onClick={() => run('source', () => updateHostingSourceSettings(deploymentId, sourceForm), 'Source settings saved.')}>Save source</button>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Build settings</h2>
          <div className="hosting-form-grid">
            <label><span className="label">Build command</span><input className="input mono" value={buildForm.buildCommand} onChange={(event) => setBuildForm((current) => ({ ...current, buildCommand: event.target.value }))} /></label>
            <label><span className="label">Publish directory</span><input className="input mono" value={buildForm.outputDirectory} onChange={(event) => setBuildForm((current) => ({ ...current, outputDirectory: event.target.value }))} /></label>
          </div>
          <button className="btn btn-primary" disabled={!!allBusy} onClick={() => run('build', () => updateHostingBuildSettings(deploymentId, buildForm), 'Build settings saved.')}>Save build</button>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Deploy settings</h2>
          <div className="hosting-form-grid">
            <label><span className="label">Health check path</span><input className="input mono" value={deployForm.healthCheckPath} onChange={(event) => setDeployForm((current) => ({ ...current, healthCheckPath: event.target.value }))} /></label>
            <label className="hosting-toggle-row"><input type="checkbox" checked={!!deployForm.autoDeploy} onChange={(event) => setDeployForm((current) => ({ ...current, autoDeploy: event.target.checked }))} /> Auto deploy</label>
          </div>
          <button className="btn btn-primary" disabled={!!allBusy} onClick={() => run('deploy', () => updateHostingDeploySettings(deploymentId, deployForm), 'Deploy settings saved.')}>Save deploy</button>
        </div>
      </div>

      <div className="hosting-stack">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Repair tools</h2>
          <div className="hosting-button-stack">
            <button className="btn btn-outline" disabled={!!allBusy} onClick={() => run('sync', () => syncHostingDeployment(deploymentId), 'Synced with hosting provider.')}><ICN.Refresh size={14} /> Sync</button>
            <button className="btn btn-outline" disabled={!!allBusy} onClick={() => run('redeploy', () => redeployHostingWithSettings(deploymentId, fullSettingsPayload()), 'Redeploy started.')}><ICN.Refresh size={14} /> Redeploy with settings</button>
            <button className="btn btn-outline" disabled={!!allBusy} onClick={() => run('clear', async () => { await purgeHostingCache(deploymentId); await redeployHostingWithSettings(deploymentId, {}); }, 'Cache cleared and redeploy started.')}><ICN.Trash size={14} /> Clear cache and redeploy</button>
            {isStatic && <button className="btn btn-outline" disabled={!!allBusy} onClick={() => run('purge', onPurgeCache || (() => purgeHostingCache(deploymentId)), 'CDN cache purged.')}><ICN.Trash size={14} /> Purge CDN cache</button>}
          </div>
        </div>
        <Notice type="success">{msg}</Notice>
        <Notice type="error">{err}</Notice>
      </div>
    </div>
  );
}
