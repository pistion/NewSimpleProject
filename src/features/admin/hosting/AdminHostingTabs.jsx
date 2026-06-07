// AdminHostingTabs.jsx — hosting management section with sub-tabs
import React, { useState } from 'react';
import { ICN } from '../../../icons';
import { money, when, StatusPill } from '../adminStatus.jsx';
import { buildHostingRows, filterDeployments } from '../adminUtils.js';
import {
  suspendDeployment,
  reactivateDeployment,
  approveDeploymentBilling,
  renewDeploymentManually,
  setDeploymentRenderPlan,
  deleteDeployment,
} from '../../../api/admin.js';

const HOSTING_TABS = [
  { key: 'all',       label: 'All' },
  { key: 'active',    label: 'Active' },
  { key: 'pending',   label: 'Pending' },
  { key: 'failed',    label: 'Failed' },
  { key: 'suspended', label: 'Suspended' },
  { key: 'free',      label: 'Free' },
  { key: 'paid',      label: 'Paid' },
  { key: 'promo',     label: 'Promo' },
  { key: 'dns',       label: 'DNS Issues' },
];

export function AdminHostingTabs({ deployments, users, orders, busyId, onAct, onRefresh }) {
  const [activeTab, setActiveTab] = useState('all');

  const filtered = filterDeployments(deployments, activeTab);
  const rows = buildHostingRows(users, filtered, orders);

  return (
    <div>
      <div className="admin-inner-tabs">
        {HOSTING_TABS.map((t) => {
          const count = filterDeployments(deployments, t.key).length;
          return (
            <button
              key={t.key}
              className={activeTab === t.key ? 'active' : ''}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
              {t.key !== 'all' && count > 0 && (
                <span style={{
                  marginLeft: 5, background: 'var(--bg-deep)',
                  borderRadius: 999, padding: '0 5px', fontSize: 10, fontWeight: 600,
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <HostingTable rows={rows} busyId={busyId} onAct={onAct} />
    </div>
  );
}

function HostingTable({ rows, busyId, onAct }) {
  return (
    <div className="card card-flush">
      <div className="admin-table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Site Name</th>
              <th>Live URL</th>
              <th>Source</th>
              <th>Status</th>
              <th>Payment</th>
              <th>Subscription</th>
              <th>Tier</th>
              <th>Plan</th>
              <th>Due Date</th>
              <th>Last Paid</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={13} className="muted" style={{ padding: 20 }}>No deployments.</td></tr>
            )}
            {rows.map(({ deployment: d, user, latestOrder, isPromo }) => {
              const id = d.deploymentId;
              return (
                <tr key={id}>
                  <td style={{ fontSize: 12 }}>
                    {user ? (
                      <span title={user.email}>{(user.email || '').slice(0, 22)}</span>
                    ) : (
                      <span className="mono muted">{(d.userId || '').slice(0, 10)}</span>
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    <div>{d.serviceName || '—'}</div>
                    <div className="mono muted" style={{ fontSize: 10 }}>{id?.slice(0, 12)}</div>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {d.liveUrl
                      ? <a href={d.liveUrl} target="_blank" rel="noopener noreferrer" className="row" style={{ gap: 4, color: 'var(--accent)' }}>
                          <ICN.Globe size={11} /> {d.liveUrl.replace(/^https?:\/\//, '').slice(0, 28)}
                        </a>
                      : <span className="muted">—</span>}
                  </td>
                  <td style={{ fontSize: 12 }}>{d.source || '—'}</td>
                  <td><StatusPill value={d.status} /></td>
                  <td><StatusPill value={d.paymentStatus} /></td>
                  <td><StatusPill value={d.subscriptionStatus || 'trialing'} /></td>
                  <td style={{ fontSize: 11 }}>
                    {isPromo ? <StatusPill value="promo" /> : (d.billingTierId || '—')}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    <span>{d.renderPlan || '—'}</span>
                    {d.renderPlanTargetAfterPayment && (
                      <span className="muted"> → {d.renderPlanTargetAfterPayment}</span>
                    )}
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{when(d.billingDueAt)}</td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{when(d.lastPaidAt)}</td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{when(d.createdAt)}</td>
                  <td>
                    <div className="admin-action-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                      <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                        {d.liveUrl && (
                          <a className="btn btn-sm btn-outline" href={d.liveUrl} target="_blank" rel="noopener noreferrer">
                            <ICN.ExternalLink size={11} />
                          </a>
                        )}
                        {d.status === 'suspended' || d.status === 'overdue_suspended' ? (
                          <button className="btn btn-sm btn-primary" disabled={busyId === id}
                            onClick={() => onAct(id, () => reactivateDeployment(id), 'Reactivate')}>
                            Reactivate
                          </button>
                        ) : (
                          <button className="btn btn-sm btn-outline" disabled={busyId === id}
                            onClick={() => onAct(id, () => suspendDeployment(id, 'admin_suspended'), 'Suspend')}>
                            Suspend
                          </button>
                        )}
                        {d.paymentStatus !== 'paid' && (
                          <button className="btn btn-sm btn-primary" disabled={busyId === id}
                            onClick={() => onAct(id, () => approveDeploymentBilling(id), 'Approve billing')}>
                            Approve billing
                          </button>
                        )}
                        <button className="btn btn-sm btn-outline" disabled={busyId === id}
                          onClick={() => onAct(id, () => renewDeploymentManually(id), 'Renew')}>
                          Renew
                        </button>
                        <button
                          className="btn btn-sm btn-outline"
                          style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                          disabled={busyId === id}
                          onClick={() => {
                            if (window.confirm('Delete this deployment permanently?')) {
                              onAct(id, () => deleteDeployment(id), 'Delete deployment');
                            }
                          }}
                        >
                          <ICN.Trash2 size={11} />
                        </button>
                      </div>
                      <div className="row" style={{ gap: 3, flexWrap: 'wrap' }}>
                        <span className="muted" style={{ fontSize: 10, marginRight: 2 }}>Plan:</span>
                        {['free', 'starter', 'standard'].map((p) => (
                          <button
                            key={p}
                            className="btn btn-sm btn-outline"
                            style={{ fontSize: 10, height: 22, padding: '0 6px', fontWeight: d.renderPlan === p ? 700 : 400 }}
                            disabled={busyId === id || d.renderPlan === p}
                            onClick={() => onAct(id, () => setDeploymentRenderPlan(id, p, false), `Set plan ${p}`)}
                          >
                            {p}
                          </button>
                        ))}
                        <button
                          className="btn btn-sm btn-outline"
                          style={{ fontSize: 10, height: 22, padding: '0 6px' }}
                          disabled={busyId === id}
                          onClick={() => onAct(id, () => setDeploymentRenderPlan(id, d.renderPlan || 'free', true), 'Redeploy')}
                        >
                          redeploy
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
