// AdminActivitySection.jsx — read-only activity timeline
import React, { useMemo } from 'react';
import { ICN } from '../../../icons';
import { when } from '../adminStatus.jsx';
import { buildUsersById } from '../adminUtils.js';

function buildTimeline(users, deployments, orders, receipts) {
  const usersById = buildUsersById(users);
  const events = [];

  for (const u of users) {
    if (u.createdAt) events.push({ date: new Date(u.createdAt), type: 'user_created', icon: 'Users', label: 'User registered', desc: u.email, id: `uc-${u.id}` });
    if (u.accountStatus === 'suspended' && u.updatedAt) events.push({ date: new Date(u.updatedAt), type: 'user_suspended', icon: 'AlertCircle', label: 'User suspended', desc: u.email, id: `us-${u.id}` });
    if (u.accountStatus === 'deleted' && u.updatedAt) events.push({ date: new Date(u.updatedAt), type: 'user_deleted', icon: 'Trash2', label: 'User deleted', desc: u.email, id: `ud-${u.id}` });
  }

  for (const d of deployments) {
    const email = usersById[d.userId]?.email || d.userId;
    if (d.createdAt) events.push({ date: new Date(d.createdAt), type: 'dep_created', icon: 'Server', label: 'Deployment created', desc: `${d.serviceName || d.deploymentId?.slice(0, 12)} · ${email}`, id: `dc-${d.deploymentId}` });
    if (d.status === 'suspended' && d.updatedAt) events.push({ date: new Date(d.updatedAt), type: 'dep_suspended', icon: 'AlertTriangle', label: 'Deployment suspended', desc: `${d.serviceName || d.deploymentId?.slice(0, 12)}`, id: `ds-${d.deploymentId}` });
  }

  for (const o of orders) {
    const email = usersById[o.userId]?.email || o.userId;
    if (o.createdAt) events.push({ date: new Date(o.createdAt), type: 'order_created', icon: 'CreditCard', label: 'Order created', desc: `${o.id.slice(0, 8)} · ${email}`, id: `oc-${o.id}` });
    if (o.paidAt) events.push({ date: new Date(o.paidAt), type: 'order_paid', icon: 'Check', label: 'Order paid', desc: `${o.id.slice(0, 8)} · ${o.currency} ${((o.totalAmountCents || 0) / 100).toFixed(2)}`, id: `op-${o.id}` });
  }

  for (const r of receipts) {
    if (r.createdAt) events.push({ date: new Date(r.createdAt), type: 'receipt_uploaded', icon: 'Upload', label: 'Receipt uploaded', desc: r.fileName || r.id.slice(0, 8), id: `ru-${r.id}` });
    if (r.status === 'approved' && r.updatedAt) events.push({ date: new Date(r.updatedAt), type: 'receipt_approved', icon: 'CheckCircle', label: 'Receipt approved', desc: r.fileName || r.id.slice(0, 8), id: `ra-${r.id}` });
    if (r.status === 'rejected' && r.updatedAt) events.push({ date: new Date(r.updatedAt), type: 'receipt_rejected', icon: 'X', label: 'Receipt rejected', desc: r.fileName || r.id.slice(0, 8), id: `rr-${r.id}` });
  }

  return events
    .filter((e) => e.date && !isNaN(e.date))
    .sort((a, b) => b.date - a.date)
    .slice(0, 200);
}

const ICON_MAP = {
  Users: ICN.Users,
  AlertCircle: ICN.AlertCircle,
  Trash2: ICN.Trash2,
  Server: ICN.Server,
  AlertTriangle: ICN.Activity,
  CreditCard: ICN.CreditCard,
  Check: ICN.Check,
  CheckCircle: ICN.CheckCircle,
  X: ICN.X,
  Upload: ICN.Activity,
};

const TYPE_COLORS = {
  user_created:     'var(--accent)',
  order_paid:       'var(--accent)',
  receipt_approved: 'var(--accent)',
  user_suspended:   'var(--warning)',
  dep_suspended:    'var(--warning)',
  receipt_uploaded: '#1d7ec8',
  order_created:    '#1d7ec8',
  dep_created:      '#1d7ec8',
  receipt_rejected: 'var(--danger)',
  user_deleted:     'var(--danger)',
};

export function AdminActivitySection({ users, deployments, orders, receipts }) {
  const timeline = useMemo(
    () => buildTimeline(users, deployments, orders, receipts),
    [users, deployments, orders, receipts],
  );

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Activity timeline</h2>
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
          Last {timeline.length} events across users, deployments, orders and receipts.
        </p>
      </div>
      <div style={{ maxHeight: 600, overflowY: 'auto', padding: '12px 0' }}>
        {timeline.length === 0 && (
          <div className="muted" style={{ padding: '20px 20px' }}>No activity yet.</div>
        )}
        {timeline.map((evt) => {
          const IconComp = ICON_MAP[evt.icon] || ICN.Activity;
          const color = TYPE_COLORS[evt.type] || 'var(--text-muted)';
          return (
            <div
              key={evt.id}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '8px 20px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--bg-deep)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, color,
              }}>
                <IconComp size={13} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color }}>{evt.label}</div>
                <div className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{evt.desc}</div>
              </div>
              <div className="muted" style={{ fontSize: 11, flexShrink: 0, whiteSpace: 'nowrap' }}>{when(evt.date)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
