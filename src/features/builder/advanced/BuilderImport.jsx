// BuilderImport.jsx - GitHub repository import + ZIP drag/drop Hosting handoff flow.
import React, { useState as useStateB } from 'react';
import { ICN } from '../../../icons';
import { parseGithubRepo } from '../../../api';
import {
  createGithubHostingDeployment,
  createZipHostingDeployment,
  getHostingDeploySettings,
} from '../../../api/hosting-deploy.js';
import { GithubPreparePanel } from '../prepare/GithubPreparePanel.jsx';
import { HandoffReadinessCard, getHandoffReadinessChecks } from '../prepare/HandoffReadinessCard.jsx';
import { HandoffSummaryCard } from '../prepare/HandoffSummaryCard.jsx';
import { ZipPreparePanel } from '../prepare/ZipPreparePanel.jsx';
import { DEPLOY_PRESETS } from '../prepare/deployPresets.js';

// ── Presets ────────────────────────────────────────────────────────────────────

// ── Handoff Doctor ─────────────────────────────────────────────────────────────

function getDeployDoctorChecks(config = {}, context = {}) {
  const checks = [];
  const serviceType = config.serviceType || 'static_site';
  const sourceRepository = config.sourceRepository || config.repoUrl || '';
  const branch = config.branch || 'main';
  const rootDirectory = config.rootDirectory || '';
  const buildCommand = config.buildCommand || '';
  const publishDirectory = config.publishDirectory || config.outputDirectory || '';
  const startCommand = config.startCommand || '';

  checks.push({ status: sourceRepository ? 'ok' : (context.sourceOptional ? 'warn' : 'error'), label: sourceRepository ? 'Source repository set' : (context.sourceOptional ? 'Source repository not set; server default will be used' : 'Source repository is required'), fix: null });
  checks.push({ status: branch ? 'ok' : 'error', label: branch ? `Branch set to ${branch}` : 'Branch is required', fix: null });

  if (rootDirectory.includes('/opt/render/project')) {
    checks.push({ status: 'error', label: 'Root directory cannot be a local Render filesystem path', fix: context.recommendedRoot ? { label: `Use ${context.recommendedRoot}`, patch: { rootDirectory: context.recommendedRoot } } : null });
  } else if (context.recommendedRoot && rootDirectory !== context.recommendedRoot) {
    checks.push({ status: 'warn', label: `Recommended root is ${context.recommendedRoot}`, fix: { label: `Use ${context.recommendedRoot}`, patch: { rootDirectory: context.recommendedRoot } } });
  } else {
    checks.push({ status: rootDirectory ? 'ok' : 'warn', label: rootDirectory ? `Root directory set to ${rootDirectory}` : 'Root directory not set; repo root will be used', fix: null });
  }

  if (serviceType === 'static_site') {
    checks.push({ status: buildCommand ? 'ok' : 'error', label: buildCommand ? 'Build command set' : 'Build command is required for static sites', fix: context.recommendedBuildCommand ? { label: `Use ${context.recommendedBuildCommand}`, patch: { buildCommand: context.recommendedBuildCommand } } : null });
    checks.push({ status: publishDirectory ? 'ok' : 'error', label: publishDirectory ? `Publish directory set to ${publishDirectory}` : 'Publish directory is required for static sites', fix: context.recommendedPublishDirectory ? { label: `Use ${context.recommendedPublishDirectory}`, patch: { publishDirectory: context.recommendedPublishDirectory } } : null });
  }

  if (serviceType === 'web_service') {
    checks.push({ status: buildCommand ? 'ok' : 'error', label: buildCommand ? 'Build command set' : 'Build command is required for web services', fix: context.recommendedBuildCommand ? { label: `Use ${context.recommendedBuildCommand}`, patch: { buildCommand: context.recommendedBuildCommand } } : null });
    checks.push({ status: startCommand ? 'ok' : 'error', label: startCommand ? 'Start command set' : 'Start command is required for web services', fix: context.recommendedStartCommand ? { label: `Use ${context.recommendedStartCommand}`, patch: { startCommand: context.recommendedStartCommand } } : null });
    checks.push({ status: 'info', label: 'Web services must listen on process.env.PORT and bind to 0.0.0.0', fix: null });
  }

  return checks;
}

function getDeploymentReadinessScore(checks = []) {
  if (!checks.length) return 0;
  const max = checks.length * 2;
  const score = checks.reduce((total, check) => {
    if (check.status === 'ok') return total + 2;
    if (check.status === 'warn' || check.status === 'info') return total + 1;
    return total;
  }, 0);
  return Math.round((score / max) * 100);
}

function DeployDoctorCard({ config, context, onApplyFix }) {
  const checks = getDeployDoctorChecks(config, context);
  const errors = checks.filter((c) => c.status === 'error').length;
  const warnings = checks.filter((c) => c.status === 'warn').length;
  const score = getDeploymentReadinessScore(checks);

  return (
    <div className="card" style={{ padding: 14, background: 'var(--bg-deep)' }}>
      <div className="row between">
        <div><div className="eyebrow">Handoff Doctor</div><h3 style={{ margin: '4px 0 0' }}>Handoff readiness</h3></div>
        <div className="row" style={{ gap: 8 }}>
          <Badge tone={errors ? 'danger' : warnings ? 'warn' : 'success'} dot={false}>{errors ? `${errors} issue${errors > 1 ? 's' : ''}` : warnings ? `${warnings} warning${warnings > 1 ? 's' : ''}` : 'Ready'}</Badge>
          <Badge tone={score >= 100 ? 'success' : score >= 70 ? 'warn' : 'danger'} dot={false}>{score}%</Badge>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
        {checks.map((check, i) => (
          <div key={i} className="row between" style={{ gap: 8 }}>
            <div className="row" style={{ gap: 8 }}>
              <span style={{ color: check.status === 'ok' ? 'var(--accent)' : check.status === 'error' ? 'var(--danger)' : check.status === 'warn' ? 'var(--warning)' : 'var(--text-muted)' }}>
                {check.status === 'ok' ? '✓' : check.status === 'error' ? '✗' : check.status === 'warn' ? '⚠' : '•'}
              </span>
              <span className="muted" style={{ fontSize: 13 }}>{check.label}</span>
            </div>
            {check.fix && <button className="btn btn-sm btn-outline" onClick={() => onApplyFix?.(check.fix.patch)}>{check.fix.label}</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

function DeploymentPreviewCard({ config }) {
  const isStatic = (config.serviceType || 'static_site') === 'static_site';
  return (
    <div className="card" style={{ padding: 14, background: 'var(--bg-deep)' }}>
      <div className="eyebrow">Suggested hosting handoff</div>
      <h3 style={{ margin: '4px 0 10px' }}>Suggested settings for Hosting</h3>
      <div className="kv" style={{ gridTemplateColumns: '120px 1fr' }}>
        <dt>Service name</dt><dd className="mono">{config.serviceName || 'auto'}</dd>
        <dt>Type</dt><dd>{config.serviceType || 'static_site'}</dd>
        <dt>Repo</dt><dd className="mono" style={{ wordBreak: 'break-all' }}>{config.sourceRepository || config.repoUrl || '(server default)'}</dd>
        <dt>Branch</dt><dd className="mono">{config.branch || 'main'}</dd>
        <dt>Root</dt><dd className="mono">{config.rootDirectory || 'repo root'}</dd>
        <dt>Build</dt><dd className="mono">{config.buildCommand || 'Not set'}</dd>
        {isStatic
          ? <><dt>Publish</dt><dd className="mono">{config.publishDirectory || config.outputDirectory || 'Not set'}</dd></>
          : <><dt>Start</dt><dd className="mono">{config.startCommand || 'Not set'}</dd></>}
        <dt>Plan</dt><dd className="mono">{config.plan || 'starter'}</dd>
        <dt>Region</dt><dd className="mono">{config.region || 'oregon'}</dd>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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
    zip_ready: 'ZIP selected. Click Send ZIP to Hosting to create a handoff.',
    pulling: 'Pulling files from GitHub...',
    uploading: 'Sending to Hosting...',
    building: 'Preparing handoff...',
    complete: 'Import complete. Opening next screen...',
    error: 'Import needs attention.',
  }[phase] || 'Ready when you are.';
  const loaderText = error ? 'Error' : phase === 'complete' ? 'Ready' : zipFile ? 'Uploading' : 'Importing';

  return (
    <div className={`bld-preview-frame import-loader-frame ${!isImporting ? 'import-loader-frame--still' : ''}`}>
      <div className="import-loader-shell">
        <div className="import-loader-copy">
          <div className="eyebrow">Preparation pipeline</div>
          <h2>{title}</h2>
          <div className="muted">
            {zipFile ? <span className="mono">{formatFileSize(zipFile.size)} ZIP package selected</span> : repo ? <span className="mono">{repo.url} - {branch}</span> : activeLabel}
          </div>
        </div>
        {showLoader ? (
          <div className="loader" aria-live="polite" aria-label={activeLabel}>{Array.from({ length: 9 }).map((_, index) => <div className="text" key={index}><span>{loaderText}</span></div>)}<div className="line" /></div>
        ) : (
          <div className="import-loader-standby">{zipFile ? <ICN.Box size={18} /> : <ICN.Git size={18} />}<span>{zipFile ? 'ZIP ready for handoff' : repo ? 'Repository detected' : 'Waiting for project'}</span></div>
        )}
        <div className="term import-loader-term">
          <div><span className="ts">now</span> <span className={error ? 'err' : 'info'}>{error || activeLabel}</span></div>
          {repo && <div><span className="ts">repo</span> <span className="dim">{repo.owner}/{repo.repo}</span></div>}
          {zipFile && <div><span className="ts">zip</span> <span className="ok">Selected: {zipFile.name} ({formatFileSize(zipFile.size)})</span></div>}
          <div><span className="ts">next</span> <span className="ok">Hosting detail opens after the handoff record is created</span></div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function BuilderImport({ mode = 'github', navigate }) {
  const [activeMode, setActiveMode] = useStateB(mode === 'zip' ? 'zip' : 'github');
  const [handoffDraft, setHandoffDraft] = useStateB({
    siteName: '',
    sourceType: mode === 'zip' ? 'zip' : 'github',
    sourceReference: '',
    branch: 'main',
    detectedFramework: '',
    projectType: '',
    recommended: {
      serviceType: 'static_site',
      buildCommand: 'npm run build',
      publishDirectory: 'dist',
      startCommand: '',
      rootDirectory: '',
    },
  });
  const [repoUrl, setRepoUrl] = useStateB('');
  const [repoBranch, setRepoBranch] = useStateB('main');
  const [gitBusy, setGitBusy] = useStateB(false);
  const [gitError, setGitError] = useStateB(null);
  const [zipFile, setZipFile] = useStateB(null);
  const [zipBusy, setZipBusy] = useStateB(false);
  const [zipError, setZipError] = useStateB(null);
  const [zipNotice, setZipNotice] = useStateB('');
  const [dragging, setDragging] = useStateB(false);
  const [importPhase, setImportPhase] = useStateB('idle');
  const [renderConfig, setRenderConfig] = useStateB({
    serviceName: '', frontendRootDirectory: '', frontendBuildCommand: 'npm run build',
    frontendPublishDirectory: 'dist', backendRootDirectory: 'server',
    backendBuildCommand: 'npm install && npm run build', backendStartCommand: 'npm start',
    serviceType: 'static_site', plan: 'starter', region: 'oregon',
    runtime: 'node', healthCheckPath: '/', repoUrl: '', pullRequestPreviews: 'no',
  });
  const [zipConfig, setZipConfig] = useStateB(null);
  const [settingsMode, setSettingsMode] = useStateB('basic');
  const [activePreset, setActivePreset] = useStateB(null);
  const [presetNotice, setPresetNotice] = useStateB('');
  const phaseTimer = React.useRef(null);
  const fileInputRef = React.useRef(null);
  const detectedRepo = parseGithubRepo(repoUrl);
  const isImporting = ['pulling', 'uploading', 'building'].includes(importPhase);
  const importStarted = ['pulling', 'uploading', 'building', 'complete', 'error'].includes(importPhase);
  const isStaticSite = renderConfig.serviceType === 'static_site';

  // Build flat config for doctor/preview
  const flatConfig = React.useMemo(() => ({
    serviceName: renderConfig.serviceName || (activeMode === 'zip' && zipFile ? zipFile.name.replace(/\.zip$/i, '') : detectedRepo ? detectedRepo.repo : ''),
    serviceType: renderConfig.serviceType,
    sourceRepository: activeMode === 'github' ? repoUrl : renderConfig.repoUrl,
    branch: repoBranch || 'main',
    rootDirectory: isStaticSite ? renderConfig.frontendRootDirectory : renderConfig.backendRootDirectory,
    buildCommand: isStaticSite ? renderConfig.frontendBuildCommand : renderConfig.backendBuildCommand,
    publishDirectory: renderConfig.frontendPublishDirectory,
    outputDirectory: renderConfig.frontendPublishDirectory,
    startCommand: renderConfig.backendStartCommand,
    plan: renderConfig.plan,
    region: renderConfig.region,
    repoUrl: renderConfig.repoUrl,
  }), [renderConfig, activeMode, repoUrl, repoBranch, zipFile, detectedRepo, isStaticSite]);

  const doctorContext = React.useMemo(() => ({
    sourceOptional: activeMode === 'zip' && (zipConfig?.renderSourceRepoConfigured || false),
    recommendedBuildCommand: isStaticSite ? 'bash glondia-render-build.sh' : 'npm install && npm run build',
    recommendedPublishDirectory: 'dist',
    recommendedStartCommand: 'npm start',
  }), [activeMode, zipConfig, isStaticSite]);

  const doctorChecks = React.useMemo(() => getHandoffReadinessChecks(flatConfig, doctorContext), [flatConfig, doctorContext]);
  const hasErrors = doctorChecks.some((c) => c.status === 'error');

  const updateRepoUrl = (value) => { setRepoUrl(value); setGitError(null); if (!gitBusy) setImportPhase(value.trim() ? (parseGithubRepo(value) ? 'detected' : 'checking') : 'idle'); };
  const updateRenderConfig = (key, value) => setRenderConfig((current) => ({ ...current, [key]: value }));
  const updateServiceType = (serviceType) => setRenderConfig((current) => ({ ...current, serviceType, plan: serviceType === 'static_site' ? 'starter' : current.plan }));

  const applyPreset = (preset) => {
    setActivePreset(preset.id);
    setPresetNotice(`${preset.label} preset applied`);
    setRenderConfig((c) => ({
      ...c,
      serviceType: preset.serviceType || c.serviceType,
      ...(preset.serviceType === 'static_site' ? {
        frontendBuildCommand: preset.buildCommand || c.frontendBuildCommand,
        frontendPublishDirectory: preset.publishDirectory || c.frontendPublishDirectory,
      } : {
        backendBuildCommand: preset.buildCommand || c.backendBuildCommand,
        backendStartCommand: preset.startCommand || c.backendStartCommand,
        runtime: preset.runtime || c.runtime,
      }),
    }));
    setTimeout(() => setPresetNotice(''), 3000);
  };

  const applyDeployFix = (patch = {}) => {
    setRenderConfig((c) => {
      const next = { ...c };
      if (patch.buildCommand !== undefined) {
        if (c.serviceType === 'static_site') next.frontendBuildCommand = patch.buildCommand;
        else next.backendBuildCommand = patch.buildCommand;
      }
      if (patch.publishDirectory !== undefined) next.frontendPublishDirectory = patch.publishDirectory;
      if (patch.startCommand !== undefined) next.backendStartCommand = patch.startCommand;
      if (patch.rootDirectory !== undefined) {
        if (c.serviceType === 'static_site') next.frontendRootDirectory = patch.rootDirectory;
        else next.backendRootDirectory = patch.rootDirectory;
      }
      return next;
    });
  };

  React.useEffect(() => () => clearTimeout(phaseTimer.current), []);
  React.useEffect(() => setActiveMode(mode === 'zip' ? 'zip' : 'github'), [mode]);
  React.useEffect(() => { if (activeMode !== 'zip') return; getHostingDeploySettings().then((cfg) => setZipConfig(cfg)).catch(() => {}); }, [activeMode]);
  React.useEffect(() => {
    const isStatic = renderConfig.serviceType === 'static_site';
    setHandoffDraft({
      siteName: renderConfig.serviceName,
      sourceType: activeMode,
      sourceReference: activeMode === 'github' ? repoUrl : renderConfig.repoUrl,
      branch: repoBranch || 'main',
      detectedFramework: activePreset || '',
      projectType: renderConfig.serviceType,
      recommended: {
        serviceType: renderConfig.serviceType,
        buildCommand: isStatic ? renderConfig.frontendBuildCommand : renderConfig.backendBuildCommand,
        publishDirectory: isStatic ? renderConfig.frontendPublishDirectory : '',
        startCommand: isStatic ? '' : renderConfig.backendStartCommand,
        rootDirectory: isStatic ? renderConfig.frontendRootDirectory : renderConfig.backendRootDirectory,
      },
    });
  }, [activeMode, activePreset, renderConfig, repoBranch, repoUrl]);

  const selectZip = (file) => {
    setZipNotice('');
    if (!file) return;
    setZipError(null);
    if (!/\.zip$/i.test(file.name)) { setZipError('Please upload a .zip file.'); setImportPhase('error'); return; }
    setZipFile(file);
    setZipNotice(`${file.name} selected successfully. Click Send ZIP to Hosting to create a handoff.`);
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
      const effectiveName = renderConfig.serviceName.trim() || (detectedRepo ? detectedRepo.repo : 'glondia-site');
      const result = await createGithubHostingDeployment({
        ...handoffDraft,
        siteName: effectiveName,
        slug: effectiveName,
        name: effectiveName,
        repoUrl,
        repositoryUrl: repoUrl,
        branch: repoBranch || 'main',
        rootDirectory,
        buildCommand,
        publishDirectory: outputDirectory,
        outputDirectory,
        serviceType: renderConfig.serviceType,
        plan: renderConfig.plan,
        region: renderConfig.region,
        startCommand: isStaticSite ? '' : renderConfig.backendStartCommand,
        runtime: isStaticSite ? '' : renderConfig.runtime,
        source: 'github-link',
        sourceReference: repoUrl,
      });
      clearTimeout(phaseTimer.current); setImportPhase('complete'); window.setTimeout(() => navigate({ view: 'hosting-detail', params: { id: result.deploymentId || result.id } }), 700);
    } catch (err) { setGitError(err.message || 'Failed to connect repository.'); setImportPhase('error'); } finally { setGitBusy(false); }
  };

  const handleZipDeploy = async () => {
    if (!zipFile) { setZipError('Choose or drop a ZIP file first.'); return; }
    setZipBusy(true); setZipError(null); setZipNotice('Sending to Hosting...'); setImportPhase('uploading'); clearTimeout(phaseTimer.current); phaseTimer.current = setTimeout(() => setImportPhase('building'), 1000);
    try {
      const effectiveZipName = renderConfig.serviceName.trim() || zipFile.name.replace(/\.zip$/i, '');
      const result = await createZipHostingDeployment(zipFile, {
        // Identity
        siteName: effectiveZipName, slug: effectiveZipName, serviceName: effectiveZipName,
        // Hosting handoff settings
        environment: 'production',
        // Build settings
        buildCommand: isStaticSite ? (renderConfig.frontendBuildCommand || 'npm run build') : (renderConfig.backendBuildCommand || 'npm install && npm run build'),
        publishDirectory: renderConfig.frontendPublishDirectory || 'dist',
        // Source
        repoUrl: renderConfig.repoUrl,
        branch: repoBranch || 'main',
        rootDirectory: isStaticSite ? renderConfig.frontendRootDirectory : renderConfig.backendRootDirectory,
        // Env vars (JSON-stringified — route parses it back)
        // Disk (web services only, JSON-stringified)
      });
      clearTimeout(phaseTimer.current); setImportPhase('complete'); setZipNotice('ZIP handoff created. Opening Hosting detail...'); window.setTimeout(() => navigate({ view: 'hosting-detail', params: { id: result.deploymentId } }), 700);
    } catch (err) { setZipError(err.message || 'ZIP upload failed.'); setZipNotice(''); setImportPhase('error'); } finally { setZipBusy(false); }
  };

  const activeError = activeMode === 'zip' ? zipError : gitError;

  return (
    <>
      <div className="page-head"><div><a className="page-eyebrow" href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'builder-gallery' }); }}>Back to site builder</a><h1>Prepare an existing site</h1><p className="sub">Prepare source from GitHub or a ZIP package, then send the handoff to Hosting. Hosting owns the live deployment controls.</p></div></div>
      <div className="tabs" style={{ marginBottom: 14 }}><button className={activeMode === 'github' ? 'active' : ''} onClick={() => { setActiveMode('github'); setImportPhase(repoUrl ? (detectedRepo ? 'detected' : 'checking') : 'idle'); }}><ICN.Git size={14} /> GitHub</button><button className={activeMode === 'zip' ? 'active' : ''} onClick={() => { setActiveMode('zip'); setImportPhase(zipFile ? 'zip_ready' : 'idle'); }}><ICN.Box size={14} /> ZIP upload</button></div>
      <div className="card card-flush builder-import-workspace" style={{ overflow: 'hidden' }}><div className="bld-split"><div className="github-pull-toggle"><div className="github-pull-head"><div className="github-pull-icon">{activeMode === 'zip' ? <ICN.Box size={18} /> : <ICN.Github size={18} />}</div><div><div className="eyebrow">{activeMode === 'zip' ? 'ZIP preparation' : 'GitHub preparation'}</div><h2>{activeMode === 'zip' ? 'Drag and drop to prepare' : 'Import from repository'}</h2></div></div>
        {activeMode === 'github' ? (
          <GithubPreparePanel repoUrl={repoUrl} repoBranch={repoBranch} detectedRepo={detectedRepo} gitBusy={gitBusy} gitError={gitError} importPhase={importPhase} onRepoUrlChange={updateRepoUrl} onBranchChange={setRepoBranch} onImport={handleGitConnect} />
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
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Hosting handoff status</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div><span style={{ color: zipConfig.renderApiConfigured ? 'var(--accent)' : 'var(--danger)' }}>{zipConfig.renderApiConfigured ? '✓' : '✗'}</span> Render API: {zipConfig.renderApiConfigured ? 'configured' : 'not configured'}</div>
                  <div><span style={{ color: (zipConfig.renderSourceRepoConfigured || renderConfig.repoUrl.trim()) ? 'var(--accent)' : 'var(--danger)' }}>{(zipConfig.renderSourceRepoConfigured || renderConfig.repoUrl.trim()) ? '✓' : '✗'}</span> Source repo: {zipConfig.renderSourceRepoConfigured ? 'configured' : renderConfig.repoUrl.trim() ? 'set below' : 'not configured'}</div>
                </div>
                {zipConfig.missing?.length > 0 && <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>Missing: {zipConfig.missing.join(', ')}</div>}
              </div>
            )}
            {zipConfig && !zipConfig.renderSourceRepoConfigured && !renderConfig.repoUrl.trim() && (
              <div style={{ marginTop: 12, padding: 12, border: '2px solid var(--warning, #e6a817)', borderRadius: 'var(--r-md)', background: 'var(--bg-deep)' }}>
                <div className="label" style={{ fontWeight: 600, color: 'var(--warning, #e6a817)' }}>Generated-sites source repo URL *</div>
                <input className="input mono" value={renderConfig.repoUrl} onChange={(e) => updateRenderConfig('repoUrl', e.target.value)} placeholder="https://github.com/your-org/generated-sites" style={{ marginTop: 6 }} />
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Required for Hosting handoff. Hosting deploys from this repo, not from uploaded files directly.</div>
              </div>
            )}
            {zipNotice && <div style={{ marginTop: 10, color: 'var(--accent)', fontSize: 13 }}>{zipNotice}</div>}
            {zipError && <div style={{ marginTop: 10, color: 'var(--danger)', fontSize: 13 }}>{zipError}</div>}
          </div>
        )}

        {/* ── Hosting handoff panel ──────────────────────────────────── */}
        <div className="render-config-panel">
          <div className="row between" style={{ marginBottom: 6 }}>
            <div><div className="eyebrow">Hosting Handoff</div></div>
            <div className="tabs" style={{ margin: 0, fontSize: 12 }}>
              <button className={settingsMode === 'basic' ? 'active' : ''} onClick={() => setSettingsMode('basic')} style={{ padding: '4px 10px' }}>Basic</button>
            </div>
          </div>

          {/* Preset chips */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {DEPLOY_PRESETS.map((p) => (
              <button key={p.id} className={`btn btn-sm ${activePreset === p.id ? 'btn-primary' : 'btn-outline'}`} onClick={() => applyPreset(p)} title={p.description} style={{ fontSize: 11, padding: '3px 8px' }}>{p.label}</button>
            ))}
          </div>
          {presetNotice && <div style={{ color: 'var(--accent)', fontSize: 12, marginBottom: 8 }}>{presetNotice}</div>}

          {/* Basic settings — always visible */}
          <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>Handoff Settings</h3>
          <div className="render-config-grid render-config-grid--compact">
            <label><span>Handoff name</span><input className="input mono" value={renderConfig.serviceName} onChange={(e) => updateRenderConfig('serviceName', e.target.value)} placeholder={activeMode === 'zip' && zipFile ? zipFile.name.replace(/\.zip$/i, '') : detectedRepo ? detectedRepo.repo : 'my-site'} /></label>
          </div>

          {/* Build settings — always visible */}
          <h3 style={{ margin: '12px 0 8px', fontSize: 13 }}>{isStaticSite ? 'Build Settings' : 'Build & Runtime'}</h3>
          <div className="render-config-grid">
            {!isStaticSite && <label><span>Runtime</span><select className="input" value={renderConfig.runtime} onChange={(e) => updateRenderConfig('runtime', e.target.value)}><option value="node">Node</option><option value="python">Python</option><option value="go">Go</option><option value="rust">Rust</option><option value="ruby">Ruby</option><option value="elixir">Elixir</option></select></label>}
            <label><span>Build command</span><input className="input mono" value={isStaticSite ? renderConfig.frontendBuildCommand : renderConfig.backendBuildCommand} onChange={(e) => updateRenderConfig(isStaticSite ? 'frontendBuildCommand' : 'backendBuildCommand', e.target.value)} /></label>
            {isStaticSite
              ? <label><span>Publish directory</span><input className="input mono" value={renderConfig.frontendPublishDirectory} onChange={(e) => updateRenderConfig('frontendPublishDirectory', e.target.value)} /></label>
              : <label><span>Start command</span><input className="input mono" value={renderConfig.backendStartCommand} onChange={(e) => updateRenderConfig('backendStartCommand', e.target.value)} /></label>}
          </div>

          {/* Advanced settings — toggle */}
          {settingsMode === 'advanced' && (<>
            <h3 style={{ margin: '12px 0 8px', fontSize: 13 }}>Source Settings</h3>
            <div className="render-config-grid">
              {activeMode === 'zip' && <label><span>Source repository</span><input className="input mono" value={renderConfig.repoUrl} onChange={(e) => updateRenderConfig('repoUrl', e.target.value)} placeholder="https://github.com/your-org/generated-sites" /><span className="muted" style={{ fontSize: 11 }}>Hosting deploys from this repo. Leave blank to use server default.</span></label>}
              {activeMode === 'github' && <label><span>Source repository</span><input className="input mono" value={repoUrl} disabled style={{ opacity: 0.7 }} /></label>}
              <label><span>Branch</span><input className="input mono" value={repoBranch} onChange={(e) => setRepoBranch(e.target.value)} placeholder="main" /></label>
              <label><span>Root directory</span><input className="input mono" value={isStaticSite ? renderConfig.frontendRootDirectory : renderConfig.backendRootDirectory} onChange={(e) => updateRenderConfig(isStaticSite ? 'frontendRootDirectory' : 'backendRootDirectory', e.target.value)} placeholder={isStaticSite ? './' : 'server'} /><span className="muted" style={{ fontSize: 11 }}>Must be a repo path, not /opt/render/project/...</span></label>
            </div>

            <h3 style={{ margin: '12px 0 8px', fontSize: 13 }}>Infrastructure</h3>
            <div className="render-config-grid render-config-grid--compact">
              <label><span>Plan</span><input className="input mono" value={renderConfig.plan} onChange={(e) => updateRenderConfig('plan', e.target.value)} /></label>
              <label><span>Region</span><select className="input" value={renderConfig.region} onChange={(e) => updateRenderConfig('region', e.target.value)}><option value="oregon">Oregon (US West)</option><option value="ohio">Ohio (US East)</option><option value="frankfurt">Frankfurt (EU)</option><option value="singapore">Singapore (Asia)</option></select></label>
              {isStaticSite && <label><span>Pull request previews</span><select className="input" value={renderConfig.pullRequestPreviews} onChange={(e) => updateRenderConfig('pullRequestPreviews', e.target.value)}><option value="no">Disabled</option><option value="yes">Enabled</option></select></label>}
              {!isStaticSite && <label><span>Health check path</span><input className="input mono" value={renderConfig.healthCheckPath} onChange={(e) => updateRenderConfig('healthCheckPath', e.target.value)} placeholder="/" /></label>}
            </div>

            {!isStaticSite && <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Your app must listen on process.env.PORT and bind to 0.0.0.0.</div>}

            <h3 style={{ margin: '12px 0 8px', fontSize: 13 }}>Environment Variables</h3>
            <div style={{ display: 'grid', gap: 6 }}>
              {envVars.map((ev, i) => (
                <div key={i} style={{ display: 'flex', gap: 6 }}>
                  <input className="input mono" placeholder="KEY" value={ev.key} style={{ flex: '0 0 38%' }}
                    onChange={e => setEnvVars(v => v.map((x, j) => j === i ? { ...x, key: e.target.value } : x))} />
                  <input className="input mono" placeholder="value" value={ev.value} style={{ flex: 1 }}
                    onChange={e => setEnvVars(v => v.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
                  <button className="btn btn-sm btn-outline" style={{ flexShrink: 0 }}
                    onClick={() => setEnvVars(v => v.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              <button className="btn btn-sm btn-outline" style={{ alignSelf: 'flex-start' }}
                onClick={() => setEnvVars(v => [...v, { key: '', value: '' }])}>+ Add variable</button>
              <div className="muted" style={{ fontSize: 11 }}>Variables injected at deploy time. Secrets can also be added in the Env Vars tab after deploy.</div>
            </div>

            {!isStaticSite && (<>
              <h3 style={{ margin: '12px 0 8px', fontSize: 13 }}>Persistent Disk</h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <input type="checkbox" id="disk-enabled" checked={disk.enabled}
                  onChange={e => setDisk(d => ({ ...d, enabled: e.target.checked }))} />
                <label htmlFor="disk-enabled" style={{ fontSize: 13 }}>Attach persistent disk (web services only)</label>
              </div>
              {disk.enabled && (
                <div className="render-config-grid render-config-grid--compact">
                  <label><span>Disk name</span><input className="input mono" value={disk.name}
                    onChange={e => setDisk(d => ({ ...d, name: e.target.value }))} placeholder="data" /></label>
                  <label><span>Mount path</span><input className="input mono" value={disk.mountPath}
                    onChange={e => setDisk(d => ({ ...d, mountPath: e.target.value }))} placeholder="/data" /></label>
                  <label><span>Size (GB)</span><input className="input mono" type="number" min="1" value={disk.sizeGB}
                    onChange={e => setDisk(d => ({ ...d, sizeGB: Number(e.target.value) }))} /></label>
                </div>
              )}
            </>)}
          </>)}

          {/* Handoff Doctor */}
          <div style={{ marginTop: 14 }}>
            <HandoffReadinessCard config={flatConfig} context={doctorContext} onApplyFix={applyDeployFix} />
          </div>

          {/* Deployment Preview */}
          <div style={{ marginTop: 10 }}>
            <HandoffSummaryCard config={flatConfig} />
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="btn btn-outline" disabled style={{ fontSize: 12 }}>Save Draft (coming soon)</button>
            {activeMode === 'zip'
              ? <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleZipDeploy} disabled={zipBusy || !zipFile}><ICN.Rocket size={14} /> {zipBusy ? 'Handing off...' : zipFile ? 'Send ZIP to Hosting' : 'Choose ZIP first'}</button>
              : <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleGitConnect} disabled={gitBusy || importPhase === 'complete' || !detectedRepo}><ICN.Git size={14} /> {importPhase === 'complete' ? 'Opening' : gitBusy ? 'Importing' : 'Import source'}</button>}
          </div>
        </div>
      </div><div className="bld-preview"><ImportProgressPreview phase={importPhase} repo={detectedRepo} branch={repoBranch || 'main'} error={activeError} showLoader={importStarted} isImporting={isImporting} zipFile={activeMode === 'zip' ? zipFile : null} /></div></div></div>
    </>
  );
}
