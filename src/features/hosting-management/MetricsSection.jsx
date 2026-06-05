import React, { useEffect, useState } from 'react';
import { getHostingMetrics } from '../../api';

const METRICS = [
  { type: 'cpu', label: 'CPU', unit: '%' },
  { type: 'memory', label: 'Memory', unit: 'MB' },
  { type: 'http-requests', label: 'HTTP Requests', unit: 'req/s' },
  { type: 'bandwidth', label: 'Bandwidth', unit: 'GB' },
];

function MetricCard({ deploymentId, metric }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    setLoading(true);
    getHostingMetrics(deploymentId, metric.type)
      .then(setData)
      .catch((error) => setErr(error.message || 'Could not load metric.'))
      .finally(() => setLoading(false));
  }, [deploymentId, metric.type]);

  const points = data?.data || data?.values || (Array.isArray(data) ? data : []);
  const latest = points.length ? points[points.length - 1] : null;
  const latestValue = latest?.value != null ? Number(latest.value).toFixed(2) : null;
  const max = points.length ? Math.max(...points.map((point) => Number(point.value || 0))) : 1;

  return (
    <div className="card hosting-metric-card">
      <div className="page-eyebrow">{metric.label}</div>
      {loading && <div className="muted">Loading...</div>}
      {!loading && err && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</div>}
      {!loading && !err && latestValue == null && <div className="muted">Metrics not available on this plan</div>}
      {!loading && !err && latestValue != null && (
        <>
          <div className="hosting-metric-value">{latestValue}<span>{metric.unit}</span></div>
          <div className="hosting-sparkline">
            {points.slice(-20).map((point, index) => (
              <i key={index} style={{ height: Math.max(2, (Number(point.value || 0) / max) * 32) }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function MetricsSection({ deploymentId }) {
  return (
    <div>
      <div className="hosting-metrics-grid">
        {METRICS.map((metric) => <MetricCard key={metric.type} deploymentId={deploymentId} metric={metric} />)}
      </div>
      <div className="card hosting-muted-card">Metrics show the last 1 hour. Free tier services may not have metrics available.</div>
    </div>
  );
}
