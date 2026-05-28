// BuilderImport.jsx — GitHub repository import flow (advanced/internal).
import React, { useState as useStateB } from 'react';
import { ICN } from '../../../icons';
import { importBuilderSiteFromGithub, parseGithubRepo } from '../../../api';

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
                    if (pasted) { e.preventDefault(); updateRepoUrl(pasted); }
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
                  <div><h3>Static site settings</h3></div>
                  <div className="render-config-grid">
                    <label><span>Root directory</span><input className="input mono" value={renderConfig.frontendRootDirectory} onChange={(e) => updateRenderConfig('frontendRootDirectory', e.target.value)} placeholder="./" /></label>
                    <label><span>Build command</span><input className="input mono" value={renderConfig.frontendBuildCommand} onChange={(e) => updateRenderConfig('frontendBuildCommand', e.target.value)} /></label>
                    <label><span>Publish directory</span><input className="input mono" value={renderConfig.frontendPublishDirectory} onChange={(e) => updateRenderConfig('frontendPublishDirectory', e.target.value)} /></label>
                  </div>
                </>
              ) : (
                <>
                  <div><h3>Web service settings</h3></div>
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
