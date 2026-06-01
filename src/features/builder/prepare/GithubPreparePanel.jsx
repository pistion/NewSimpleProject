import React from 'react';
import { ICN } from '../../../icons';

export function GithubPreparePanel({
  repoUrl,
  repoBranch,
  detectedRepo,
  gitBusy,
  gitError,
  importPhase,
  onRepoUrlChange,
  onBranchChange,
  onImport,
}) {
  return (
    <div className="builder-import-pane">
      <div className="label">Repository URL</div>
      <div className="input-group">
        <input
          autoFocus
          className="input mono"
          placeholder="https://github.com/your-org/your-site"
          value={repoUrl}
          onChange={(e) => onRepoUrlChange(e.target.value)}
          onPaste={(e) => {
            const pasted = e.clipboardData?.getData('text');
            if (pasted) {
              e.preventDefault();
              onRepoUrlChange(pasted);
            }
          }}
          onKeyDown={(e) => e.key === 'Enter' && onImport()}
        />
        <button className="btn btn-primary" onClick={onImport} disabled={gitBusy || importPhase === 'complete' || !detectedRepo}>
          <ICN.Git size={14} /> {importPhase === 'complete' ? 'Opening' : gitBusy ? 'Importing' : 'Import'}
        </button>
      </div>
      <div style={{ marginTop: 12 }}>
        <div className="label">Branch</div>
        <input className="input mono" placeholder="main" value={repoBranch} onChange={(e) => onBranchChange(e.target.value)} />
      </div>
      {repoUrl.trim() && !detectedRepo && <div style={{ marginTop: 10, color: 'var(--warning)', fontSize: 13 }}>Paste a GitHub repository URL, for example https://github.com/owner/repo.</div>}
      {gitError && <div style={{ marginTop: 10, color: 'var(--danger)', fontSize: 13 }}>{gitError}</div>}
    </div>
  );
}
