import React from 'react';
import { ICN } from '../../../icons';

export function ZipPreparePanel({
  zipFile,
  zipBusy,
  zipError,
  zipNotice,
  zipConfig,
  dragging,
  sourceRepo,
  fileInputRef,
  onDragState,
  onDrop,
  onSelectZip,
  onClearZip,
  onSourceRepoChange,
  formatFileSize,
}) {
  return (
    <div className="builder-import-pane">
      <div
        onDragOver={(e) => { e.preventDefault(); onDragState(true); }}
        onDragEnter={(e) => { e.preventDefault(); onDragState(true); }}
        onDragLeave={() => onDragState(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{ border: `2px dashed ${zipFile ? 'var(--accent)' : dragging ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 'var(--r-lg)', padding: 28, textAlign: 'center', background: zipFile ? 'var(--accent-soft)' : dragging ? 'var(--accent-soft)' : 'var(--bg-deep)', cursor: 'pointer' }}
      >
        <input ref={fileInputRef} type="file" accept=".zip,application/zip,application/x-zip-compressed" style={{ display: 'none' }} onClick={(e) => { e.currentTarget.value = ''; }} onChange={(e) => onSelectZip(e.target.files?.[0])} />
        <div style={{ width: 52, height: 52, borderRadius: 999, background: zipFile ? 'var(--accent)' : 'var(--accent-soft)', color: zipFile ? '#fff' : 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          {zipFile ? <ICN.CheckCircle size={24} /> : <ICN.Box size={24} />}
        </div>
        <h3 style={{ margin: '0 0 6px' }}>{zipFile ? 'ZIP selected' : 'Drop your website ZIP here'}</h3>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>{zipFile ? `${zipFile.name} - ${formatFileSize(zipFile.size)}` : 'ZIP must contain a deployable site with package.json or index.html. Node modules and .git folders are ignored.'}</p>
      </div>
      {zipFile && <div className="card" style={{ marginTop: 12, padding: 12, background: 'var(--bg-deep)', border: '1px solid var(--accent)' }}><div className="row between" style={{ gap: 10 }}><div><div style={{ fontWeight: 700 }}>Selected file</div><div className="mono muted" style={{ fontSize: 12 }}>{zipFile.name} - {formatFileSize(zipFile.size)}</div></div><button className="btn btn-sm btn-outline" onClick={onClearZip} disabled={zipBusy}>Remove</button></div></div>}
      {zipConfig && (
        <div className="card" style={{ marginTop: 12, padding: 12, background: 'var(--bg-deep)', fontSize: 13 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Hosting handoff status</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div><span style={{ color: zipConfig.renderApiConfigured ? 'var(--accent)' : 'var(--danger)' }}>{zipConfig.renderApiConfigured ? 'OK' : 'Missing'}</span> Render API: {zipConfig.renderApiConfigured ? 'configured' : 'not configured'}</div>
            <div><span style={{ color: (zipConfig.renderSourceRepoConfigured || sourceRepo.trim()) ? 'var(--accent)' : 'var(--danger)' }}>{(zipConfig.renderSourceRepoConfigured || sourceRepo.trim()) ? 'OK' : 'Missing'}</span> Source repo: {zipConfig.renderSourceRepoConfigured ? 'configured' : sourceRepo.trim() ? 'set below' : 'not configured'}</div>
          </div>
          {zipConfig.missing?.length > 0 && <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>Missing: {zipConfig.missing.join(', ')}</div>}
        </div>
      )}
      {zipConfig && !zipConfig.renderSourceRepoConfigured && !sourceRepo.trim() && (
        <div style={{ marginTop: 12, padding: 12, border: '2px solid var(--warning, #e6a817)', borderRadius: 'var(--r-md)', background: 'var(--bg-deep)' }}>
          <div className="label" style={{ fontWeight: 600, color: 'var(--warning, #e6a817)' }}>Generated-sites source repo URL *</div>
          <input className="input mono" value={sourceRepo} onChange={(e) => onSourceRepoChange(e.target.value)} placeholder="https://github.com/your-org/generated-sites" style={{ marginTop: 6 }} />
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Required for Hosting handoff. Hosting deploys from this repo, not from uploaded files directly.</div>
        </div>
      )}
      {zipNotice && <div style={{ marginTop: 10, color: 'var(--accent)', fontSize: 13 }}>{zipNotice}</div>}
      {zipError && <div style={{ marginTop: 10, color: 'var(--danger)', fontSize: 13 }}>{zipError}</div>}
    </div>
  );
}
