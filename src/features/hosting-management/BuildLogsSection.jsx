import React, { useEffect, useRef, useState } from 'react';
import { Badge } from '../../components';
import { getDeploymentLogStreamUrl } from '../../api';
import { formatTime } from './shared';

export default function BuildLogsSection({ deploymentId, compact = false }) {
  const [lines, setLines] = useState([]);
  const [streamStatus, setStreamStatus] = useState(null);
  const [connState, setConnState] = useState('connecting');
  const bottomRef = useRef(null);
  const seenIds = useRef(new Set());

  useEffect(() => {
    setLines([]);
    seenIds.current = new Set();
    setConnState('connecting');
    const es = new EventSource(getDeploymentLogStreamUrl(deploymentId));
    es.addEventListener('open', () => setConnState('live'));
    es.addEventListener('log', (event) => {
      try {
        const log = JSON.parse(event.data);
        const key = log.id || `${log.source}:${log.timestamp}:${log.message}`;
        if (seenIds.current.has(key)) return;
        seenIds.current.add(key);
        setLines((prev) => [...prev, log]);
      } catch {}
    });
    es.addEventListener('status', (event) => {
      try { setStreamStatus(JSON.parse(event.data)); } catch {}
    });
    es.addEventListener('done', () => { setConnState('ended'); es.close(); });
    es.addEventListener('error', () => { setConnState('error'); es.close(); });
    return () => es.close();
  }, [deploymentId]);

  useEffect(() => {
    if (!compact) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines.length, compact]);

  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: compact ? 14 : 18 }}>{compact ? 'Live logs' : 'Build Logs'}</h2>
        <Badge tone={connState === 'live' ? 'success' : connState === 'error' ? 'danger' : 'muted'} dot={connState === 'live'}>{connState}</Badge>
      </div>
      {streamStatus && (
        <div className="hosting-chip-row">
          <Badge tone={streamStatus.status === 'live' ? 'success' : streamStatus.status === 'failed' ? 'danger' : 'muted'} dot={false}>
            {streamStatus.currentStep || streamStatus.status || 'Preparing'}
          </Badge>
        </div>
      )}
      <div className="term hosting-log-panel" style={{ maxHeight: compact ? 220 : 520 }}>
        {lines.length === 0 && <div><span className="dim">No log lines yet.</span></div>}
        {lines.map((log, index) => (
          <div key={log.id || index} className="hosting-log-line">
            <span className="ts">{formatTime(log.timestamp || log.createdAt)}</span>
            <span className="dim">[{log.source === 'render' ? 'render' : 'sys'}]</span>
            <span className={log.level === 'error' ? 'err' : log.level === 'warn' ? 'warn' : log.source === 'render' ? '' : 'dim'}>
              {log.message || log.msg}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
