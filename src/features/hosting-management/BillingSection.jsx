import React, { useRef, useState } from 'react';
import { ICN } from '../../icons';
import { Badge } from '../../components';
import { capturePaypalOrder, createPaypalOrder, uploadManualReceipt } from '../../api/payments.js';

function hoursRemaining(dueAt) {
  if (!dueAt) return null;
  const ms = new Date(dueAt).getTime() - Date.now();
  return Math.max(0, Math.round((ms / 3_600_000) * 10) / 10);
}

export default function BillingSection({ app = {}, onReload }) {
  const paymentStatus = app.paymentStatus || 'pending';
  const orderId = app.checkoutOrderId || null;
  const paid = paymentStatus === 'paid';
  const expired = paymentStatus === 'expired' || app.status === 'payment_expired';
  const remaining = hoursRemaining(app.billingDueAt);
  const priceLabel = `K${((app.priceCents ?? 20000) / 100).toFixed(0)}`;
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [file, setFile] = useState(null);
  const fileRef = useRef(null);

  const refresh = () => onReload?.();

  const handlePaypal = async () => {
    if (!orderId) { setError('No billing order is attached to this deployment yet.'); return; }
    setBusy('paypal'); setError(''); setNotice('');
    try {
      const order = await createPaypalOrder(orderId);
      if (order?.alreadyPaid) { setNotice('This deployment is already paid.'); refresh(); return; }
      if (order?.approvalUrl) {
        window.open(order.approvalUrl, '_blank', 'noopener,noreferrer');
        setNotice('Complete PayPal approval in the new tab, then click "I have approved".');
        window.__glondiaPaypalOrderId = order.paypalOrderId;
      } else {
        setError('PayPal is not configured. Use a bank receipt instead.');
      }
    } catch (err) { setError(err.message || 'Could not start PayPal payment.'); }
    finally { setBusy(''); }
  };

  const handleCapture = async () => {
    const paypalOrderId = window.__glondiaPaypalOrderId;
    if (!paypalOrderId) { setError('Start a PayPal payment first.'); return; }
    setBusy('capture'); setError(''); setNotice('');
    try {
      await capturePaypalOrder(paypalOrderId);
      setNotice('Payment captured. This deployment is now paid.');
      refresh();
    } catch (err) { setError(err.message || 'Could not capture the PayPal payment.'); }
    finally { setBusy(''); }
  };

  const handleUpload = async () => {
    if (!orderId) { setError('No billing order is attached to this deployment yet.'); return; }
    if (!file) { setError('Choose a receipt file first.'); return; }
    setBusy('upload'); setError(''); setNotice('');
    try {
      await uploadManualReceipt(file, { checkoutOrderId: orderId });
      setNotice('Receipt uploaded. An administrator will review and approve it.');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      refresh();
    } catch (err) { setError(err.message || 'Receipt upload failed.'); }
    finally { setBusy(''); }
  };

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Hosting fee - {priceLabel}</h2>
      <p className="muted">Every deployment has a fixed hosting fee. Your site can stay live during the grace window.</p>
      {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}
      {notice && <div style={{ color: 'var(--accent)', marginBottom: 12 }}>{notice}</div>}
      <div className="kv hosting-kv">
        <dt>Amount</dt><dd><b>{priceLabel}</b> {app.priceCurrency || 'PGK'}</dd>
        <dt>Status</dt><dd><Badge tone={paid ? 'success' : expired ? 'danger' : 'warn'}>{paymentStatus}</Badge></dd>
        <dt>Grace period</dt><dd>{remaining != null ? `${remaining} hours remaining` : 'Not calculated'}</dd>
        <dt>Deadline</dt><dd>{app.billingDueAt ? new Date(app.billingDueAt).toLocaleString() : 'Pending'}</dd>
        {orderId && <><dt>Order</dt><dd className="mono">{orderId}</dd></>}
      </div>
      {paid ? (
        <div style={{ marginTop: 16, color: 'var(--accent)', fontWeight: 700 }}><ICN.CheckCircle size={16} /> Payment received.</div>
      ) : (
        <div className="hosting-payment-grid">
          <div>
            <h3>Pay with PayPal or card</h3>
            <div className="hosting-section-actions">
              <button className="btn btn-primary" disabled={busy === 'paypal' || !orderId} onClick={handlePaypal}><ICN.CreditCard size={14} /> {busy === 'paypal' ? 'Starting...' : `Pay ${priceLabel}`}</button>
              <button className="btn btn-outline" disabled={busy === 'capture'} onClick={handleCapture}>{busy === 'capture' ? 'Confirming...' : 'I have approved'}</button>
            </div>
          </div>
          <div>
            <h3>Or upload a bank transfer receipt</h3>
            <div className="hosting-section-actions">
              <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => setFile(event.target.files?.[0] || null)} />
              <button className="btn btn-primary" disabled={busy === 'upload' || !file || !orderId} onClick={handleUpload}><ICN.Cloud size={14} /> {busy === 'upload' ? 'Uploading...' : 'Upload receipt'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
