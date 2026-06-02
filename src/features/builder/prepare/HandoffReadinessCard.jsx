import React from 'react';
import { Badge } from '../../../components';

export function getHandoffReadinessChecks(config = {}, context = {}) {
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
    checks.push({ status: 'error', label: 'Root directory cannot be a local server filesystem path', fix: context.recommendedRoot ? { label: `Use ${context.recommendedRoot}`, patch: { rootDirectory: context.recommendedRoot } } : null });
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

function getReadinessScore(checks = []) {
  if (!checks.length) return 0;
  const max = checks.length * 2;
  const score = checks.reduce((total, check) => {
    if (check.status === 'ok') return total + 2;
    if (check.status === 'warn' || check.status === 'info') return total + 1;
    return total;
  }, 0);
  return Math.round((score / max) * 100);
}

export function HandoffReadinessCard({ config, context, onApplyFix }) {
  const checks = getHandoffReadinessChecks(config, context);
  const errors = checks.filter((c) => c.status === 'error').length;
  const warnings = checks.filter((c) => c.status === 'warn').length;
  const score = getReadinessScore(checks);

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
                {check.status === 'ok' ? 'OK' : check.status === 'error' ? '!' : check.status === 'warn' ? 'Warn' : 'Info'}
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
