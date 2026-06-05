import React, { useEffect, useState } from 'react';
import { Badge, Empty } from '../../components';
import { listHostingDeployHistory } from '../../api';
import { normalizeList } from './shared';
import { Notice } from './SectionShell';

function tone(status) {
  if (['live', 'succeeded', 'success', 'deployed'].includes(String(status).toLowerCase())) return 'success';
  if (['failed', 'failure', 'canceled'].includes(String(status).toLowerCase())) return 'danger';
  if (['build_in_progress', 'building', 'deploying', 'pending'].includes(String(status).toLowerCase())) return 'warn';
  return 'muted';
}

export default function DeployHistorySection({ deploymentId, busy, onRollback }) {
  const [deploys, setDeploys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    setLoading(true);
    listHostingDeployHistory(deploymentId)
      .then((data) => setDeploys(normalizeList(data, ['deploys']).map((item) => item?.deploy || item)))
      .catch((error) => setErr(error.message || 'Could not load deploy history.'))
      .finally(() => setLoading(false));
  }, [deploymentId]);

  if (loading) return <div className="card" style={{ padding: 36 }}><Empty icon="Refresh" title="Loading deploy history..." /></div>;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Deploy history</h2>
      <Notice type="error">{err}</Notice>
      {deploys.length === 0 ? (
        <Empty icon="Layers" title="No deploys found" body="Deploy history will appear here after your first deployment." />
      ) : (
        <div className="hosting-card-list">
          {deploys.map((deploy) => (
            <div className="hosting-row-card" key={deploy.id}>
              <div>
                <div className="mono">{deploy.commit?.id?.slice(0, 8) || deploy.commitId?.slice(0, 8) || '-'}</div>
                {deploy.commit?.message && <div className="muted hosting-truncate">{deploy.commit.message}</div>}
              </div>
              <Badge tone={tone(deploy.status)} dot={false}>{deploy.status || '-'}</Badge>
              <div className="hosting-row-meta">{deploy.createdAt ? new Date(deploy.createdAt).toLocaleString() : '-'}</div>
              {deploy.id && <button className="btn btn-sm btn-outline" disabled={!!busy} onClick={() => onRollback(deploy.id)}>{busy === 'rollback' ? 'Rolling back...' : 'Rollback'}</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
