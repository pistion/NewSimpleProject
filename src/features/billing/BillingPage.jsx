// BillingPage.jsx — live deploy-first K200 billing for the signed-in user.
import React from 'react';
import { ICN } from '../../icons';
import { getBillingSummary } from '../../api/billing.js';
import {
  createDeploymentPaypalOrder,
  uploadManualReceipt,
} from '../../api/payments.js';

const { useState, useEffect, useCallback } = React;

// Bank transfer destination for manual (bank receipt) payments.
const BANK_DETAILS = [
  ['Bank', 'Bank South Pacific'],
  ['Branch', 'Waigani'],
  ['Account Name', 'John Wesley Tawa'],
  ['Account Number', '0000242010'],
];

function BankDetails() {
  return (
    <div style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
      <div className="page-eyebrow" style={{ marginBottom: 8 }}>Send your bank transfer to</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 14px', fontSize: 13 }}>
        {BANK_DETAILS.map(([label, value]) => (
          <React.Fragment key={label}>
            <span className="muted">{label}</span>
            <span className="mono" style={{ fontWeight: 600 }}>{value}</span>
          </React.Fragment>
        ))}
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        After paying, upload your receipt below. An admin will verify and approve it.
      </div>
    </div>
  );
}

function StatusPill({ value }) {
  const v = String(value || '').toLowerCase();
  const [bg, fg] = v === 'paid' ? ['var(--accent-soft)', 'var(--accent)']
    : v === 'payment_uploaded' || v === 'pending' ? ['#fdf0d5', '#b8860b']
    : ['#fde2e1', '#c0392b'];
  return <span style={{ background: bg, color: fg, padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>{value || 'pending'}</span>;
}

function hoursLeft(dueAt) {
  if (!dueAt) return null;
  const ms = new Date(dueAt).getTime() - Date.now();
  return Math.round((ms / 3_600_000) * 10) / 10;
}

export default function BillingPage() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try { setSummary(await getBillingSummary()); }
    catch (e) { setError(e.message || 'Could not load billing.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const pricing = summary?.pricing;
  const orders = summary?.orders || [];
  const deployments = summary?.deployments || [];
  const depByOrder = Object.fromEntries(deployments.filter((d) => d.checkoutOrderId).map((d) => [d.checkoutOrderId, d]));
  const depById = Object.fromEntries(deployments.map((d) => [d.deploymentId, d]));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Billing</div>
          <h1>Hosting bills</h1>
          <p className="sub">Every ZIP or GitHub deployment costs a flat {pricing?.displayAmount || 'K200'}. Your site deploys first — pay within {pricing?.graceHours || 12} hours or it is suspended automatically.</p>
        </div>
        <div className="actions">
          <button className="btn btn-outline" onClick={refresh} disabled={loading}><ICN.RefreshCw size={14} /> Refresh</button>
        </div>
      </div>

      {error && <div className="card" style={{ padding: '10px 14px', marginBottom: 12, color: 'var(--danger)' }}>{error}</div>}

      {/* Pricing + payment rule */}
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div className="page-eyebrow" style={{ marginBottom: 6 }}>Launch pricing</div>
          {typeof pricing?.promo?.remaining === 'number' && (
            <span className="muted" style={{ fontSize: 12 }}>{pricing.promo.remaining} K50 promo slot{pricing.promo.remaining === 1 ? '' : 's'} left</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'baseline' }}>
          {(pricing?.tiers || []).map((t) => (
            <div key={t.id} style={{ opacity: t.available ? 1 : 0.5 }}>
              <span style={{ fontFamily: 'var(--serif)', fontSize: 30, lineHeight: 1 }}>{t.displayAmount}</span>
              <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>{t.label}{t.promo && !t.available ? ' · sold out' : ''}</span>
            </div>
          ))}
          {!pricing?.tiers && <div style={{ fontFamily: 'var(--serif)', fontSize: 34, lineHeight: 1 }}>{pricing?.displayAmount || 'K200'} <span style={{ fontSize: 14 }} className="muted">per deployment</span></div>}
        </div>
        <div className="muted" style={{ fontSize: 13, marginTop: 10, maxWidth: 560 }}>
          {pricing?.freeHostingMessage || `Your site starts on free hosting for ${pricing?.graceHours || 12} hours. After payment is verified, we upgrade your hosting plan and redeploy.`}
        </div>
        <div className="muted" style={{ fontSize: 13, marginTop: 4, maxWidth: 560 }}>
          Pay by PayPal / card, or upload a bank transfer receipt for admin approval.
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 28 }}>Loading…</div>
      ) : orders.length === 0 ? (
        <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ width: 44, height: 44, borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}><ICN.CreditCard size={20} /></div>
          <h2 style={{ margin: '0 0 6px' }}>No active bills yet</h2>
          <p className="muted" style={{ margin: 0 }}>No active bills yet. Deploy a ZIP or GitHub project to create a K200 hosting bill.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              deployment={depByOrder[order.id] || depById[order.deploymentId] || null}
              pricing={pricing}
              onChanged={refresh}
            />
          ))}
        </div>
      )}
    </>
  );
}

function OrderCard({ order, deployment, pricing, onChanged }) {
  const paid = order.status === 'paid';
  const expired = order.status === 'expired';
  const left = hoursLeft(order.dueAt || deployment?.billingDueAt);
  const amount = `${order.currency || pricing?.deploymentCurrency || 'PGK'} ${((order.totalAmountCents || 0) / 100).toFixed(2)}`;

  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [file, setFile] = useState(null);
  const [waiting, setWaiting] = useState(false);

  const startPaypal = async () => {
    setBusy('paypal'); setErr(''); setMsg('');
    try {
      const res = await createDeploymentPaypalOrder(order.id);
      if (res?.alreadyPaid) { setMsg('Already paid.'); onChanged(); return; }
      if (res?.approvalUrl) {
        window.open(res.approvalUrl, '_blank', 'noopener,noreferrer');
        setWaiting(true);
        setMsg('Complete the payment in the PayPal tab. This page updates automatically once payment is confirmed.');
      } else {
        setErr('PayPal is not configured. Upload a bank receipt instead.');
      }
    } catch (e) { setErr(e.message || 'Could not start PayPal.'); }
    finally { setBusy(''); }
  };

  // While awaiting PayPal confirmation, poll the billing summary so the card
  // flips to "paid" as soon as the webhook records the capture. No manual step.
  useEffect(() => {
    if (!waiting || paid) { if (paid) setWaiting(false); return undefined; }
    const tick = setInterval(() => { onChanged(); }, 5000);
    const stop = setTimeout(() => { clearInterval(tick); setWaiting(false); }, 3 * 60 * 1000);
    return () => { clearInterval(tick); clearTimeout(stop); };
  }, [waiting, paid, onChanged]);

  const upload = async () => {
    if (!file) { setErr('Choose a receipt file (PDF, PNG, JPG, JPEG).'); return; }
    setBusy('upload'); setErr(''); setMsg('');
    try {
      await uploadManualReceipt({ checkoutOrderId: order.id, file });
      setMsg('Receipt uploaded. Admin will review and approve it.');
      setFile(null);
      onChanged();
    } catch (e) { setErr(e.message || 'Upload failed.'); }
    finally { setBusy(''); }
  };

  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="row between" style={{ alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{deployment?.serviceName || 'Deployment'} <span className="muted" style={{ fontSize: 13 }}>· {amount}{order.billingTierLabel ? ` · ${order.billingTierLabel}` : ''}</span></div>
          <div className="mono muted" style={{ fontSize: 12, marginTop: 2 }}>deployment: {order.deploymentId || '—'}</div>
          <div className="mono muted" style={{ fontSize: 12 }}>order: {order.id}</div>
          {deployment?.liveUrl && <a className="mono" style={{ fontSize: 12 }} href={deployment.liveUrl} target="_blank" rel="noopener noreferrer">{deployment.liveUrl.replace(/^https?:\/\//, '')}</a>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <StatusPill value={order.status} />
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            {paid ? `Paid ${order.paidAt ? new Date(order.paidAt).toLocaleString() : ''}`
              : expired ? 'Expired'
              : order.dueAt ? `Due ${new Date(order.dueAt).toLocaleString()}${left != null ? ` (${left}h left)` : ''}` : 'Due pending'}
          </div>
        </div>
      </div>

      {err && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{err}</div>}
      {msg && <div style={{ color: 'var(--accent)', fontSize: 13, marginTop: 10 }}>{msg}</div>}

      {paid ? (
        <div style={{ marginTop: 12, color: 'var(--accent)', fontWeight: 700 }}><ICN.CheckCircle size={15} /> Payment received.</div>
      ) : (
        <div style={{ marginTop: 14, display: 'grid', gap: 14 }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>Pay with PayPal / Card</div>
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <button className="btn btn-primary btn-sm" disabled={busy === 'paypal' || waiting} onClick={startPaypal}><ICN.CreditCard size={13} /> {busy === 'paypal' ? 'Starting…' : `Pay ${pricing?.displayAmount || 'K200'} with PayPal`}</button>
              {waiting && <span className="muted" style={{ fontSize: 12 }}><ICN.RefreshCw size={12} /> Waiting for PayPal confirmation…</span>}
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>Upload bank receipt</div>
            <BankDetails />
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              <button className="btn btn-primary btn-sm" disabled={busy === 'upload' || !file} onClick={upload}><ICN.Cloud size={13} /> {busy === 'upload' ? 'Uploading…' : 'Upload receipt'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
