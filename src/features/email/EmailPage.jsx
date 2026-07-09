// EmailPage.jsx — client Business Email tab (mailboxes + request form).
// Does not display or collect mailbox passwords.
import React from 'react';
import { ICN } from '../../icons';
import { Empty } from '../../components';
import { listMailboxes, requestMailbox } from '../../api/email.js';

const { useState, useEffect, useCallback } = React;

const STATUS_STYLES = {
  active: { bg: 'var(--accent-soft)', fg: 'var(--accent)', label: 'Active' },
  setup_required: { bg: '#fdf0d5', fg: '#b8860b', label: 'Setup required' },
  suspended: { bg: '#fde2e1', fg: '#c0392b', label: 'Suspended' },
};

function StatusPill({ status }) {
  const key = String(status || 'setup_required').toLowerCase().replace(/\s+/g, '_');
  const style = STATUS_STYLES[key] || STATUS_STYLES.setup_required;
  return (
    <span style={{
      background: style.bg,
      color: style.fg,
      padding: '2px 10px',
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 700,
    }}>
      {style.label}
    </span>
  );
}

function openWebmail(url) {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export default function EmailPage() {
  const [mailboxes, setMailboxes] = useState([]);
  const [webmailUrl, setWebmailUrl] = useState(null);
  const [webmailConfigured, setWebmailConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitMsg, setSubmitMsg] = useState('');
  const [submitErr, setSubmitErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ domain: '', mailboxName: '', notes: '' });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listMailboxes();
      setMailboxes(data.mailboxes || []);
      setWebmailUrl(data.webmailUrl || null);
      setWebmailConfigured(Boolean(data.webmailConfigured && data.webmailUrl));
      if (data.error) setError(data.error);
    } catch (e) {
      setMailboxes([]);
      setError(e.message || 'Could not load mailboxes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitMsg('');
    setSubmitErr('');
    const domain = form.domain.trim().toLowerCase();
    const mailboxName = form.mailboxName.trim().toLowerCase().replace(/@.*$/, '');
    if (!domain || !mailboxName) {
      setSubmitErr('Domain and mailbox name are required.');
      return;
    }
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(domain)) {
      setSubmitErr('Enter a valid domain name (e.g. example.com).');
      return;
    }
    if (!/^[a-z0-9._+-]+$/i.test(mailboxName)) {
      setSubmitErr('Mailbox name may only contain letters, numbers, and . _ + -');
      return;
    }
    setBusy(true);
    try {
      await requestMailbox({ domain, mailboxName, notes: form.notes });
      setSubmitMsg('Request submitted. An admin will prepare your mailbox.');
      setForm({ domain: '', mailboxName: '', notes: '' });
      await refresh();
    } catch (err) {
      setSubmitErr(err.message || 'Could not submit mailbox request.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Email</div>
          <h1>Business Email</h1>
          <p className="sub">Access your business mailboxes and email setup from one place.</p>
        </div>
        <div className="actions">
          <button className="btn btn-outline" onClick={refresh} disabled={loading}>
            <ICN.RefreshCw size={14} /> Refresh
          </button>
          {webmailConfigured ? (
            <button className="btn btn-primary" type="button" onClick={() => openWebmail(webmailUrl)}>
              <ICN.Mail size={14} /> Open Webmail
            </button>
          ) : (
            <button className="btn btn-primary" type="button" disabled title="Webmail URL is not configured yet">
              <ICN.Mail size={14} /> Open Webmail
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="card" style={{ padding: '10px 14px', marginBottom: 12, color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {!webmailConfigured && (
        <div className="card" style={{ padding: '12px 16px', marginBottom: 16 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            <ICN.Info size={13} /> Webmail access will appear here once configured.
          </div>
        </div>
      )}

      {/* Mailbox list */}
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="page-eyebrow" style={{ marginBottom: 12 }}>Your mailboxes</div>
        {loading ? (
          <div className="muted" style={{ padding: '12px 0' }}>Loading…</div>
        ) : mailboxes.length === 0 ? (
          <Empty
            icon="Mail"
            title="No mailboxes yet"
            body="Request your first mailbox and Glondia will prepare it for your domain."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {mailboxes.map((box) => {
              const boxUrl = box.webmailUrl || webmailUrl;
              return (
                <div
                  key={box.id || box.email}
                  className="row between"
                  style={{
                    padding: '14px 16px',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    background: 'var(--bg-deep)',
                    flexWrap: 'wrap',
                    gap: 12,
                    alignItems: 'center',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, wordBreak: 'break-all' }}>{box.email}</div>
                    <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                      Domain: {box.domain || '—'}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <StatusPill status={box.status} />
                    {boxUrl ? (
                      <button
                        className="btn btn-outline btn-sm"
                        type="button"
                        onClick={() => openWebmail(boxUrl)}
                      >
                        Open Webmail
                      </button>
                    ) : (
                      <span className="muted" style={{ fontSize: 12 }}>Webmail pending</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Setup instructions */}
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="page-eyebrow" style={{ marginBottom: 8 }}>Setup</div>
        <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
          <li>Use this section to access your mailbox after Glondia has created it.</li>
          <li>For new mailboxes, submit a request and an admin will prepare it.</li>
        </ul>
      </div>

      {/* Request form */}
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="page-eyebrow" style={{ marginBottom: 8 }}>Request a mailbox</div>
        <p className="muted" style={{ fontSize: 13, marginBottom: 14, maxWidth: 520 }}>
          Tell us the domain and mailbox name you need (for example info or sales). Passwords are set securely by Glondia and are never shown here.
        </p>
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
          <div>
            <label className="label" htmlFor="email-domain">Domain name</label>
            <input
              id="email-domain"
              className="input"
              type="text"
              placeholder="example.com"
              value={form.domain}
              onChange={(e) => setForm({ ...form, domain: e.target.value })}
              autoComplete="off"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="email-mailbox">Desired mailbox name</label>
            <input
              id="email-mailbox"
              className="input"
              type="text"
              placeholder="info, sales, admin…"
              value={form.mailboxName}
              onChange={(e) => setForm({ ...form, mailboxName: e.target.value })}
              autoComplete="off"
              required
            />
            {form.domain && form.mailboxName && (
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Will request: <span className="mono">{form.mailboxName.replace(/@.*$/, '')}@{form.domain}</span>
              </div>
            )}
          </div>
          <div>
            <label className="label" htmlFor="email-notes">Notes <span className="muted">(optional)</span></label>
            <textarea
              id="email-notes"
              className="input"
              rows={3}
              placeholder="Any extra setup details for the team…"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              style={{ resize: 'vertical', minHeight: 72 }}
            />
          </div>
          {submitErr && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{submitErr}</div>}
          {submitMsg && <div style={{ color: 'var(--accent)', fontSize: 13 }}>{submitMsg}</div>}
          <div>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Submitting…' : 'Submit request'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
