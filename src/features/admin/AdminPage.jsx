// AdminPage.jsx — simple admin surface for deploy-first K100 billing.
import React from 'react';
import { ICN } from '../../icons';
import {
  getAdminOverview,
  listAdminUsers,
  listAdminDeployments,
  listAdminOrders,
  listAdminReceipts,
  approveReceipt,
  rejectReceipt,
  markDeploymentPaid,
  deleteDeployment,
  suspendDeployment,
  reactivateDeployment,
  approveDeploymentBilling,
  renewDeploymentManually,
  setDeploymentRenderPlan,
  getAdminUser,
  suspendUser,
  disableUser,
  reactivateUser,
  deleteUser,
  viewReceipt,
  downloadReceipt,
  getUserIdPhotoUrl,
} from '../../api/admin.js';

const { useState, useEffect, useCallback } = React;

const TABS = [
  { key: 'overview',    label: 'Overview' },
  { key: 'receipts',    label: 'Receipts' },
  { key: 'deployments', label: 'Deployments' },
  { key: 'orders',      label: 'Orders' },
  { key: 'users',       label: 'Users' },
];

function money(cents = 0, currency = 'PGK') {
  return `${currency} ${((cents || 0) / 100).toFixed(2)}`;
}
function when(value) {
  return value ? new Date(value).toLocaleString() : '—';
}
function StatusPill({ value }) {
  const v = String(value || '').toLowerCase();
  const tone = ['paid', 'approved', 'live', 'active'].includes(v) ? 'success'
    : ['pending', 'payment_uploaded', 'building'].includes(v) ? 'warn'
    : ['expired', 'rejected', 'payment_expired', 'deleted', 'overdue_suspended', 'suspended', 'disabled'].includes(v) ? 'danger'
    : 'info';
  const colors = {
    success: ['var(--accent-soft)', 'var(--accent)'],
    warn: ['#fdf0d5', '#b8860b'],
    danger: ['#fde2e1', '#c0392b'],
    info: ['var(--bg-deep)', 'var(--text-muted)'],
  }[tone];
  return <span style={{ background: colors[0], color: colors[1], padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>{value || '—'}</span>;
}

export function AdminPage() {
  const [tab, setTab] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [deployments, setDeployments] = useState([]);
  const [orders, setOrders] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState('');
  const [detailUserId, setDetailUserId] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [ov, us, dep, ord, rec] = await Promise.all([
        getAdminOverview(), listAdminUsers(), listAdminDeployments(), listAdminOrders(), listAdminReceipts(),
      ]);
      setOverview(ov); setUsers(us || []); setDeployments(dep || []); setOrders(ord || []); setReceipts(rec || []);
    } catch (err) {
      setError(err.message || 'Failed to load admin data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Map userId → email so the deployments table can show the owner.
  const userEmailById = React.useMemo(
    () => Object.fromEntries((users || []).map((u) => [u.id, u.email])),
    [users],
  );

  const act = async (id, fn, label) => {
    setBusyId(id); setNotice('');
    try {
      await fn();
      setNotice(`${label} done.`);
      await refresh();
    } catch (err) {
      setError(err.message || `${label} failed.`);
    } finally {
      setBusyId(null);
    }
  };

  // File actions don't refresh the tables; they just surface errors.
  const fileAct = async (id, fn, label) => {
    setBusyId(id); setError(null);
    try { await fn(); } catch (err) { setError(err.message || `${label} failed.`); } finally { setBusyId(null); }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Administration</div>
          <h1>Admin — billing &amp; deployments</h1>
          <p className="sub">Review users, deployments, deployment orders and bank receipts. Approve payments or remove unpaid deployments.</p>
        </div>
        <div className="actions">
          <button className="btn btn-outline" onClick={refresh} disabled={loading}>
            <ICN.RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="card" style={{ padding: '10px 14px', marginBottom: 12, color: 'var(--danger)' }}>{error}</div>}
      {notice && <div className="card" style={{ padding: '10px 14px', marginBottom: 12, color: 'var(--accent)' }}>{notice}</div>}

      <div className="tabs" style={{ marginBottom: 14 }}>
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
            {t.label}
            {t.key === 'receipts' && overview?.receipts?.pending ? ` (${overview.receipts.pending})` : ''}
          </button>
        ))}
      </div>

      {loading && <div className="card" style={{ padding: 20 }}>Loading…</div>}

      {!loading && tab === 'overview' && overview && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
          <StatCard label="Users" value={overview.users} />
          <StatCard label="Deployments" value={overview.deployments?.total} />
          <StatCard label="Pending receipts" value={overview.receipts?.pending} />
          <StatCard label="Revenue (paid)" value={overview.revenue?.paidDisplay} />
          <StatCard label="Orders" value={overview.orders?.total} />
          <StatCard label="Cleanup jobs" value={overview.cleanupJobs} />
          <StatCard label="Est. provider cost" value={overview.providerCost?.display} />
          <StatCard label="Promo slots used" value={`${overview.promo?.used ?? 0} / ${overview.promo?.limit ?? 20}`} />
          <StatCard label="Promo slots remaining" value={overview.promo?.remaining ?? 0} />
          <StatCard label="Paid promo (K50)" value={overview.promo?.paidPromo ?? 0} />
          <StatCard label="Paid standard (K200)" value={overview.promo?.paidStandard ?? 0} />
          <div className="card" style={{ gridColumn: '1 / -1', padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>Deployment orders by status</h3>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
              <span><b>Paid:</b> {overview.orders?.paid ?? 0}</span>
              <span><b>Pending:</b> {overview.orders?.pending ?? 0}</span>
              <span><b>Payment uploaded:</b> {overview.orders?.payment_uploaded ?? 0}</span>
              <span><b>Expired:</b> {overview.orders?.expired ?? 0}</span>
            </div>
            <h3 style={{ margin: '0 0 6px' }}>Margin (separate currencies — not netted)</h3>
            <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
              Revenue {overview.revenue?.paidDisplay} · Est. hosting cost {overview.providerCost?.display}. {overview.platformMargin?.note}
            </div>
            <h3 style={{ margin: '0 0 6px' }}>Deployments by payment status</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(overview.deployments?.byPaymentStatus || {}).map(([k, v]) => (
                <span key={k} className="row" style={{ gap: 6 }}><StatusPill value={k} /> × {v}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {!loading && tab === 'receipts' && (
        <Table cols={['Created', 'User', 'Order', 'Amount', 'File', 'Type', 'Status', 'Actions']}>
          {receipts.map((r) => (
            <tr key={r.id}>
              <td>{when(r.createdAt)}</td>
              <td className="mono">{r.userId || '—'}</td>
              <td className="mono">{r.checkoutOrderId?.slice(0, 8)}</td>
              <td>{money(r.amountCents, r.currency)}</td>
              <td className="mono" title={r.fileName}>{r.fileName?.slice(0, 22)}</td>
              <td className="mono" style={{ fontSize: 11 }}>{r.fileType || '—'}</td>
              <td><StatusPill value={r.status} /></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn btn-sm btn-outline" disabled={busyId === r.id}
                  onClick={() => fileAct(r.id, () => viewReceipt(r.id), 'View receipt')}>View</button>{' '}
                <button className="btn btn-sm btn-outline" disabled={busyId === r.id}
                  onClick={() => fileAct(r.id, () => downloadReceipt(r.id, r.fileName), 'Download receipt')}>Download</button>{' '}
                {r.status === 'pending' && (
                  <>
                    <button className="btn btn-sm btn-primary" disabled={busyId === r.id}
                      onClick={() => act(r.id, () => approveReceipt(r.id), 'Approve receipt')}>Approve</button>{' '}
                    <button className="btn btn-sm btn-outline" disabled={busyId === r.id}
                      onClick={() => act(r.id, () => rejectReceipt(r.id, 'Rejected by admin'), 'Reject receipt')}>Reject</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      {!loading && tab === 'deployments' && (
        <Table cols={['Created', 'Service', 'Owner', 'Tier', 'Plan', 'Status', 'Payment', 'Subscription', 'Due', 'Actions']}>
          {deployments.map((d) => (
            <tr key={d.deploymentId}>
              <td>{when(d.createdAt)}</td>
              <td>{d.serviceName || '—'}<div className="mono muted" style={{ fontSize: 11 }}>{d.deploymentId?.slice(0, 12)}</div></td>
              <td style={{ fontSize: 12 }}>{userEmailById[d.userId] || <span className="mono muted">{d.userId?.slice(0, 8) || '—'}</span>}</td>
              <td style={{ fontSize: 12 }}>
                {d.billingTierId === 'promo_50' ? 'K50 promo' : d.billingTierId === 'standard_200' ? 'K200' : (d.priceCents != null ? money(d.priceCents, d.priceCurrency) : '—')}
              </td>
              <td style={{ fontSize: 12 }}>
                <div><b>{d.renderPlan || '—'}</b>{d.renderPlanTargetAfterPayment ? <span className="muted"> → {d.renderPlanTargetAfterPayment}</span> : ''}</div>
                {d.renderPlanUpgradeStatus && <StatusPill value={d.renderPlanUpgradeStatus === 'failed' ? 'failed' : d.renderPlanUpgradeStatus} />}
              </td>
              <td><StatusPill value={d.status} /></td>
              <td><StatusPill value={d.paymentStatus} /></td>
              <td style={{ fontSize: 12 }}>
                <div><StatusPill value={d.subscriptionStatus || 'trialing'} /></div>
                <div className="muted">Start: {when(d.currentPeriodStart)}</div>
                <div className="muted">End: {when(d.currentPeriodEnd)}</div>
                <div className="muted">Next: {when(d.nextBillingAt)}</div>
                <div className="muted">Reminder: {when(d.renewalReminderAt)}</div>
                <div className="muted">Last paid: {when(d.lastPaidAt)} ? renewals {d.renewalCount ?? 0}</div>
              </td>
              <td style={{ fontSize: 12 }}>{when(d.billingDueAt)}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {d.liveUrl && (
                  <><a className="btn btn-sm btn-outline" href={d.liveUrl} target="_blank" rel="noopener noreferrer">Open</a>{' '}</>
                )}
                {d.paymentStatus !== 'paid' && (
                  <><button className="btn btn-sm btn-primary" disabled={busyId === d.deploymentId}
                    onClick={() => act(d.deploymentId, () => approveDeploymentBilling(d.deploymentId), 'Approve billing')}>Approve billing</button>{' '}</>
                )}
                <button className="btn btn-sm btn-primary" disabled={busyId === d.deploymentId}
                  onClick={() => act(d.deploymentId, () => renewDeploymentManually(d.deploymentId), 'Manual renewal')}>Renew manually</button>{' '}
                {d.status === 'suspended' ? (
                  <button className="btn btn-sm btn-outline" disabled={busyId === d.deploymentId}
                    onClick={() => act(d.deploymentId, () => reactivateDeployment(d.deploymentId), 'Reactivate deployment')}>Reactivate</button>
                ) : (
                  <button className="btn btn-sm btn-outline" disabled={busyId === d.deploymentId}
                    onClick={() => act(d.deploymentId, () => suspendDeployment(d.deploymentId, 'admin_suspended'), 'Suspend deployment')}>Suspend</button>
                )}{' '}
                <button className="btn btn-sm btn-outline" disabled={busyId === d.deploymentId}
                  onClick={() => act(d.deploymentId, () => deleteDeployment(d.deploymentId), 'Delete deployment')}>Delete</button>
                <div style={{ marginTop: 6 }}>
                  <span className="muted" style={{ fontSize: 11, marginRight: 4 }}>Hosting plan:</span>
                  {['free', 'starter', 'standard'].map((p) => (
                    <button key={p} className="btn btn-sm btn-outline" disabled={busyId === d.deploymentId || d.renderPlan === p}
                      onClick={() => act(d.deploymentId, () => setDeploymentRenderPlan(d.deploymentId, p, false), `Set plan ${p}`)}>{p}</button>
                  ))}{' '}
                  <button className="btn btn-sm btn-outline" disabled={busyId === d.deploymentId}
                    onClick={() => act(d.deploymentId, () => setDeploymentRenderPlan(d.deploymentId, d.renderPlan || 'free', true), 'Redeploy')}>Redeploy</button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {!loading && tab === 'orders' && (
        <Table cols={['Created', 'Order', 'User', 'Deployment', 'Amount', 'Status', 'Paid at']}>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>{when(o.createdAt)}</td>
              <td className="mono">{o.id.slice(0, 8)}</td>
              <td className="mono">{o.userId || '—'}</td>
              <td className="mono">{o.deploymentId?.slice(0, 12) || '—'}</td>
              <td>{money(o.totalAmountCents, o.currency)}</td>
              <td><StatusPill value={o.status} /></td>
              <td style={{ fontSize: 12 }}>{when(o.paidAt)}</td>
            </tr>
          ))}
        </Table>
      )}

      {!loading && tab === 'users' && (
        <Table cols={['Created', 'Email', 'Name', 'Promo', 'Account', 'Role', 'Actions']}>
          {users.map((u) => {
            const inactive = ['suspended', 'disabled', 'deleted'].includes(u.accountStatus);
            return (
            <tr key={u.id}>
              <td>{when(u.createdAt)}</td>
              <td>{u.email}</td>
              <td>{u.name || '—'}</td>
              <td style={{ fontSize: 12 }}><PromoCell user={u} /></td>
              <td><StatusPill value={u.accountStatus || 'active'} /></td>
              <td><StatusPill value={u.role} /></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn btn-sm btn-outline" onClick={() => setDetailUserId(u.id)}>View</button>{' '}
                {inactive ? (
                  // Reactivate = bring the account back; offer to resume its sites too.
                  <button className="btn btn-sm btn-primary" disabled={busyId === u.id}
                    onClick={() => act(u.id, () => reactivateUser(u.id, window.confirm('Also resume this user’s suspended sites?')), 'Reactivate account')}>Reactivate</button>
                ) : (
                  // Suspend = temporary hold (reversible); cascades to the user's sites.
                  <button className="btn btn-sm btn-outline" disabled={busyId === u.id}
                    onClick={() => act(u.id, () => suspendUser(u.id, 'admin_suspended'), 'Suspend account')}>Suspend</button>
                )}{' '}
                {/* Delete = permanent closure; brings down all sites. Distinct from Suspend. */}
                {u.accountStatus !== 'deleted' && (
                  <button className="btn btn-sm btn-outline" style={{ color: 'var(--danger)' }} disabled={busyId === u.id}
                    onClick={() => { if (window.confirm('Delete this account? All the user’s sites are brought down and they can no longer log in. History is preserved.')) act(u.id, () => deleteUser(u.id, 'admin_deleted'), 'Delete account'); }}>Delete Account</button>
                )}
              </td>
            </tr>
          );})}
        </Table>
      )}

      {detailUserId && (
        <UserDetailModal userId={detailUserId} onClose={() => setDetailUserId(null)} />
      )}
    </>
  );
}

function UserDetailModal({ userId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);

  useEffect(() => {
    let revoked = false;
    let currentPhoto = null;
    (async () => {
      try {
        const detail = await getAdminUser(userId);
        setData(detail);
        if (detail?.user?.hasIdPhoto) {
          try { currentPhoto = await getUserIdPhotoUrl(userId); if (!revoked) setPhotoUrl(currentPhoto); } catch { /* photo optional */ }
        }
      } catch (err) {
        setError(err.message || 'Failed to load user.');
      }
    })();
    return () => { revoked = true; if (currentPhoto) URL.revokeObjectURL(currentPhoto); };
  }, [userId]);

  const u = data?.user;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, zIndex: 1000, overflow: 'auto' }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 820, width: '100%', padding: 20 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>User detail</h2>
          <button className="btn btn-sm btn-outline" onClick={onClose}>Close</button>
        </div>

        {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
        {!data && !error && <div>Loading…</div>}

        {u && (
          <>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 14 }}>
              <div style={{ flex: '1 1 320px' }}>
                <div><b>Email:</b> {u.email}</div>
                <div><b>Name:</b> {u.name || '—'}</div>
                <div><b>Phone:</b> {u.phone || '—'}</div>
                <div className="row" style={{ gap: 6 }}><b>Account:</b> <StatusPill value={u.accountStatus} /></div>
                <div className="row" style={{ gap: 6 }}><b>Role:</b> <StatusPill value={u.role} /></div>
                <div><b>Created:</b> {when(u.createdAt)}</div>
                <div><b>Launch promo:</b> {u.promoClaimedAt
                  ? `claimed ${when(u.promoClaimedAt)}`
                  : u.promoEligible ? 'eligible (unused)' : 'not eligible'}{u.promoSignupRank ? ` · signup #${u.promoSignupRank}` : ''}</div>
                {u.promoClaimedDeploymentId && <div className="mono" style={{ fontSize: 12 }}><b>Promo deployment:</b> {u.promoClaimedDeploymentId}</div>}
                {u.disabledReason && <div><b>Disabled reason:</b> {u.disabledReason}</div>}
                <div style={{ marginTop: 8 }}>
                  <b>Profile details:</b>
                  <pre style={{ background: 'var(--bg-deep)', padding: 8, borderRadius: 6, fontSize: 12, overflow: 'auto', maxHeight: 140 }}>
                    {JSON.stringify(u.profileDetails || {}, null, 2)}
                  </pre>
                </div>
              </div>
              <div style={{ flex: '0 0 200px' }}>
                <b>ID photo</b>
                <div style={{ marginTop: 6 }}>
                  {photoUrl
                    ? <img src={photoUrl} alt="ID" style={{ maxWidth: 200, borderRadius: 6, border: '1px solid var(--border)' }} />
                    : <span className="muted">{u.hasIdPhoto ? 'Loading…' : 'None on file'}</span>}
                </div>
              </div>
            </div>

            <div className="row" style={{ gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
              <span><b>Paid:</b> {data.totals?.paid ?? 0}</span>
              <span><b>Pending:</b> {data.totals?.pending ?? 0}</span>
              <span><b>Uploaded:</b> {data.totals?.uploaded ?? 0}</span>
              <span><b>Expired:</b> {data.totals?.expired ?? 0}</span>
            </div>

            <MiniSection title={`Deployments (${data.deployments?.length || 0})`}>
              {(data.deployments || []).map((d) => (
                <div key={d.deploymentId} className="row" style={{ gap: 8, justifyContent: 'space-between', padding: '4px 0' }}>
                  <span className="mono" style={{ fontSize: 12 }}>{d.serviceName || d.deploymentId?.slice(0, 12)}</span>
                  <span className="row" style={{ gap: 6 }}><StatusPill value={d.status} /><StatusPill value={d.paymentStatus} /></span>
                </div>
              ))}
            </MiniSection>

            <MiniSection title={`Orders (${data.orders?.length || 0})`}>
              {(data.orders || []).map((o) => (
                <div key={o.id} className="row" style={{ gap: 8, justifyContent: 'space-between', padding: '4px 0' }}>
                  <span className="mono" style={{ fontSize: 12 }}>{o.id.slice(0, 8)}</span>
                  <span>{money(o.totalAmountCents, o.currency)}</span>
                  <StatusPill value={o.status} />
                </div>
              ))}
            </MiniSection>

            <MiniSection title={`Receipts (${data.receipts?.length || 0})`}>
              {(data.receipts || []).map((r) => (
                <div key={r.id} className="row" style={{ gap: 8, justifyContent: 'space-between', padding: '4px 0' }}>
                  <span className="mono" style={{ fontSize: 12 }} title={r.fileName}>{r.fileName?.slice(0, 24)}</span>
                  <span>{money(r.amountCents, r.currency)}</span>
                  <span className="row" style={{ gap: 6 }}>
                    <StatusPill value={r.status} />
                    <button className="btn btn-sm btn-outline" onClick={() => viewReceipt(r.id)}>View</button>
                  </span>
                </div>
              ))}
            </MiniSection>
          </>
        )}
      </div>
    </div>
  );
}

function MiniSection({ title, children }) {
  const rows = React.Children.toArray(children);
  return (
    <div className="card" style={{ padding: 12, marginBottom: 10 }}>
      <h4 style={{ margin: '0 0 6px' }}>{title}</h4>
      {rows.length ? rows : <span className="muted">None.</span>}
    </div>
  );
}

/** Compact promo summary for the admin users table. */
function PromoCell({ user }) {
  if (user.promoClaimedAt) {
    return <span style={{ color: 'var(--accent)' }} title={`Claimed ${when(user.promoClaimedAt)}${user.promoClaimedDeploymentId ? ` · ${user.promoClaimedDeploymentId}` : ''}`}>
      <ICN.Tag size={11} /> claimed{user.promoSignupRank ? ` · #${user.promoSignupRank}` : ''}
    </span>;
  }
  if (user.promoEligible) {
    return <span className="muted">eligible{user.promoSignupRank ? ` · #${user.promoSignupRank}` : ''}</span>;
  }
  return <span className="muted">—{user.promoSignupRank ? ` · #${user.promoSignupRank}` : ''}</span>;
}

function StatCard({ label, value }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="page-eyebrow" style={{ marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'var(--serif)', fontSize: 30, lineHeight: 1 }}>{value ?? 0}</div>
    </div>
  );
}

function Table({ cols, children }) {
  const rows = React.Children.toArray(children);
  return (
    <div className="card card-flush">
      <table className="tbl">
        <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {rows.length ? rows : <tr><td colSpan={cols.length} style={{ padding: 18 }} className="muted">No records.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default AdminPage;
