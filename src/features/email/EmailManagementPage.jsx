/**
 * EmailManagementPage — Dashboard Business Email.
 * Configuration, DNS, mailbox requests. Not for reading mail (see GlondiaMail).
 */
import React from 'react';
import { ICN } from '../../icons';
import { Empty } from '../../components';
import {
  getEmailStatus,
  listEmailMailboxes,
  requestEmailMailbox,
  getEmailDnsRecords,
  checkEmailDns,
} from '../../api/email.js';
import { listRegisteredDomains } from '../../api.js';
import { isLiveMode } from '../../app/config.js';

const { useState, useEffect, useCallback } = React;

const STATUS_STYLES = {
  active: { bg: 'var(--accent-soft)', fg: 'var(--accent)', label: 'Active' },
  pending_setup: { bg: '#fdf0d5', fg: '#b8860b', label: 'Pending setup' },
  setup_required: { bg: '#fdf0d5', fg: '#b8860b', label: 'Pending setup' },
  suspended: { bg: '#fde2e1', fg: '#c0392b', label: 'Suspended' },
};

function StatusPill({ status }) {
  const key = String(status || 'pending_setup').toLowerCase().replace(/\s+/g, '_');
  const style = STATUS_STYLES[key] || STATUS_STYLES.pending_setup;
  return (
    <span style={{
      background: style.bg, color: style.fg, padding: '2px 10px',
      borderRadius: 999, fontSize: 12, fontWeight: 700,
    }}>
      {style.label}
    </span>
  );
}

function CopyBtn({ value }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-sm btn-outline"
      onClick={() => {
        navigator.clipboard?.writeText(value).catch(() => {});
        setOk(true);
        setTimeout(() => setOk(false), 1200);
      }}
    >
      <ICN.Copy size={13} /> {ok ? 'Copied' : 'Copy'}
    </button>
  );
}

function openMailboxes(url) {
  const href = url || '/mailboxes';
  if (href.startsWith('http')) {
    window.open(href, '_blank', 'noopener,noreferrer');
  } else {
    window.location.href = href.startsWith('/') ? href : `/${href}`;
  }
}

export default function EmailManagementPage({ navigate }) {
  const [status, setStatus] = useState(null);
  const [mailboxes, setMailboxes] = useState([]);
  const [domains, setDomains] = useState([]);
  const [selectedDomain, setSelectedDomain] = useState('');
  const [dns, setDns] = useState(null);
  const [dnsCheck, setDnsCheck] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dnsLoading, setDnsLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitMsg, setSubmitMsg] = useState('');
  const [submitErr, setSubmitErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    domain: '',
    mailboxName: '',
    displayName: '',
    notes: '',
  });

  const webmailUrl = status?.webmailUrl || '/mailboxes';

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [st, boxes] = await Promise.all([
        getEmailStatus(),
        listEmailMailboxes(),
      ]);
      setStatus(st);
      setMailboxes(boxes.mailboxes || []);

      let domainList = [];
      if (isLiveMode()) {
        try {
          const reg = await listRegisteredDomains(0, 100);
          const items = Array.isArray(reg?.items) ? reg.items : (Array.isArray(reg) ? reg : []);
          domainList = items
            .map((d) => d.name || d.hostname || d.domain)
            .filter(Boolean);
        } catch {
          domainList = [];
        }
      }
      // Also include domains already used by mailboxes.
      for (const m of boxes.mailboxes || []) {
        if (m.domain && !domainList.includes(m.domain)) domainList.push(m.domain);
      }
      setDomains(domainList);
      if (!selectedDomain && domainList[0]) {
        setSelectedDomain(domainList[0]);
        setForm((f) => ({ ...f, domain: f.domain || domainList[0] }));
      }
    } catch (e) {
      setError(e.message || 'Could not load Business Email.');
    } finally {
      setLoading(false);
    }
  }, [selectedDomain]);

  useEffect(() => { refresh(); }, [refresh]);

  const loadDns = useCallback(async (domain) => {
    if (!domain) { setDns(null); return; }
    setDnsLoading(true);
    try {
      const data = await getEmailDnsRecords(domain);
      setDns(data);
      setDnsCheck(null);
    } catch (e) {
      setDns(null);
      setError(e.message || 'Could not load DNS records.');
    } finally {
      setDnsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedDomain) loadDns(selectedDomain);
  }, [selectedDomain, loadDns]);

  const onCheckDns = async () => {
    if (!selectedDomain) return;
    setDnsLoading(true);
    setError('');
    try {
      const result = await checkEmailDns(selectedDomain);
      setDnsCheck(result);
    } catch (e) {
      setError(e.message || 'DNS check failed.');
    } finally {
      setDnsLoading(false);
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitMsg('');
    setSubmitErr('');
    const domain = (form.domain || selectedDomain).trim().toLowerCase();
    const mailboxName = form.mailboxName.trim().toLowerCase().replace(/@.*$/, '');
    if (!domain || !mailboxName) {
      setSubmitErr('Domain and mailbox name are required.');
      return;
    }
    setBusy(true);
    try {
      await requestEmailMailbox({
        domain,
        mailboxName,
        displayName: form.displayName,
        notes: form.notes,
      });
      setSubmitMsg('Request submitted. An admin will prepare your mailbox.');
      setForm((f) => ({ ...f, mailboxName: '', displayName: '', notes: '' }));
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
          <p className="sub">Create mailboxes, configure email DNS, and connect your domain to GlondiaMail.</p>
        </div>
        <div className="actions">
          <button className="btn btn-outline" onClick={refresh} disabled={loading}>
            <ICN.RefreshCw size={14} /> Refresh
          </button>
          <button className="btn btn-primary" type="button" onClick={() => openMailboxes(webmailUrl)}>
            <ICN.Mail size={14} /> Open Mailboxes
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ padding: '10px 14px', marginBottom: 12, color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {/* 1. Status */}
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="page-eyebrow" style={{ marginBottom: 12 }}>Email service status</div>
        {loading && !status ? (
          <div className="muted">Loading…</div>
        ) : (
          <div className="grid-4" style={{ gap: 12 }}>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>Provider</div>
              <div style={{ fontWeight: 600 }}>
                {status?.configured ? 'Configured' : 'Not fully configured'}
              </div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>DNS</div>
              <div style={{ fontWeight: 600 }}>
                {status?.dnsVerified ? 'Verified' : 'Setup required'}
              </div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>Mailboxes</div>
              <div style={{ fontWeight: 600 }}>{status?.mailboxCount ?? mailboxes.length}</div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>Domains in use</div>
              <div style={{ fontWeight: 600 }}>{status?.domainCount ?? 0}</div>
            </div>
          </div>
        )}
        {status?.message && (
          <p className="muted" style={{ fontSize: 13, marginTop: 12, marginBottom: 0 }}>{status.message}</p>
        )}
      </div>

      {/* 2. Domain selector */}
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="page-eyebrow" style={{ marginBottom: 8 }}>Domain</div>
        {domains.length === 0 ? (
          <div>
            <p className="muted" style={{ marginTop: 0 }}>
              Add or connect a domain before creating mailboxes.
            </p>
            {navigate && (
              <button className="btn btn-outline btn-sm" type="button" onClick={() => navigate({ view: 'domains-buy' })}>
                Buy or connect a domain
              </button>
            )}
            <div style={{ marginTop: 12 }}>
              <label className="label" htmlFor="email-domain-manual">Or enter a domain you already own</label>
              <input
                id="email-domain-manual"
                className="input"
                placeholder="example.com"
                value={selectedDomain}
                onChange={(e) => {
                  const v = e.target.value.trim().toLowerCase();
                  setSelectedDomain(v);
                  setForm((f) => ({ ...f, domain: v }));
                }}
              />
            </div>
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="email-domain-select">Choose domain</label>
            <select
              id="email-domain-select"
              className="select"
              value={selectedDomain}
              onChange={(e) => {
                setSelectedDomain(e.target.value);
                setForm((f) => ({ ...f, domain: e.target.value }));
              }}
            >
              {domains.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 3. Mailbox list */}
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="page-eyebrow" style={{ marginBottom: 12 }}>Mailboxes</div>
        {loading ? (
          <div className="muted">Loading…</div>
        ) : mailboxes.length === 0 ? (
          <Empty
            icon="Mail"
            title="No mailboxes yet"
            body="Request your first mailbox below. Glondia will prepare it after DNS is ready."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {mailboxes.map((box) => (
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
                    {box.displayName ? ` · ${box.displayName}` : ''}
                  </div>
                </div>
                <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <StatusPill status={box.status} />
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => openMailboxes(box.webmailUrl || webmailUrl)}
                  >
                    Open Mailboxes
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled title="Coming soon">
                    Manage
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Request form */}
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="page-eyebrow" style={{ marginBottom: 8 }}>Request a mailbox</div>
        <p className="muted" style={{ fontSize: 13, marginBottom: 14, maxWidth: 540 }}>
          Request addresses like info@, sales@, or support@. Passwords are set securely by Glondia and are never entered here.
        </p>
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
          <div>
            <label className="label" htmlFor="req-domain">Domain</label>
            <input
              id="req-domain"
              className="input"
              value={form.domain || selectedDomain}
              onChange={(e) => setForm({ ...form, domain: e.target.value })}
              placeholder="example.com"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="req-mailbox">Mailbox name</label>
            <input
              id="req-mailbox"
              className="input"
              value={form.mailboxName}
              onChange={(e) => setForm({ ...form, mailboxName: e.target.value })}
              placeholder="info, sales, admin, support…"
              required
            />
            {(form.domain || selectedDomain) && form.mailboxName && (
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Will request:{' '}
                <span className="mono">
                  {form.mailboxName.replace(/@.*$/, '')}@{form.domain || selectedDomain}
                </span>
              </div>
            )}
          </div>
          <div>
            <label className="label" htmlFor="req-display">Display name <span className="muted">(optional)</span></label>
            <input
              id="req-display"
              className="input"
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              placeholder="Sales Team"
            />
          </div>
          <div>
            <label className="label" htmlFor="req-notes">Notes <span className="muted">(optional)</span></label>
            <textarea
              id="req-notes"
              className="input"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Any setup notes for the team…"
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

      {/* 5. DNS panel */}
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="row between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <div className="page-eyebrow" style={{ margin: 0 }}>Email DNS configuration</div>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={onCheckDns}
            disabled={!selectedDomain || dnsLoading}
          >
            <ICN.ShieldCheck size={14} /> {dnsLoading ? 'Checking…' : 'Check DNS'}
          </button>
        </div>

        {!selectedDomain ? (
          <p className="muted" style={{ margin: 0 }}>Select a domain to see MX, SPF, DKIM, and DMARC records.</p>
        ) : dnsLoading && !dns ? (
          <div className="muted">Loading DNS records…</div>
        ) : dns ? (
          <>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>{dns.message}</p>
            {dnsCheck && (
              <div className="card" style={{ padding: 12, marginBottom: 12, background: 'var(--bg-deep)' }}>
                <strong>Last check:</strong>{' '}
                <span className="muted">{dnsCheck.message}</span>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(dns.records || []).map((rec) => (
                <div
                  key={rec.id}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: 14,
                    background: 'var(--bg-deep)',
                  }}
                >
                  <div className="row between" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                    <div>
                      <span className="mono" style={{ fontWeight: 700 }}>{rec.type}</span>
                      <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>{rec.purpose}</span>
                    </div>
                    <CopyBtn value={`${rec.type} ${rec.host} ${rec.priority != null ? rec.priority + ' ' : ''}${rec.value}`} />
                  </div>
                  <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                    <div><span className="muted">Host:</span> <span className="mono">{rec.host}</span></div>
                    {rec.priority != null && (
                      <div><span className="muted">Priority:</span> <span className="mono">{rec.priority}</span></div>
                    )}
                    <div style={{ wordBreak: 'break-all' }}>
                      <span className="muted">Value:</span> <span className="mono">{rec.value}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {Array.isArray(dns.instructions) && dns.instructions.length > 0 && (
              <ol className="muted" style={{ marginTop: 16, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
                {dns.instructions.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}
          </>
        ) : (
          <p className="muted" style={{ margin: 0 }}>DNS records will appear here for the selected domain.</p>
        )}
      </div>
    </>
  );
}
