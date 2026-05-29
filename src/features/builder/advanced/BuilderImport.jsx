// BuilderImport.jsx — GitHub repository import + ZIP drag/drop deploy flow.
import React, { useState as useStateB } from 'react';
import { ICN } from '../../../icons';
import { importBuilderSiteFromGithub, parseGithubRepo } from '../../../api';
import { deployZipTemplate, getZipDeploySettings } from '../../../api/template-ai.js';

function formatFileSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function ImportProgressPreview({ phase, repo, branch, error, showLoader, isImporting, zipFile }) {
  const title = zipFile?.name || repo?.fullName || 'Your project';
  const activeLabel = {
    idle: 'Choose GitHub import or drag a ZIP file on the left.',
    checking: 'Checking repository format...',
    detected: 'Repository detected. Click Import to pull files.',
    zip_ready: 'ZIP selected. Click Deploy ZIP to upload and deploy.',
    pulling: 'Pulling files from GitHub...',
    uploading: 'Uploading ZIP package...',
    building: 'Preparing deployment...',
    complete: 'Import complete. Opening next screen...',
    error: 'Import needs attention.',
  }[phase] || 'Ready when you are.';
  const loaderText = error ? 'Error' : phase === 'complete' ? 'Ready' : zipFile ? 'Uploading' : 'Importing';

  return (
    <div className={`bld-preview-frame import-loader-frame ${!isImporting ? 'import-loader-frame--still' : ''}`}>
      <div className="import-loader-shell">
        <div className="import-loader-copy">
          <div className="eyebrow">Import pipeline</div>
          <h2>{title}</h2>
          <div className="muted">
            {zipFile ? <span className="mono">{formatFileSize(zipFile.size)} ZIP package selected</span> : repo ? <span className="mono">{repo.url} - {branch}</span> : activeLabel}
          </div>
        </div>
        {showLoader ? (
          <div className="loader" aria-live="polite" aria-label={activeLabel}>{Array.from({ length: 9 }).map((_, index) => <div className="text" key={index}><span>{loaderText}</span></div>)}<div className="line" /></div>
        ) : (
          <div className="import-loader-standby">{zipFile ? <ICN.Box size={18} /> : <ICN.Git size={18} />}<span>{zipFile ? 'ZIP ready for deploy' : repo ? 'Repository detected' : 'Waiting for project'}</span></div>
        )}
        <div className="term import-loader-term">
          <div><span className="ts">now</span> <span className={error ? 'err' : 'info'}>{error || activeLabel}</span></div>
          {repo && <div><span className="ts">repo</span> <span className="dim">{repo.owner}/{repo.repo}</span></div>}
          {zipFile && <div><span className="ts">zip</span> <span className="ok">Selected: {zipFile.name} ({formatFileSize(zipFile.size)})</span></div>}
          <div><span className="ts">next</span> <span className="ok">Hosting detail opens after deploy record is created</span></div>
        </div>
      </div>
    </div>
  );
}

export function BuilderImport({ mode = 'github', navigate }) {
  const [activeMode, setActiveMode] = useStateB(mode === 'zip' ? 'zip' : 'github');
  const [repoUrl, setRepoUrl] = useStateB('');
  const [repoBranch, setRepoBranch] = useStateB('main');
  const [gitBusy, setGitBusy] = useStateB(false);
  const [gitError, setGitError] = useStateB(null);
  const [zipFile, setZipFile] = useStateB(null);
  const [zipBusy, setZipBusy] = useStateB(false);
  const [zipError, setZipError] = useStateB(null);
  const [zipNotice, setZipNotice] = useStateB('');
  const [dragging, setDragging] = useStateB(false);
  const [importPhase, setImportPhase] = useStateB(mode === 'zip' ? 'idle' : 'idle');
  const [renderConfig, setRenderConfig] = useStateB({ frontendRootDirectory: '', frontendBuildCommand: 'npm run build', frontendPublishDirectory: 'dist', backendRootDirectory: 'server', backendBuildCommand: 'npm install', backendStartCommand: 'npm start', serviceType: 'static_site', plan: 'starter', repoUrl: '' });
  const [zipConfig, setZipConfig] = useStateB(null);
  const phaseTimer = React.useRef(null);
  const fileInputRef = React.useRef(null);
  const detectedRepo = parseGithubRepo(repoUrl);
  const isImporting = ['pulling', 'uploading', 'building'].includes(importPhase);
  const importStarted = ['pulling', 'uploading', 'building', 'complete', 'error'].includes(importPhase);
  const isStaticSite = renderConfig.serviceType === 'static_site';

  const updateRepoUrl = (value) => { setRepoUrl(value); setGitError(null); if (!gitBusy) setImportPhase(value.trim() ? (parseGithubRepo(value) ? 'detected' : 'checking') : 'idle'); };
  const updateRenderConfig = (key, value) => setRenderConfig((current) => ({ ...current, [key]: value }));
  const updateServiceType = (serviceType) => setRenderConfig((current) => ({ ...current, serviceType, plan: serviceType === 'static_site' ? 'starter' : current.plan }));

  React.useEffect(() => () => clearTimeout(phaseTimer.current), []);
  React.useEffect(() => setActiveMode(mode === 'zip' ? 'zip' : 'github'), [mode]);

  // Fetch ZIP deploy config status when ZIP tab is active
  React.useEffect(() => {
    if (activeMode !== 'zip') return;
    getZipDeploySettings().then((cfg) => setZipConfig(cfg)).catch(() => {});
  }, [activeMode]);

  const selectZip = (file) => {
    setZipNotice('');
    if (!file) return;
    setZipError(null);
    if (!/\.zip$/i.test(file.name)) { setZipError('Please upload a .zip file.'); setImportPhase('error'); return; }
    setZipFile(file);
    setZipNotice(`${file.name} selected successfully. Click Deploy ZIP to upload it.`);
    setImportPhase('zip_ready');
  };
  const clearZip = () => { setZipFile(null); setZipNotice(''); setZipError(null); setImportPhase('idle'); if (fileInputRef.current) fileInputRef.current.value = ''; };
  const handleDrop = (event) => { event.preventDefault(); setDragging(false); selectZip(event.dataTransfer.files?.[0]); };

  const handleGitConnect = async () => {
    const repo = parseGithubRepo(repoUrl);
    if (!repo) { setImportPhase(repoUrl.trim() ? 'checking' : 'idle'); return; }
    setGitBusy(true); setGitError(null); setImportPhase('pulling'); clearTimeout(phaseTimer.current); phaseTimer.current = setTimeout(() => setImportPhase('building'), 1200);
    try {
      const rootDirectory = isStaticSite ? renderConfig.frontendRootDirectory : renderConfig.backendRootDirectory;
      const buildCommand = isStaticSite ? renderConfig.frontendBuildCommand : renderConfig.backendBuildCommand;
      const outputDirectory = isStaticSite ? renderConfig.frontendPublishDirectory : '';
      const site = await importBuilderSiteFromGithub({ repoUrl, branch: repoBranch || 'main', rootDirectory, buildCommand, outputDirectory, renderConfig: { provider: 'render', serviceType: renderConfig.serviceType, plan: renderConfig.plan, frontend: { rootDirectory: renderConfig.frontendRootDirectory, buildCommand: renderConfig.frontendBuildCommand, publishDirectory: renderConfig.frontendPublishDirectory }, backend: { rootDirectory: renderConfig.backendRootDirectory, buildCommand: renderConfig.backendBuildCommand, startCommand: renderConfig.backendStartCommand }, selected: isStaticSite ? { rootDirectory: renderConfig.frontendRootDirectory, buildCommand: renderConfig.frontendBuildCommand, publishDirectory: renderConfig.frontendPublishDirectory } : { rootDirectory: renderConfig.backendRootDirectory, buildCommand: renderConfig.backendBuildCommand, startCommand: renderConfig.backendStartCommand } } });
      clearTimeout(phaseTimer.current); setImportPhase('complete'); window.setTimeout(() => navigate({ view: 'builder-editor', params: { id: site.templateId || null, siteId: site.id } }), 700);
    } catch (err) { setGitError(err.message || 'Failed to connect repository.'); setImportPhase('error'); } finally { setGitBusy(false); }
  };

  const handleZipDeploy = async () => {
    if (!zipFile) { setZipError('Choose or drop a ZIP file first.'); return; }
    setZipBusy(true); setZipError(null); setZipNotice('Uploading ZIP package...'); setImportPhase('uploading'); clearTimeout(phaseTimer.current); phaseTimer.current = setTimeout(() => setImportPhase('building'), 1000);
    try {
      const result = await deployZipTemplate(zipFile, { siteName: zipFile.name.replace(/\.zip$/i, ''), slug: zipFile.name.replace(/\.zip$/i, ''), serviceType: renderConfig.serviceType, plan: renderConfig.plan, environment: 'production', buildCommand: renderConfig.frontendBuildCommand || 'npm run build', publishDirectory: renderConfig.frontendPublishDirectory || 'dist', repoUrl: renderConfig.repoUrl, branch: repoBranch || 'main', rootDirectory: renderConfig.frontendRootDirectory });
      clearTimeout(phaseTimer.current); setImportPhase('complete'); setZipNotice('ZIP uploaded. Opening Hosting detail...'); window.setTimeout(() => navigate({ view: 'hosting-detail', params: { id: result.deploymentId } }), 700);
    } catch (err) { setZipError(err.message || 'ZIP upload failed.'); setZipNotice(''); setImportPhase('error'); } finally { setZipBusy(false); }
  };

  const activeError = activeMode === 'zip' ? zipError : gitError;

  return (
    <>
      <div className="page-head"><div><a className="page-eyebrow" href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'builder-gallery' }); }}>Back to site builder</a><h1>Import your own work</h1><p className="sub">Deploy from GitHub or drag-and-drop a ZIP package. ZIP upload creates a Hosting record and starts Render when provider settings are configured.</p></div></div>
      <div className="tabs" style={{ marginBottom: 14 }}><button className={activeMode === 'github' ? 'active' : ''} onClick={() => { setActiveMode('github'); setImportPhase(repoUrl ? (detectedRepo ? 'detected' : 'checking') : 'idle'); }}><ICN.Git size={14} /> GitHub</button><button className={activeMode === 'zip' ? 'active' : ''} onClick={() => { setActiveMode('zip'); setImportPhase(zipFile ? 'zip_ready' : 'idle'); }}><ICN.Box size={14} /> ZIP upload</button></div>
      <div className="card card-flush builder-import-workspace" style={{ overflow: 'hidden' }}><div className="bld-split"><div className="github-pull-toggle"><div className="github-pull-head"><div className="github-pull-icon">{activeMode === 'zip' ? <ICN.Box size={18} /> : <ICN.Github size={18} />}</div><div><div className="eyebrow">{activeMode === 'zip' ? 'ZIP upload' : 'GitHub pull'}</div><h2>{activeMode === 'zip' ? 'Drag and drop to deploy' : 'Import from repository'}</h2></div></div>
        {activeMode === 'github' ? (
          <div className="builder-import-pane"><div className="label">Repository URL</div><div className="input-group"><input autoFocus className="input mono" placeholder="https://github.com/your-org/your-site" value={repoUrl} onChange={(e) => updateRepoUrl(e.target.value)} onPaste={(e) => { const pasted = e.clipboardData?.getData('text'); if (pasted) { e.preventDefault(); updateRepoUrl(pasted); } }} onKeyDown={(e) => e.key === 'Enter' && handleGitConnect()} /><button className="btn btn-primary" onClick={handleGitConnect} disabled={gitBusy || importPhase === 'complete' || !detectedRepo}><ICN.Git size={14} /> {importPhase === 'complete' ? 'Opening' : gitBusy ? 'Importing' : 'Import'}</button></div><div style={{ marginTop: 12 }}><div className="label">Branch</div><input className="input mono" placeholder="main" value={repoBranch} onChange={(e) => setRepoBranch(e.target.value)} /></div>{repoUrl.trim() && !detectedRepo && <div style={{ marginTop: 10, color: 'var(--warning)', fontSize: 13 }}>Paste a GitHub repository URL, for example https://github.com/owner/repo.</div>}{gitError && <div style={{ marginTop: 10, color: 'var(--danger)', fontSize: 13 }}>{gitError}</div>}</div>
        ) : (
          <div className="builder-import-pane">
            <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragEnter={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()} style={{ border: `2px dashed ${zipFile ? 'var(--accent)' : dragging ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 'var(--r-lg)', padding: 28, textAlign: 'center', background: zipFile ? 'var(--accent-soft)' : dragging ? 'var(--accent-soft)' : 'var(--bg-deep)', cursor: 'pointer' }}>
              <input ref={fileInputRef} type="file" accept=".zip,application/zip,application/x-zip-compressed" style={{ display: 'none' }} onClick={(e) => { e.currentTarget.value = ''; }} onChange={(e) => selectZip(e.target.files?.[0])} />
              <div style={{ width: 52, height: 52, borderRadius: 999, background: zipFile ? 'var(--accent)' : 'var(--accent-soft)', color: zipFile ? '#fff' : 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>{zipFile ? <ICN.CheckCircle size={24} /> : <ICN.Box size={24} />}</div>
              <h3 style={{ margin: '0 0 6px' }}>{zipFile ? 'ZIP selected' : 'Drop your website ZIP here'}</h3>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>{zipFile ? `${zipFile.name} • ${formatFileSize(zipFile.size)}` : 'ZIP must contain a deployable site with package.json or index.html. Node modules and .git folders are ignored.'}</p>
            </div>
            {zipFile && <div className="card" style={{ marginTop: 12, padding: 12, background: 'var(--bg-deep)', border: '1px solid var(--accent)' }}><div className="row between" style={{ gap: 10 }}><div><div style={{ fontWeight: 700 }}>Selected file</div><div className="mono muted" style={{ fontSize: 12 }}>{zipFile.name} · {formatFileSize(zipFile.size)}</div></div><button className="btn btn-sm btn-outline" onClick={clearZip} disabled={zipBusy}>Remove</button></div></div>}
            {zipConfig && (
              <div className="card" style={{ marginTop: 12, padding: 12, background: 'var(--bg-deep)', fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Deploy config status</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div><span style={{ color: zipConfig.renderApiConfigured ? 'var(--accent)' : 'var(--danger)' }}>{zipConfig.renderApiConfigured ? '✓' : '✗'}</span> Render API: {zipConfig.renderApiConfigured ? 'configured' : 'not configured'}</div>
                  <div><span style={{ color: (zipConfig.renderSourceRepoConfigured || renderConfig.repoUrl.trim()) ? 'var(--accent)' : 'var(--danger)' }}>{(zipConfig.renderSourceRepoConfigured || renderConfig.repoUrl.trim()) ? '✓' : '✗'}</span> Generated source repo: {zipConfig.renderSourceRepoConfigured ? 'configured' : renderConfig.repoUrl.trim() ? 'set below' : 'not configured'}</div>
                  <div><span style={{ color: zipConfig.githubPublisherConfigured ? 'var(--accent)' : 'var(--danger)' }}>{zipConfig.githubPublisherConfigured ? '✓' : '✗'}</span> GitHub publisher token: {zipConfig.githubPublisherConfigured ? 'configured' : 'not configured'}</div>
                </div>
                {zipConfig.githubTokenError && <div style={{ marginTop: 6, color: 'var(--danger)', fontSize: 12 }}>{zipConfig.githubTokenError}</div>}
                {zipConfig.missing?.length > 0 && <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>Missing: {zipConfig.missing.join(', ')}</div>}
              </div>
            )}
            {zipConfig && !zipConfig.renderSourceRepoConfigured && !renderConfig.repoUrl.trim() && (
              <div style={{ marginTop: 12, padding: 12, border: '2px solid var(--warning, #e6a817)', borderRadius: 'var(--r-md)', background: 'var(--bg-deep)' }}>
                <div className="label" style={{ fontWeight: 600, color: 'var(--warning, #e6a817)' }}>Generated-sites GitHub repo URL *</div>
                <input className="input mono" value={renderConfig.repoUrl} onChange={(e) => updateRenderConfig('repoUrl', e.target.value)} placeholder="https://github.com/your-org/generated-sites" style={{ marginTop: 6 }} />
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Required for Render deployment. Render deploys from this repo, not from uploaded files directly.</div>
              </div>
            )}
            {zipNotice && <div style={{ marginTop: 10, color: 'var(--accent)', fontSize: 13 }}>{zipNotice}</div>}
            {zipError && <div style={{ marginTop: 10, color: 'var(--danger)', fontSize: 13 }}>{zipError}</div>}
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 12 }} onClick={handleZipDeploy} disabled={zipBusy || !zipFile}><ICN.Rocket size={14} /> {zipBusy ? 'Uploading...' : zipFile ? 'Deploy ZIP' : 'Choose ZIP first'}</button>
          </div>
        )}
        <div className="render-config-panel"><div><div className="eyebrow">Render deployment payload</div><h3>Service settings</h3></div><div className="render-config-grid render-config-grid--compact render-config-service-row"><label><span>Service type</span><select className="input" value={renderConfig.serviceType} onChange={(e) => updateServiceType(e.target.value)}><option value="static_site">Static Site</option><option value="web_service">Web Service</option></select></label><label><span>Plan</span><input className="input mono" value={renderConfig.plan} onChange={(e) => updateRenderConfig('plan', e.target.value)} /></label></div><div><h3>{isStaticSite ? 'Static site settings' : 'Web service settings'}</h3></div><div className="render-config-grid"><label><span>{isStaticSite ? 'Root directory' : 'Service root'}</span><input className="input mono" value={isStaticSite ? renderConfig.frontendRootDirectory : renderConfig.backendRootDirectory} onChange={(e) => updateRenderConfig(isStaticSite ? 'frontendRootDirectory' : 'backendRootDirectory', e.target.value)} placeholder={isStaticSite ? './' : 'server'} /></label><label><span>Build command</span><input className="input mono" value={isStaticSite ? renderConfig.frontendBuildCommand : renderConfig.backendBuildCommand} onChange={(e) => updateRenderConfig(isStaticSite ? 'frontendBuildCommand' : 'backendBuildCommand', e.target.value)} /></label>{isStaticSite ? <label><span>Publish directory</span><input className="input mono" value={renderConfig.frontendPublishDirectory} onChange={(e) => updateRenderConfig('frontendPublishDirectory', e.target.value)} /></label> : <label><span>Start command</span><input className="input mono" value={renderConfig.backendStartCommand} onChange={(e) => updateRenderConfig('backendStartCommand', e.target.value)} /></label>}</div>{activeMode === 'zip' && <div style={{ marginTop: 12 }}><div className="label">Optional generated-sites repository</div><input className="input mono" value={renderConfig.repoUrl} onChange={(e) => updateRenderConfig('repoUrl', e.target.value)} placeholder="https://github.com/your-org/generated-sites" /><div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Leave blank to use RENDER_GENERATED_SITES_REPO_URL.</div></div>}</div>
      </div><div className="bld-preview"><ImportProgressPreview phase={importPhase} repo={detectedRepo} branch={repoBranch || 'main'} error={activeError} showLoader={importStarted} isImporting={isImporting} zipFile={activeMode === 'zip' ? zipFile : null} /></div></div></div>
    </>
  );
}
