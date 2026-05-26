import React, { useEffect, useRef, useState } from 'react';
import { ICN } from './icons';
import { Badge, Empty, StatusBadge, Tabs } from './components';
import {
  captureVpsPayPalOrder,
  createVpsPayPalOrder,
  destroyVpsService,
  getVpsService,
  getVpsQuote,
  getVultrSettings,
  haltVpsService,
  listVpsServices,
  listVultrOperatingSystems,
  listVultrPlans,
  listVultrRegions,
  rebootVpsService,
  startVpsService,
} from './api/vultr.js';

// ─── VPS List ─────────────────────────────────────────────────────────────────

export function VpsHostingList({ navigate }) {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [configured, setConfigured] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([listVpsServices(), getVultrSettings()])
      .then(([list, settings]) => {
        if (!alive) return;
        setServers(list ?? []);
        setConfigured(settings?.vultrConfigured ?? false);
      })
      .catch((err) => { if (alive) setError(err.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const statusTone = (s) => {
    if (s === 'active' || s === 'running') return 'success';
    if (s === 'pending' || s === 'resizing' || s === 'migrating') return 'warn';
    if (s === 'stopped' || s === 'halted') return 'neutral';
    if (s === 'error' || s === 'destroyed') return 'danger';
    return 'neutral';
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Hosting · VPS</div>
          <h1>Virtual servers</h1>
          <p className="sub">Manage your Vultr VPS instances — provision, start, stop, reboot, and destroy from one place.</p>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => navigate({ view: 'vps-create' })}>
            <ICN.Plus size={14} /> New VPS
          </button>
        </div>
      </div>

      {configured === false && (
        <div className="card" style={{ padding: '12px 16px', background: 'var(--warning-soft, #fffbe6)', border: '1px solid var(--warning, #f59e0b)', fontSize: 13 }}>
          <strong>Vultr not configured.</strong> Set <code>VULTR_API_KEY</code> in your backend environment to enable VPS provisioning.
        </div>
      )}

      {error && <div className="card" style={{ padding: '10px 14px', color: 'var(--danger)', fontSize: 13 }}>{error}</div>}

      {loading ? (
        <div className="card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading servers…</div>
      ) : servers.length === 0 ? (
        <Empty
          icon="Server"
          title="No VPS servers yet"
          body="Provision your first virtual server — choose region, plan, OS, and pay with PayPal."
          action={
            <button className="btn btn-primary" onClick={() => navigate({ view: 'vps-create' })}>
              <ICN.Plus size={14} /> Create first VPS
            </button>
          }
        />
      ) : (
        <div className="card card-flush">
          <table className="tbl">
            <thead>
              <tr>
                <th>Label</th>
                <th>Region</th>
                <th>Plan</th>
                <th>IP</th>
                <th>Status</th>
                <th>Monthly</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {servers.map((s) => (
                <tr key={s.id}>
                  <td>
                    <a href="#" className="mono"
                       onClick={(e) => { e.preventDefault(); navigate({ view: 'vps-detail', params: { id: s.id } }); }}>
                      {s.label}
                    </a>
                    <div className="faint" style={{ fontSize: 11 }}>{s.hostname}</div>
                  </td>
                  <td>{s.region}</td>
                  <td className="mono">{s.plan}</td>
                  <td className="mono">{s.mainIp || '—'}</td>
                  <td><StatusBadge value={s.status} /></td>
                  <td className="mono">${((s.totalPriceCents ?? 0) / 100).toFixed(2)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-sm btn-ghost"
                            onClick={() => navigate({ view: 'vps-detail', params: { id: s.id } })}>
                      <ICN.ArrowRight size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ─── VPS Create Wizard ────────────────────────────────────────────────────────

const STEPS = ['Region', 'Plan', 'OS', 'Config', 'Review', 'Pay'];

export function VpsCreateWizard({ navigate }) {
  const [step, setStep] = useState(0);
  const [regions, setRegions] = useState([]);
  const [plans, setPlans] = useState([]);
  const [osList, setOsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    region: '', plan: '', osId: null, label: '', hostname: '', sshKeyId: '', userData: '',
  });
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState('');
  const [payLoading, setPayLoading] = useState(false);
  const [paypalWindow, setPaypalWindow] = useState(null);
  const [pendingOrder, setPendingOrder] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    let alive = true;
    Promise.all([listVultrRegions(), listVultrPlans(), listVultrOperatingSystems()])
      .then(([r, p, o]) => {
        if (!alive) return;
        setRegions(r ?? []);
        setPlans(p ?? []);
        setOsList(o ?? []);
      })
      .catch((err) => setError(err.message))
      .finally(() => { if (alive) setLoading(false); });
    return () => {
      alive = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  // When reaching review step, fetch quote
  useEffect(() => {
    if (step !== 4) return;
    if (!form.region || !form.plan || !form.osId) return;
    setQuoteLoading(true);
    getVpsQuote({ region: form.region, plan: form.plan, osId: form.osId })
      .then(setQuote)
      .catch((err) => setError(err.message))
      .finally(() => setQuoteLoading(false));
  }, [step]);

  const handlePay = async () => {
    setError('');
    setPayLoading(true);
    try {
      const order = await createVpsPayPalOrder({
        region: form.region,
        plan: form.plan,
        osId: form.osId,
        label: form.label,
        hostname: form.hostname || form.label,
        sshKeyId: form.sshKeyId || undefined,
        userData: form.userData || undefined,
      });

      setPendingOrder(order);

      if (order.approvalUrl) {
        const win = window.open(order.approvalUrl, '_blank', 'width=600,height=700');
        setPaypalWindow(win);
        // Poll every 3s for up to 10 minutes until user completes payment
        pollRef.current = setInterval(async () => {
          try {
            const vps = await captureVpsPayPalOrder({
              orderId: order.orderId,
              provisionDetails: {
                region: form.region,
                plan: form.plan,
                osId: form.osId,
                label: form.label,
                hostname: form.hostname || form.label,
              },
            });
            clearInterval(pollRef.current);
            navigate({ view: 'vps-detail', params: { id: vps.id } });
          } catch {
            // Payment not yet captured — keep polling
          }
        }, 3000);
        setStep(5); // Show waiting screen
      }
    } catch (err) {
      setError(err.message || 'Failed to create PayPal order.');
    } finally {
      setPayLoading(false);
    }
  };

  const canAdvance = () => {
    if (step === 0) return Boolean(form.region);
    if (step === 1) return Boolean(form.plan);
    if (step === 2) return form.osId !== null;
    if (step === 3) return form.label.trim().length > 0;
    return true;
  };

  if (loading) {
    return (
      <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading Vultr catalog…
      </div>
    );
  }

  const renderStep = () => {
    switch (step) {
      case 0: return (
        <StepRegion regions={regions} value={form.region} onChange={set('region')} />
      );
      case 1: return (
        <StepPlan plans={plans} region={form.region} value={form.plan} onChange={set('plan')} />
      );
      case 2: return (
        <StepOs osList={osList} value={form.osId} onChange={set('osId')} />
      );
      case 3: return (
        <StepConfig form={form} set={set} />
      );
      case 4: return (
        <StepReview form={form} quote={quote} quoteLoading={quoteLoading}
                    regions={regions} plans={plans} osList={osList} />
      );
      case 5: return (
        <StepPaying orderId={pendingOrder?.orderId} onComplete={() => {}} />
      );
      default: return null;
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Hosting · VPS</div>
          <h1>Create virtual server</h1>
          <p className="sub">Choose your region, plan, and OS — then pay securely with PayPal.</p>
        </div>
        <div className="actions">
          <button className="btn btn-ghost" onClick={() => navigate({ view: 'vps-hosting' })}>Cancel</button>
        </div>
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {STEPS.map((label, i) => (
          <div key={label} style={{
            padding: '4px 12px', borderRadius: 99, fontSize: 12,
            background: i === step ? 'var(--accent)' : i < step ? 'var(--accent-soft)' : 'var(--bg-deep)',
            color: i === step ? '#fff' : i < step ? 'var(--accent)' : 'var(--text-muted)',
            fontWeight: i === step ? 600 : 400,
          }}>
            {i + 1}. {label}
          </div>
        ))}
      </div>

      {error && <div className="card" style={{ padding: '10px 14px', color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <div className="card">
        <div style={{ padding: '20px 24px' }}>
          {renderStep()}
        </div>
        {step < 5 && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
            <button className="btn btn-ghost" onClick={() => step === 0 ? navigate({ view: 'vps-hosting' }) : setStep(s => s - 1)}>
              {step === 0 ? 'Cancel' : '← Back'}
            </button>
            {step < 4 ? (
              <button className="btn btn-primary" disabled={!canAdvance()} onClick={() => setStep(s => s + 1)}>
                Continue →
              </button>
            ) : (
              <button className="btn btn-primary" disabled={payLoading || quoteLoading} onClick={handlePay}>
                {payLoading ? 'Creating order…' : 'Pay with PayPal →'}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function StepRegion({ regions, value, onChange }) {
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Choose a region</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
        {regions.map((r) => (
          <button key={r.id}
            className={`card ${value === r.id ? 'card--selected' : ''}`}
            style={{ padding: '14px 16px', textAlign: 'left', cursor: 'pointer', border: value === r.id ? '2px solid var(--accent)' : '1px solid var(--border)', background: value === r.id ? 'var(--accent-soft)' : 'var(--bg-card)' }}
            onClick={() => onChange(r.id)}>
            <div style={{ fontWeight: 600 }}>{r.city}</div>
            <div className="faint" style={{ fontSize: 12 }}>{r.country} · {r.id}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepPlan({ plans, region, value, onChange }) {
  const available = region ? plans.filter((p) => !p.locations || p.locations.includes(region)) : plans;
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Choose a plan</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
        {available.map((p) => (
          <button key={p.id}
            className="card"
            style={{ padding: '14px 16px', textAlign: 'left', cursor: 'pointer', border: value === p.id ? '2px solid var(--accent)' : '1px solid var(--border)', background: value === p.id ? 'var(--accent-soft)' : 'var(--bg-card)' }}
            onClick={() => onChange(p.id)}>
            <div style={{ fontWeight: 600 }} className="mono">{p.id}</div>
            <div style={{ fontSize: 13, color: 'var(--text)', margin: '4px 0' }}>
              {p.vcpu_count} vCPU · {p.ram / 1024} GB RAM · {p.disk} GB SSD
            </div>
            <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>${p.monthly_cost}/mo base</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepOs({ osList, value, onChange }) {
  const families = [...new Set(osList.map((o) => o.family))].sort();
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Choose an operating system</h3>
      {families.map((family) => (
        <div key={family} style={{ marginBottom: 16 }}>
          <div className="label" style={{ marginBottom: 8 }}>{family}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            {osList.filter((o) => o.family === family).map((o) => (
              <button key={o.id}
                className="card"
                style={{ padding: '10px 14px', textAlign: 'left', cursor: 'pointer', border: value === o.id ? '2px solid var(--accent)' : '1px solid var(--border)', background: value === o.id ? 'var(--accent-soft)' : 'var(--bg-card)' }}
                onClick={() => onChange(o.id)}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{o.name}</div>
                <div className="faint" style={{ fontSize: 11 }}>{o.arch}</div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function StepConfig({ form, set }) {
  return (
    <div style={{ maxWidth: 480 }}>
      <h3 style={{ marginTop: 0 }}>Configure your server</h3>
      <div style={{ marginBottom: 16 }}>
        <label className="label">Label <span style={{ color: 'var(--danger)' }}>*</span></label>
        <input className="input" placeholder="my-web-server" value={form.label}
               onChange={(e) => set('label')(e.target.value)} required />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label className="label">Hostname (optional)</label>
        <input className="input" placeholder="server.example.com" value={form.hostname}
               onChange={(e) => set('hostname')(e.target.value)} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label className="label">SSH Key ID (optional)</label>
        <input className="input" placeholder="Vultr SSH key UUID" value={form.sshKeyId}
               onChange={(e) => set('sshKeyId')(e.target.value)} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label className="label">User data / cloud-init (optional)</label>
        <textarea className="input" rows={4} placeholder="#!/bin/bash&#10;apt-get update" value={form.userData}
                  onChange={(e) => set('userData')(e.target.value)}
                  style={{ resize: 'vertical', fontFamily: 'var(--mono, monospace)', fontSize: 12 }} />
      </div>
    </div>
  );
}

function StepReview({ form, quote, quoteLoading, regions, plans, osList }) {
  const region = regions.find((r) => r.id === form.region);
  const plan   = plans.find((p) => p.id === form.plan);
  const os     = osList.find((o) => o.id === form.osId);

  return (
    <div style={{ maxWidth: 500 }}>
      <h3 style={{ marginTop: 0 }}>Review your order</h3>
      <table className="tbl" style={{ marginBottom: 20 }}>
        <tbody>
          <tr><td className="label" style={{ width: 130 }}>Label</td><td className="mono">{form.label}</td></tr>
          <tr><td className="label">Hostname</td><td className="mono">{form.hostname || form.label}</td></tr>
          <tr><td className="label">Region</td><td>{region?.city ?? form.region} ({form.region})</td></tr>
          <tr><td className="label">Plan</td><td className="mono">{form.plan}</td></tr>
          <tr><td className="label">OS</td><td>{os?.name ?? form.osId}</td></tr>
          {plan && (
            <>
              <tr><td className="label">vCPU</td><td>{plan.vcpu_count}</td></tr>
              <tr><td className="label">RAM</td><td>{plan.ram / 1024} GB</td></tr>
              <tr><td className="label">SSD</td><td>{plan.disk} GB</td></tr>
            </>
          )}
        </tbody>
      </table>

      {quoteLoading ? (
        <div className="faint">Calculating price…</div>
      ) : quote ? (
        <div className="card" style={{ padding: '14px 18px', background: 'var(--accent-soft)', border: '1px solid var(--accent)' }}>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>Price breakdown</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
            <span>VPS base price</span><span className="mono">{quote.breakdown?.vpsPrice}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, color: 'var(--text-muted)' }}>
            <span>Platform fee ({quote.markupPercent}%)</span><span className="mono">{quote.breakdown?.platformFee}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid var(--accent)', paddingTop: 8 }}>
            <span>Total / month</span><span className="mono" style={{ color: 'var(--accent)' }}>{quote.breakdown?.total}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StepPaying({ orderId }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>💳</div>
      <h3>Complete payment in the PayPal window</h3>
      <p className="faint">A PayPal window has opened. After you approve the payment, your server will be provisioned automatically.</p>
      {orderId && <div className="mono faint" style={{ fontSize: 11, marginTop: 12 }}>Order ID: {orderId}</div>}
    </div>
  );
}

// ─── VPS Detail ───────────────────────────────────────────────────────────────

export function VpsDetail({ id, navigate }) {
  const [server, setServer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState('');

  const load = () => {
    setLoading(true);
    getVpsService(id)
      .then(setServer)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const doAction = async (action, fn) => {
    setError('');
    setActionLoading(action);
    try {
      await fn();
      if (action === 'destroy') {
        navigate({ view: 'vps-hosting' });
        return;
      }
      load();
    } catch (err) {
      setError(err.message || `${action} failed.`);
    } finally {
      setActionLoading('');
      setConfirm('');
    }
  };

  if (loading) return (
    <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading VPS details…</div>
  );

  if (!server) return (
    <Empty icon="Server" title="Server not found" body={error || 'This server may have been destroyed.'} action={
      <button className="btn btn-outline" onClick={() => navigate({ view: 'vps-hosting' })}>Back to VPS list</button>
    } />
  );

  const statusTone = () => {
    if (server.status === 'active') return 'success';
    if (['pending', 'resizing', 'migrating'].includes(server.status)) return 'warn';
    if (['stopped', 'halted'].includes(server.status)) return 'neutral';
    return 'neutral';
  };

  const isActive = server.status === 'active';
  const isStopped = ['stopped', 'halted'].includes(server.status);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Hosting · VPS</div>
          <h1 className="mono">{server.label}</h1>
          <p className="sub">{server.hostname} · {server.region} · {server.plan}</p>
        </div>
        <div className="actions">
          <button className="btn btn-ghost" onClick={() => navigate({ view: 'vps-hosting' })}>← All VPS</button>
          <button className="btn btn-outline" onClick={load}>
            <ICN.RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="card" style={{ padding: '10px 14px', color: 'var(--danger)', fontSize: 13 }}>{error}</div>}

      <div className="grid-side" style={{ '--side-width': '320px' }}>
        {/* Main info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-head"><h2>Server details</h2></div>
            <table className="tbl">
              <tbody>
                <tr><td className="label">Status</td><td><StatusBadge value={server.status} /></td></tr>
                <tr><td className="label">IP address</td><td className="mono">{server.mainIp || 'Pending…'}</td></tr>
                <tr><td className="label">Region</td><td>{server.region}</td></tr>
                <tr><td className="label">Plan</td><td className="mono">{server.plan}</td></tr>
                <tr><td className="label">OS ID</td><td className="mono">{server.osId}</td></tr>
                {server.vcpuCount && <tr><td className="label">vCPU</td><td>{server.vcpuCount}</td></tr>}
                {server.ramMb && <tr><td className="label">RAM</td><td>{server.ramMb / 1024} GB</td></tr>}
                {server.diskGb && <tr><td className="label">Disk</td><td>{server.diskGb} GB SSD</td></tr>}
                <tr><td className="label">Created</td><td>{new Date(server.createdAt).toLocaleDateString()}</td></tr>
              </tbody>
            </table>
          </div>

          {/* SSH hint */}
          {server.mainIp && server.mainIp !== 'Pending…' && (
            <div className="card">
              <div className="card-head"><h2>Connect</h2></div>
              <div style={{ padding: '10px 16px 16px' }}>
                <div className="label" style={{ marginBottom: 6 }}>SSH command</div>
                <div className="mono" style={{
                  background: 'var(--bg-deep)', padding: '10px 14px', fontSize: 12, borderRadius: 'var(--r-sm)',
                  userSelect: 'all',
                }}>
                  ssh root@{server.mainIp}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: pricing + actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-head"><h2>Pricing</h2></div>
            <div style={{ padding: '10px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span className="faint">Base (Vultr)</span>
                <span className="mono">${(server.monthlyCostCents / 100).toFixed(2)}/mo</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span className="faint">Platform fee ({server.markupPercent}%)</span>
                <span className="mono">${(server.markupAmountCents / 100).toFixed(2)}/mo</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                <span>Total</span>
                <span className="mono" style={{ color: 'var(--accent)' }}>${(server.totalPriceCents / 100).toFixed(2)}/mo</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h2>Actions</h2></div>
            <div style={{ padding: '10px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn btn-outline"
                disabled={!!actionLoading || isActive}
                onClick={() => doAction('start', () => startVpsService(id))}>
                {actionLoading === 'start' ? 'Starting…' : <><ICN.Play size={13} /> Start</>}
              </button>
              <button className="btn btn-outline"
                disabled={!!actionLoading || isStopped}
                onClick={() => doAction('halt', () => haltVpsService(id))}>
                {actionLoading === 'halt' ? 'Halting…' : <><ICN.Square size={13} /> Halt (power off)</>}
              </button>
              <button className="btn btn-outline"
                disabled={!!actionLoading}
                onClick={() => doAction('reboot', () => rebootVpsService(id))}>
                {actionLoading === 'reboot' ? 'Rebooting…' : <><ICN.RefreshCw size={13} /> Reboot</>}
              </button>
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }} />
              {confirm === 'destroy' ? (
                <div>
                  <div className="faint" style={{ fontSize: 12, marginBottom: 8 }}>
                    Are you sure? This permanently destroys the server and cannot be undone.
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-danger btn-sm" disabled={!!actionLoading}
                            onClick={() => doAction('destroy', () => destroyVpsService(id))}>
                      {actionLoading === 'destroy' ? 'Destroying…' : 'Yes, destroy'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirm('')}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button className="btn btn-outline" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                        disabled={!!actionLoading}
                        onClick={() => setConfirm('destroy')}>
                  <ICN.Trash2 size={13} /> Destroy server
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
