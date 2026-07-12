/**
 * AdminCustomerDetail.jsx — the unified one-customer oversight drawer.
 *
 * Backed by /api/admin/customers/:userId/* — one overview fetch drives all six
 * tabs (Overview, Services, Billing, Support, Operations, Activity); each tab
 * can be refreshed individually from its section endpoint. Section failures
 * surface as warnings instead of blanking the page.
 */
import React, { useEffect, useState } from 'react';
import { ICN } from '../../../icons';
import { money, when, StatusPill } from '../adminStatus.jsx';
import {
  getCustomerOverview, getCustomerServices, getCustomerBilling,
  getCustomerSupport, getCustomerOperations, getCustomerActivity,
} from '../../../api/adminCustomers.js';

const TABS = ['Overview', 'Services', 'Billing', 'Support', 'Operations', 'Activity'];

function SummaryCard({ label, value, tone }) {
  return (
    <div className="admin-summary-card" data-tone={tone || 'default'}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function groupedMoney(amounts = []) {
  if (!amounts.length) return 'None';
  return amounts.map((row) => money(row.amountCents, row.currency)).join(' / ');
}

function Section({ title, count, children }) {
  const items = React.Children.toArray(children);
  return (
    <div className="card" style={{ padding: 12, marginBottom: 10 }}>
      <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>
        {title}{count != null ? ` (${count})` : ''}
      </h4>
      {items.length ? items : <span className="muted" style={{ fontSize: 12 }}>None.</span>}
    </div>
  );
}

function Row({ left, mid, right }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
      <span style={{ fontSize: 12, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{left}</span>
      {mid != null && <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{mid}</span>}
      <span className="row" style={{ gap: 4, flexShrink: 0 }}>{right}</span>
    </div>
  );
}

export function AdminCustomerDetail({ userId, onClose, onLifecycleAction, busy }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('Overview');
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      setError(null);
      setData(await getCustomerOverview(userId));
    } catch (err) {
      setError(err.message || 'Failed to load customer.');
    }
  };

  useEffect(() => {
    if (!userId) return;
    setData(null); setTab('Overview');
    load();
  }, [userId]);

  // Per-tab refresh against the dedicated section endpoint.
  const refreshTab = async () => {
    if (!data) return;
    setRefreshing(true);
    try {
      if (tab === 'Services') {
        const s = await getCustomerServices(userId);
        setData((d) => ({ ...d, services: s.services, warnings: s.warnings }));
      } else if (tab === 'Billing') {
        setData((d) => ({ ...d, billing: null }));
        const billing = await getCustomerBilling(userId);
        setData((d) => ({ ...d, billing }));
      } else if (tab === 'Support') {
        const support = await getCustomerSupport(userId);
        setData((d) => ({ ...d, support }));
      } else if (tab === 'Operations') {
        const operations = await getCustomerOperations(userId);
        setData((d) => ({ ...d, operations }));
      } else if (tab === 'Activity') {
        const a = await getCustomerActivity(userId, { limit: 100 });
        setData((d) => ({ ...d, activity: a.audit?.items ?? [], adminCommands: a.adminCommands ?? [] }));
      } else {
        await load();
      }
    } catch (err) {
      setError(err.message || 'Refresh failed.');
    } finally {
      setRefreshing(false);
    }
  };

  if (!userId) return null;

  const c = data?.customer;
  const s = data?.summary;

  return (
    <>
      <div className="admin-drawer-backdrop" onClick={onClose} />
      <div className="admin-drawer admin-drawer--wide">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '20px 20px 12px' }}>
          <h2 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ICN.Users size={18} /> Customer detail
          </h2>
          <button className="btn btn-sm btn-outline" onClick={onClose}><ICN.X size={14} /> Close</button>
        </div>

        <div style={{ padding: '0 20px 20px', overflowY: 'auto', flex: 1 }}>
          {error && <div style={{ color: 'var(--danger)', marginBottom: 12, fontSize: 13 }}>{error}</div>}
          {!data && !error && <div className="muted">Loading…</div>}

          {c && (
            <>
              {/* Header */}
              <div className="card" style={{ padding: 14, marginBottom: 12 }}>
                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name || c.email}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {c.email}{c.phone ? ` · ${c.phone}` : ''}
                    </div>
                    <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      {c.clientId && <span className="mono" style={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px' }}>{c.clientId}</span>}
                      <StatusPill value={c.accountStatus || 'active'} />
                      <StatusPill value={c.role} />
                      <span className="muted" style={{ fontSize: 11 }}>plan: {c.planId}</span>
                      <span className="muted" style={{ fontSize: 11 }}>joined {when(c.createdAt)}</span>
                      <span className="muted" style={{ fontSize: 11 }}>{c.hasIdPhoto ? 'ID on file' : 'no ID photo'}</span>
                    </div>
                    {c.disabledReason && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>Disabled: {c.disabledReason}</div>}
                  </div>
                  {onLifecycleAction && (
                    <div className="admin-action-row" style={{ alignItems: 'flex-start' }}>
                      {['suspended', 'disabled', 'deleted'].includes(c.accountStatus) ? (
                        <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => onLifecycleAction('reactivate')}>Reactivate</button>
                      ) : (
                        <button className="btn btn-sm btn-outline" disabled={busy} onClick={() => onLifecycleAction('suspend')}>Suspend</button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Summary cards */}
              {s && (
                <div className="admin-summary-grid">
                  <SummaryCard label="Services" value={`${s.activeServices}/${s.services} active`} />
                  <SummaryCard label="Outstanding" value={groupedMoney(s.outstandingByCurrency)} tone={(s.outstandingByCurrency ?? []).length > 0 ? 'warn' : 'default'} />
                  <SummaryCard label="Open tickets" value={s.openTickets} tone={s.urgentTickets > 0 ? 'danger' : 'default'} />
                  <SummaryCard label="Pending receipts" value={s.pendingReceipts} />
                  <SummaryCard label="Failed services" value={s.failedServices} tone={s.failedServices > 0 ? 'danger' : 'default'} />
                  <SummaryCard label="Warnings" value={s.warnings} tone={s.warnings > 0 ? 'warn' : 'default'} />
                </div>
              )}

              {/* Tabs */}
              <div className="row" style={{ gap: 4, margin: '12px 0', flexWrap: 'wrap' }}>
                {TABS.map((t) => (
                  <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(t)}>{t}</button>
                ))}
                <button className="btn btn-sm btn-icon btn-ghost" style={{ marginLeft: 'auto' }} onClick={refreshTab} disabled={refreshing} title="Refresh tab">
                  <ICN.RefreshCw size={13} />
                </button>
              </div>

              {tab === 'Overview' && (
                <>
                  {(data.warnings ?? []).length > 0 && (
                    <Section title="Warnings" count={data.warnings.length}>
                      {data.warnings.map((w, i) => (
                        <Row key={i} left={<span style={{ color: 'var(--warning, #d97706)' }}>{w.message}</span>} right={<span className="muted" style={{ fontSize: 11 }}>{w.section}</span>} />
                      ))}
                    </Section>
                  )}
                  <Section title="Projects" count={data.projects?.length ?? 0}>
                    {(data.projects ?? []).map((p) => (
                      <Row key={p.id} left={<><b>{p.name}</b> <span className="muted mono" style={{ fontSize: 11 }}>{p.projectCode}</span></>}
                           mid={p.serviceType} right={<StatusPill value={p.status} />} />
                    ))}
                  </Section>
                  <Section title="Recent services" count={data.services?.length ?? 0}>
                    {(data.services ?? []).slice(0, 6).map((sv) => (
                      <Row key={`${sv.serviceType}:${sv.id}`} left={<b>{sv.serviceName}</b>} mid={sv.serviceType} right={<StatusPill value={sv.status} />} />
                    ))}
                  </Section>
                </>
              )}

              {tab === 'Services' && (
                <div className="card card-flush admin-ticket-panel">
                  <div className="admin-table-wrap">
                    <table className="tbl">
                      <thead>
                        <tr><th>Service</th><th>Type</th><th>Status</th><th>Access</th><th>Billing</th><th>Provider</th><th>Plan</th><th>Updated</th></tr>
                      </thead>
                      <tbody>
                        {(data.services ?? []).length === 0 && <tr><td colSpan={8} className="muted" style={{ padding: 16 }}>No services.</td></tr>}
                        {(data.services ?? []).map((sv) => (
                          <tr key={`${sv.serviceType}:${sv.id}`}>
                            <td style={{ fontSize: 12 }}><b>{sv.serviceName}</b><div className="mono muted" style={{ fontSize: 10 }}>{sv.id.slice(0, 12)}</div></td>
                            <td style={{ fontSize: 12 }}>{sv.serviceType}</td>
                            <td><StatusPill value={sv.status} /></td>
                            <td>{sv.accessStatus ? <StatusPill value={sv.accessStatus} /> : <span className="muted" style={{ fontSize: 11 }}>none</span>}</td>
                            <td>{sv.billingStatus ? <StatusPill value={sv.billingStatus} /> : '—'}</td>
                            <td style={{ fontSize: 12 }}>{sv.provider || '—'}</td>
                            <td style={{ fontSize: 12 }} className="mono">{sv.plan || '—'}</td>
                            <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{when(sv.updatedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {tab === 'Billing' && data.billing && (
                <>
                  <Section title="Orders" count={data.billing.orders?.length ?? 0}>
                    {(data.billing.orders ?? []).map((o) => (
                      <Row key={o.id} left={<span className="mono">{o.id.slice(0, 8)} · {o.type}</span>} mid={money(o.totalAmountCents, o.currency)} right={<StatusPill value={o.status} />} />
                    ))}
                  </Section>
                  <Section title="Receipts" count={data.billing.receipts?.length ?? 0}>
                    {(data.billing.receipts ?? []).map((r) => (
                      <Row key={r.id} left={<span title={r.fileName}>{(r.fileName || r.id).slice(0, 26)}</span>} mid={money(r.amountCents, r.currency)} right={<StatusPill value={r.status} />} />
                    ))}
                  </Section>
                  <Section title="Subscriptions" count={data.billing.subscriptions?.length ?? 0}>
                    {(data.billing.subscriptions ?? []).map((sub) => (
                      <Row key={sub.id} left={<span className="mono">{sub.deploymentId?.slice(0, 14)}</span>} mid={sub.nextBillingAt ? `next ${when(sub.nextBillingAt)}` : '—'} right={<StatusPill value={sub.status} />} />
                    ))}
                  </Section>
                  <Section title="Invoices" count={data.billing.invoices?.length ?? 0}>
                    {(data.billing.invoices ?? []).map((inv) => (
                      <Row key={inv.id} left={<span className="mono">{inv.invoiceNumber}</span>} mid={money(inv.totalCents, inv.currency)} right={<StatusPill value={inv.status} />} />
                    ))}
                  </Section>
                  <Section title="Credit notes" count={data.billing.creditNotes?.length ?? 0}>
                    {(data.billing.creditNotes ?? []).map((cn) => (
                      <Row key={cn.id} left={<span className="mono">{cn.id.slice(0, 8)}</span>} mid={money(cn.amountCents ?? cn.totalCents ?? 0, cn.currency)} right={<StatusPill value={cn.status || 'issued'} />} />
                    ))}
                  </Section>
                  <Section title="Payment methods" count={data.billing.paymentMethods?.length ?? 0}>
                    {(data.billing.paymentMethods ?? []).map((pm) => (
                      <Row key={pm.id} left={`${pm.provider} · ${pm.methodType}${pm.last4 ? ` •••• ${pm.last4}` : ''}`} right={<StatusPill value={pm.status} />} />
                    ))}
                  </Section>
                </>
              )}
              {tab === 'Billing' && !data.billing && <div className="muted">Loading…</div>}

              {tab === 'Support' && (
                <>
                  <Section title="Tickets" count={data.support?.tickets?.length ?? 0}>
                    {(data.support?.tickets ?? []).map((t) => (
                      <Row key={t.id}
                           left={<><b>{t.subject}</b> <span className="muted" style={{ fontSize: 11 }}>{t.category}/{t.priority}</span></>}
                           mid={t.unreadForAdmin > 0 ? <span className="support-unread-badge">{t.unreadForAdmin}</span> : null}
                           right={<StatusPill value={t.status} />} />
                    ))}
                  </Section>
                  <Section title="Service requests" count={data.support?.serviceRequests?.length ?? 0}>
                    {(data.support?.serviceRequests ?? []).map((r) => (
                      <Row key={r.id} left={<><b>{r.subject}</b> <span className="muted mono" style={{ fontSize: 11 }}>{r.requestNumber}</span></>} mid={r.requestType} right={<StatusPill value={r.status} />} />
                    ))}
                  </Section>
                </>
              )}

              {tab === 'Operations' && (
                <>
                  <Section title="Provider resources" count={data.operations?.providerResources?.length ?? 0}>
                    {(data.operations?.providerResources ?? []).map((r) => (
                      <Row key={r.id} left={<span className="mono">{r.resourceType} · {(r.name || r.providerResourceId).slice(0, 28)}</span>} mid={r.provider} right={<StatusPill value={r.status} />} />
                    ))}
                  </Section>
                  <Section title="Health checks" count={data.operations?.healthChecks?.length ?? 0}>
                    {(data.operations?.healthChecks ?? []).map((h) => (
                      <Row key={h.id} left={`${h.serviceType} · ${h.checkType}`} mid={h.latencyMs != null ? `${h.latencyMs}ms` : null} right={<StatusPill value={h.status} />} />
                    ))}
                  </Section>
                  <Section title="Incidents" count={data.operations?.incidents?.length ?? 0}>
                    {(data.operations?.incidents ?? []).map((i) => (
                      <Row key={i.id} left={<b>{i.title}</b>} mid={i.severity} right={<StatusPill value={i.status} />} />
                    ))}
                  </Section>
                  <Section title="Watchdog events" count={data.operations?.watchdogEvents?.length ?? 0}>
                    {(data.operations?.watchdogEvents ?? []).map((w) => (
                      <Row key={w.id} left={w.message?.slice(0, 60)} mid={w.severity} right={<StatusPill value={w.status} />} />
                    ))}
                  </Section>
                  <Section title="Notifications" count={data.operations?.notifications?.length ?? 0}>
                    {(data.operations?.notifications ?? []).slice(0, 15).map((n) => (
                      <Row key={n.id} left={<><b>{n.title}</b> <span className="muted" style={{ fontSize: 11 }}>{n.message?.slice(0, 40)}</span></>}
                           right={<span className="muted" style={{ fontSize: 11 }}>{when(n.createdAt)}</span>} />
                    ))}
                  </Section>
                </>
              )}

              {tab === 'Activity' && (
                <>
                  <Section title="Audit history" count={data.activity?.length ?? 0}>
                    {(data.activity ?? []).map((a) => (
                      <Row key={a.id} left={<span className="mono" style={{ fontSize: 11 }}>{a.action}</span>}
                           mid={a.entityType ? `${a.entityType}` : null}
                           right={<><StatusPill value={a.status} /><span className="muted" style={{ fontSize: 10 }}>{when(a.createdAt)}</span></>} />
                    ))}
                  </Section>
                  <Section title="Admin commands" count={data.adminCommands?.length ?? 0}>
                    {(data.adminCommands ?? []).map((cmd) => (
                      <Row key={cmd.id} left={<span className="mono" style={{ fontSize: 11 }}>{cmd.commandType}</span>}
                           right={<span className="muted" style={{ fontSize: 10 }}>{when(cmd.createdAt)}</span>} />
                    ))}
                  </Section>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
