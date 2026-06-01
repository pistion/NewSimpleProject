import React from 'react';

export function HandoffSummaryCard({ config }) {
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
