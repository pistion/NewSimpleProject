/**
 * Business Email setup wizard.
 * This page configures domain DNS and mailbox requests. Reading/sending mail
 * stays in GlondiaMail.
 */
import React from 'react';
import { ICN } from '../../icons';
import {
  getEmailStatus,
  listEmailMailboxes,
  requestEmailMailbox,
  getEmailDnsRecords,
  checkEmailDns,
} from '../../api/email.js';
import { listRegisteredDomains } from '../../api.js';
import { isLiveMode } from '../../app/config.js';

const { useState, useEffect, useCallback, useMemo } = React;

const STEPS = [
  { id: 'domain', label: 'Select Domain', note: 'Choose the address family' },
  { id: 'dns', label: 'Configure DNS', note: 'Add mail records' },
  { id: 'propagation', label: 'DNS Propagation', note: 'Check public records' },
  { id: 'mailbox', label: 'Create Mailbox', note: 'Request the first inbox' },
  { id: 'ready', label: 'Ready for GlondiaMail', note: 'Open mail when active' },
];

const PRESETS = ['info', 'admin', 'sales', 'support', 'careers', 'billing'];

const DNS_STATUS = {
  not_checked: { label: 'Not checked', tone: 'muted' },
  checking: { label: 'Checking', tone: 'blue' },
  found: { label: 'Found', tone: 'green' },
  waiting: { label: 'Waiting for propagation', tone: 'amber' },
  incorrect: { label: 'Incorrect value', tone: 'red' },
  missing: { label: 'Missing', tone: 'red' },
};

function normalizeDomain(value) {
  return String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

function isValidDomain(value) {
  const domain = normalizeDomain(value);
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain);
}

function cleanMailboxName(value) {
  return String(value || '').trim().toLowerCase().replace(/@.*$/, '').replace(/[^a-z0-9._-]/g, '');
}

function mailboxAddress(mailbox) {
  if (!mailbox) return '';
  if (mailbox.email) return mailbox.email;
  if (mailbox.mailboxName && mailbox.domain) return `${mailbox.mailboxName}@${mailbox.domain}`;
  return '';
}

function openMailboxes(url) {
  const href = url || '/mailboxes';
  if (href.startsWith('http')) {
    window.open(href, '_blank', 'noopener,noreferrer');
  } else {
    window.location.href = href.startsWith('/') ? href : `/${href}`;
  }
}

function makeEvent(title, detail) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title,
    detail,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
}

function recordPurpose(record) {
  const type = String(record?.type || '').toUpperCase();
  const id = String(record?.id || '').toLowerCase();
  if (record?.purpose) return record.purpose;
  if (type === 'MX') return 'Routes inbound email to GlondiaMail.';
  if (type === 'TXT' && (id.includes('spf') || String(record?.value || '').includes('spf1'))) {
    return 'Authorizes GlondiaMail to send for this domain.';
  }
  if (type === 'TXT' && (id.includes('dkim') || String(record?.host || '').includes('_domainkey'))) {
    return 'Adds a signature that protects outgoing mail.';
  }
  if (type === 'TXT' && (id.includes('dmarc') || String(record?.host || '').includes('_dmarc'))) {
    return 'Tells receivers how to handle suspicious mail.';
  }
  return 'Required email DNS record.';
}

function normalizeRecords(dns) {
  const records = Array.isArray(dns?.records) ? dns.records : [];
  return records.map((record, index) => ({
    id: record.id || `${record.type || 'record'}-${record.host || index}-${index}`,
    type: String(record.type || '').toUpperCase(),
    host: record.host || record.name || '@',
    name: record.name || record.host || '@',
    priority: record.priority,
    value: record.value || record.data || '',
    purpose: recordPurpose(record),
    raw: record,
  }));
}

function normalizeRecordStatus(value) {
  const status = String(value || '').toLowerCase().replace(/\s+/g, '_');
  if (['found', 'verified', 'valid', 'pass', 'passed', 'ok', 'active'].includes(status)) return 'found';
  if (['missing', 'not_found'].includes(status)) return 'missing';
  if (['incorrect', 'wrong', 'mismatch', 'invalid'].includes(status)) return 'incorrect';
  if (['checking', 'in_progress'].includes(status)) return 'checking';
  if (['waiting', 'pending', 'pending_propagation', 'manual', 'setup_required'].includes(status)) return 'waiting';
  return 'not_checked';
}

function getRecordStatus(record, dnsCheck, checkingDns) {
  if (checkingDns) return 'checking';
  const checks = Array.isArray(dnsCheck?.records) ? dnsCheck.records : [];
  const match = checks.find((item) => {
    const itemId = String(item.id || '').toLowerCase();
    const itemType = String(item.type || '').toUpperCase();
    const itemHost = String(item.host || item.name || '').toLowerCase();
    return (
      itemId === String(record.id || '').toLowerCase() ||
      (itemType === record.type && itemHost === String(record.host || record.name || '').toLowerCase())
    );
  });
  if (match) return normalizeRecordStatus(match.status || match.check || match.result);
  if (dnsCheck?.status) return normalizeRecordStatus(dnsCheck.status);
  return 'not_checked';
}

function domainStatus(selectedDomain, domains) {
  if (!isValidDomain(selectedDomain)) return { label: 'Needs domain', tone: 'muted' };
  return domains.includes(selectedDomain)
    ? { label: 'Connected', tone: 'green' }
    : { label: 'Manual', tone: 'amber' };
}

function isActiveMailbox(box) {
  return String(box?.status || '').toLowerCase().replace(/\s+/g, '_') === 'active';
}

function StatusPill({ label, tone = 'muted' }) {
  return <span className={`email-setup-pill ${tone}`}>{label}</span>;
}

function CopyRecordButton({ value, onCopied }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`btn btn-sm btn-outline email-copy-btn ${copied ? 'copied' : ''}`}
      onClick={() => {
        navigator.clipboard?.writeText(value).catch(() => {});
        setCopied(true);
        onCopied?.();
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      <ICN.Copy size={13} /> {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function SetupStepper({ currentStep, completed, onStep }) {
  const currentIndex = STEPS.findIndex((step) => step.id === currentStep);
  return (
    <div className="email-setup-stepper">
      {STEPS.map((step, index) => {
        const isCurrent = step.id === currentStep;
        const isDone = completed[step.id];
        const isReachable = isDone || index <= currentIndex + 1;
        return (
          <button
            key={step.id}
            type="button"
            className={`email-step ${isCurrent ? 'current' : ''} ${isDone ? 'done' : ''}`}
            disabled={!isReachable}
            onClick={() => isReachable && onStep(step.id)}
          >
            <span className="email-step-index">{isDone ? 'OK' : index + 1}</span>
            <span>
              <strong>{step.label}</strong>
              <small>{step.note}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function DomainSetupStep({
  domains,
  selectedDomain,
  manualDomain,
  setManualDomain,
  onSelectDomain,
  onContinue,
  navigate,
}) {
  const selectedStatus = domainStatus(selectedDomain, domains);
  return (
    <section className="email-main-card">
      <div className="email-card-head">
        <div>
          <div className="page-eyebrow">Step 1</div>
          <h2>Select Domain</h2>
          <p className="muted">Pick the domain that will receive professional email addresses.</p>
        </div>
        <StatusPill label={selectedStatus.label} tone={selectedStatus.tone} />
      </div>

      {domains.length > 0 ? (
        <div className="email-domain-grid">
          {domains.map((domain) => (
            <button
              key={domain}
              type="button"
              className={`email-domain-option ${selectedDomain === domain ? 'selected' : ''}`}
              onClick={() => onSelectDomain(domain, 'Domain selected')}
            >
              <span className="email-domain-radio" />
              <span>
                <strong>{domain}</strong>
                <small>Use this domain for GlondiaMail setup</small>
              </span>
              <StatusPill label="Connected" tone="green" />
            </button>
          ))}
        </div>
      ) : (
        <div className="email-empty-panel">
          <strong>No connected domains found.</strong>
          <p className="muted">You can buy a new domain or use one you already own.</p>
          <div className="email-inline-actions">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => navigate?.({ view: 'domains-buy' })}
            >
              Buy a domain
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => document.getElementById('manual-domain')?.focus()}>
              Use a domain I already own
            </button>
          </div>
        </div>
      )}

      <div className="email-manual-domain">
        <label className="label" htmlFor="manual-domain">Use a domain I already own</label>
        <div className="email-input-row">
          <input
            id="manual-domain"
            className="input"
            placeholder="example.com"
            value={manualDomain}
            onChange={(event) => setManualDomain(normalizeDomain(event.target.value))}
          />
          <button
            type="button"
            className="btn btn-outline"
            disabled={!isValidDomain(manualDomain)}
            onClick={() => onSelectDomain(manualDomain, 'Manual domain added')}
          >
            Use domain
          </button>
        </div>
        {manualDomain && !isValidDomain(manualDomain) && (
          <p className="email-field-note danger">Enter a domain like example.com.</p>
        )}
      </div>

      <div className="email-card-actions">
        <button className="btn btn-primary" type="button" disabled={!isValidDomain(selectedDomain)} onClick={onContinue}>
          Continue to DNS setup
        </button>
      </div>
    </section>
  );
}

function DnsRecordsStep({ selectedDomain, records, dnsLoading, onBack, onContinue, onCopy }) {
  return (
    <section className="email-main-card">
      <div className="email-card-head">
        <div>
          <div className="page-eyebrow">Step 2</div>
          <h2>Configure DNS</h2>
          <p className="muted">Add these MX, SPF, DKIM, and DMARC records at your DNS provider.</p>
        </div>
        <StatusPill label={selectedDomain || 'No domain'} tone={isValidDomain(selectedDomain) ? 'green' : 'muted'} />
      </div>

      <button className="btn btn-outline email-coming-soon" type="button" disabled>
        Auto-configure DNS - coming soon
      </button>

      {dnsLoading && records.length === 0 ? (
        <div className="email-loading-panel">Loading DNS records...</div>
      ) : records.length === 0 ? (
        <div className="email-empty-panel">
          <strong>No DNS records returned yet.</strong>
          <p className="muted">Choose a valid domain first, then refresh this setup step.</p>
        </div>
      ) : (
        <div className="email-record-grid">
          {records.map((record) => (
            <article className="email-record-card" key={record.id}>
              <div className="email-record-head">
                <div>
                  <span className="email-record-type">{record.type}</span>
                  <h3>{record.purpose}</h3>
                </div>
                <CopyRecordButton
                  value={`${record.type} ${record.host} ${record.priority != null ? `${record.priority} ` : ''}${record.value}`}
                  onCopied={() => onCopy(record)}
                />
              </div>
              <dl className="email-record-fields">
                <div>
                  <dt>Host / name</dt>
                  <dd>{record.host}</dd>
                </div>
                <div>
                  <dt>Type</dt>
                  <dd>{record.type}</dd>
                </div>
                {record.priority != null && (
                  <div>
                    <dt>Priority</dt>
                    <dd>{record.priority}</dd>
                  </div>
                )}
                <div className="wide">
                  <dt>Value</dt>
                  <dd>{record.value}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}

      <div className="email-card-actions">
        <button className="btn btn-outline" type="button" onClick={onBack}>Back</button>
        <button className="btn btn-primary" type="button" disabled={records.length === 0} onClick={onContinue}>
          I have added these records
        </button>
      </div>
    </section>
  );
}

function DnsPropagationStep({ records, dnsCheck, checkingDns, onCheck, onBack, onContinue }) {
  return (
    <section className="email-main-card">
      <div className="email-card-head">
        <div>
          <div className="page-eyebrow">Step 3</div>
          <h2>DNS Propagation</h2>
          <p className="muted">DNS can take time. This check reports what is public right now.</p>
        </div>
        <button className="btn btn-outline" type="button" onClick={onCheck} disabled={checkingDns || records.length === 0}>
          <ICN.ShieldCheck size={14} /> {checkingDns ? 'Checking...' : 'Check DNS records'}
        </button>
      </div>

      {dnsCheck?.message && (
        <div className="email-check-message">{dnsCheck.message}</div>
      )}

      <div className="email-checklist">
        {records.map((record) => {
          const state = getRecordStatus(record, dnsCheck, checkingDns);
          const meta = DNS_STATUS[state] || DNS_STATUS.not_checked;
          return (
            <div className="email-check-row" key={record.id}>
              <span className={`email-status-dot ${meta.tone}`} />
              <div>
                <strong>{record.type} {record.host}</strong>
                <small>{record.purpose}</small>
              </div>
              <StatusPill label={meta.label} tone={meta.tone} />
            </div>
          );
        })}
      </div>

      <div className="email-card-actions">
        <button className="btn btn-outline" type="button" onClick={onBack}>Back</button>
        <button className="btn btn-outline" type="button" onClick={onContinue}>
          I have added these records
        </button>
        <button className="btn btn-primary" type="button" onClick={onContinue}>
          Continue to mailbox
        </button>
      </div>
    </section>
  );
}

function MailboxCreateStep({
  selectedDomain,
  mailboxDraft,
  setMailboxDraft,
  busy,
  error,
  onSubmit,
  onBack,
}) {
  const mailboxName = cleanMailboxName(mailboxDraft.mailboxName);
  const address = mailboxName && selectedDomain ? `${mailboxName}@${selectedDomain}` : '';
  return (
    <section className="email-main-card">
      <div className="email-card-head">
        <div>
          <div className="page-eyebrow">Step 4</div>
          <h2>Create Mailbox</h2>
          <p className="muted">Request a mailbox without passwords. Glondia prepares secure access separately.</p>
        </div>
        {address && <StatusPill label={address} tone="blue" />}
      </div>

      <form className="email-mailbox-form" onSubmit={onSubmit}>
        <div>
          <label className="label" htmlFor="mailbox-name">Mailbox</label>
          <div className="email-mailbox-builder">
            <input
              id="mailbox-name"
              className="input"
              value={mailboxDraft.mailboxName}
              onChange={(event) => setMailboxDraft((draft) => ({ ...draft, mailboxName: cleanMailboxName(event.target.value) }))}
              placeholder="info"
              required
            />
            <span>@ {selectedDomain || 'domain.com'}</span>
          </div>
        </div>

        <div className="email-preset-row">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`email-preset ${mailboxName === preset ? 'selected' : ''}`}
              onClick={() => setMailboxDraft((draft) => ({ ...draft, mailboxName: preset }))}
            >
              {preset}
            </button>
          ))}
        </div>

        <div>
          <label className="label" htmlFor="mailbox-display-name">Display name</label>
          <input
            id="mailbox-display-name"
            className="input"
            value={mailboxDraft.displayName}
            onChange={(event) => setMailboxDraft((draft) => ({ ...draft, displayName: event.target.value }))}
            placeholder="Sales Team"
          />
        </div>

        <div>
          <label className="label" htmlFor="mailbox-notes">Purpose / notes</label>
          <textarea
            id="mailbox-notes"
            className="input"
            rows={4}
            value={mailboxDraft.notes}
            onChange={(event) => setMailboxDraft((draft) => ({ ...draft, notes: event.target.value }))}
            placeholder="Who should receive this mailbox and what service it supports."
          />
        </div>

        {error && <div className="email-field-note danger">{error}</div>}

        <div className="email-card-actions">
          <button className="btn btn-outline" type="button" onClick={onBack}>Back</button>
          <button className="btn btn-primary" type="submit" disabled={busy || !mailboxName || !isValidDomain(selectedDomain)}>
            {busy ? 'Preparing mailbox...' : 'Request mailbox'}
          </button>
        </div>
      </form>
    </section>
  );
}

function MailboxReadyStep({ selectedDomain, activeMailbox, createdMailbox, onOpen, onDns, onPropagation }) {
  const pendingAddress = mailboxAddress(createdMailbox);
  return (
    <section className="email-main-card">
      <div className="email-card-head">
        <div>
          <div className="page-eyebrow">Step 5</div>
          <h2>Ready for GlondiaMail</h2>
          <p className="muted">Open GlondiaMail once your mailbox is active.</p>
        </div>
        <StatusPill label={activeMailbox ? 'Active' : 'Pending'} tone={activeMailbox ? 'green' : 'amber'} />
      </div>

      {activeMailbox ? (
        <div className="email-ready-panel active">
          <ICN.Mail size={24} />
          <div>
            <strong>{mailboxAddress(activeMailbox)}</strong>
            <p className="muted">Domain: {activeMailbox.domain || selectedDomain}</p>
            <StatusPill label="Active" tone="green" />
          </div>
        </div>
      ) : (
        <div className="email-ready-panel">
          <ICN.Mail size={24} />
          <div>
            <strong>{pendingAddress || `Mailbox for ${selectedDomain || 'your domain'}`}</strong>
            <p className="muted">
              This is waiting on setup or activation. DNS may still be propagating, and the mailbox request stays safe here.
            </p>
          </div>
        </div>
      )}

      <div className="email-card-actions">
        <button className="btn btn-primary" type="button" onClick={onOpen}>
          Open GlondiaMail
        </button>
        <button className="btn btn-outline" type="button" onClick={onPropagation}>
          Check DNS
        </button>
        <button className="btn btn-outline" type="button" onClick={onDns}>
          View DNS
        </button>
        <button className="btn btn-ghost" type="button" disabled title="Coming soon">
          Send setup link
        </button>
      </div>
    </section>
  );
}

function SetupSummary({ status, selectedDomain, domains, dnsCheck, mailboxes, activeMailbox, onRefresh, onOpen }) {
  const selectedStatus = domainStatus(selectedDomain, domains);
  const domainMailboxes = mailboxes.filter((box) => box.domain === selectedDomain);
  const dnsState = dnsCheck ? normalizeRecordStatus(dnsCheck.status || dnsCheck.result || 'waiting') : 'not_checked';
  const dnsMeta = DNS_STATUS[dnsState] || DNS_STATUS.not_checked;
  return (
    <aside className="email-summary-card">
      <div className="email-summary-head">
        <div>
          <div className="page-eyebrow">Setup summary</div>
          <h3>{selectedDomain || 'No domain selected'}</h3>
        </div>
        <button className="btn btn-sm btn-outline" type="button" onClick={onRefresh}>
          <ICN.RefreshCw size={13} /> Refresh
        </button>
      </div>
      <div className="email-summary-list">
        <div>
          <span>Provider</span>
          <StatusPill label={status?.configured ? 'Configured' : 'Not configured'} tone={status?.configured ? 'green' : 'amber'} />
        </div>
        <div>
          <span>Domain</span>
          <StatusPill label={selectedStatus.label} tone={selectedStatus.tone} />
        </div>
        <div>
          <span>DNS</span>
          <StatusPill label={dnsMeta.label} tone={dnsMeta.tone} />
        </div>
        <div>
          <span>Mailboxes</span>
          <strong>{domainMailboxes.length}</strong>
        </div>
        <div>
          <span>GlondiaMail</span>
          <StatusPill label={activeMailbox ? 'Ready' : 'Pending'} tone={activeMailbox ? 'green' : 'amber'} />
        </div>
      </div>
      {status?.message && <p className="email-summary-note">{status.message}</p>}
      <button className="btn btn-primary email-full-width" type="button" onClick={onOpen}>
        <ICN.Mail size={14} /> Open GlondiaMail
      </button>
    </aside>
  );
}

function ActivityTimeline({ events }) {
  return (
    <section className="email-timeline-card">
      <div className="page-eyebrow">Activity timeline</div>
      <div className="email-timeline">
        {events.map((event) => (
          <div className="email-timeline-event" key={event.id}>
            <span className="email-timeline-dot" />
            <div>
              <strong>{event.title}</strong>
              <p>{event.detail}</p>
            </div>
            <time>{event.time}</time>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function EmailManagementPage({ navigate }) {
  const [status, setStatus] = useState(null);
  const [mailboxes, setMailboxes] = useState([]);
  const [domains, setDomains] = useState([]);
  const [selectedDomain, setSelectedDomain] = useState('');
  const [manualDomain, setManualDomain] = useState('');
  const [dns, setDns] = useState(null);
  const [dnsCheck, setDnsCheck] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dnsLoading, setDnsLoading] = useState(false);
  const [checkingDns, setCheckingDns] = useState(false);
  const [error, setError] = useState('');
  const [mailboxError, setMailboxError] = useState('');
  const [busy, setBusy] = useState(false);
  const [currentStep, setCurrentStep] = useState('domain');
  const [createdMailbox, setCreatedMailbox] = useState(null);
  const [mailboxDraft, setMailboxDraft] = useState({
    mailboxName: '',
    displayName: '',
    notes: '',
  });
  const [setupEvents, setSetupEvents] = useState(() => [
    makeEvent('Setup started', 'Choose a domain to begin Business Email setup.'),
  ]);

  const addEvent = useCallback((title, detail) => {
    setSetupEvents((events) => [...events, makeEvent(title, detail)].slice(-8));
  }, []);

  const webmailUrl = status?.webmailUrl || '/mailboxes';
  const records = useMemo(() => normalizeRecords(dns), [dns]);

  const selectedDomainMailboxes = useMemo(
    () => mailboxes.filter((box) => box.domain === selectedDomain),
    [mailboxes, selectedDomain],
  );

  const activeMailbox = useMemo(
    () => selectedDomainMailboxes.find(isActiveMailbox),
    [selectedDomainMailboxes],
  );

  const completed = useMemo(() => ({
    domain: isValidDomain(selectedDomain),
    dns: records.length > 0,
    propagation: Boolean(dnsCheck),
    mailbox: Boolean(createdMailbox) || selectedDomainMailboxes.length > 0,
    ready: Boolean(activeMailbox),
  }), [activeMailbox, createdMailbox, dnsCheck, records.length, selectedDomain, selectedDomainMailboxes.length]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [st, boxes] = await Promise.all([
        getEmailStatus(),
        listEmailMailboxes(),
      ]);
      const mailboxList = Array.isArray(boxes?.mailboxes) ? boxes.mailboxes : [];
      setStatus(st);
      setMailboxes(mailboxList);

      let domainList = [];
      if (isLiveMode()) {
        try {
          const registered = await listRegisteredDomains(0, 100);
          const items = Array.isArray(registered?.items)
            ? registered.items
            : (Array.isArray(registered) ? registered : []);
          domainList = items.map((domain) => domain.name || domain.hostname || domain.domain).filter(Boolean);
        } catch {
          domainList = [];
        }
      }
      for (const mailbox of mailboxList) {
        if (mailbox.domain && !domainList.includes(mailbox.domain)) domainList.push(mailbox.domain);
      }
      domainList = [...new Set(domainList.map(normalizeDomain).filter(Boolean))];
      setDomains(domainList);
      setSelectedDomain((current) => current || domainList[0] || '');
    } catch (err) {
      setError(err.message || 'Could not load Business Email setup.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDns = useCallback(async (domain) => {
    if (!isValidDomain(domain)) {
      setDns(null);
      setDnsCheck(null);
      return;
    }
    setDnsLoading(true);
    try {
      const data = await getEmailDnsRecords(domain);
      setDns(data);
      setDnsCheck(null);
    } catch (err) {
      setDns(null);
      setError(err.message || 'Could not load DNS records.');
    } finally {
      setDnsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    loadDns(selectedDomain);
  }, [loadDns, selectedDomain]);

  const selectDomain = (domain, eventTitle) => {
    const clean = normalizeDomain(domain);
    setSelectedDomain(clean);
    setManualDomain(clean);
    setCurrentStep('domain');
    addEvent(eventTitle, `${clean} is selected for Business Email.`);
  };

  const checkDns = async () => {
    if (!isValidDomain(selectedDomain)) return;
    setCheckingDns(true);
    setError('');
    try {
      const result = await checkEmailDns(selectedDomain);
      setDnsCheck(result);
      addEvent('DNS records checked', result?.message || `${selectedDomain} DNS was checked.`);
    } catch (err) {
      setError(err.message || 'DNS check failed.');
      addEvent('DNS check needs attention', err.message || 'The DNS check could not complete.');
    } finally {
      setCheckingDns(false);
    }
  };

  const markDnsAdded = () => {
    setDnsCheck((current) => current || {
      status: 'waiting',
      message: 'Records marked as added. DNS propagation can take a few minutes or longer.',
      records: records.map((record) => ({ id: record.id, type: record.type, host: record.host, status: 'waiting' })),
    });
    addEvent('DNS records marked as added', 'Waiting for public DNS propagation.');
    setCurrentStep('mailbox');
  };

  const submitMailbox = async (event) => {
    event.preventDefault();
    setMailboxError('');
    const mailboxName = cleanMailboxName(mailboxDraft.mailboxName);
    if (!isValidDomain(selectedDomain) || !mailboxName) {
      setMailboxError('Choose a valid domain and mailbox name.');
      return;
    }
    setBusy(true);
    addEvent('Preparing mailbox', `${mailboxName}@${selectedDomain} request is being submitted.`);
    try {
      const result = await requestEmailMailbox({
        domain: selectedDomain,
        mailboxName,
        displayName: mailboxDraft.displayName,
        notes: mailboxDraft.notes,
      });
      const mailbox = result?.mailbox || result || {
        email: `${mailboxName}@${selectedDomain}`,
        domain: selectedDomain,
        mailboxName,
        status: 'pending_setup',
      };
      setCreatedMailbox(mailbox);
      addEvent('Mailbox request submitted', `${mailboxName}@${selectedDomain} is pending activation.`);
      setMailboxDraft({ mailboxName: '', displayName: '', notes: '' });
      await refresh();
      setCurrentStep('ready');
    } catch (err) {
      setMailboxError(err.message || 'Could not submit mailbox request.');
      addEvent('Mailbox request failed', err.message || 'The request could not be submitted.');
    } finally {
      setBusy(false);
    }
  };

  const renderCurrentStep = () => {
    if (currentStep === 'domain') {
      return (
        <DomainSetupStep
          domains={domains}
          selectedDomain={selectedDomain}
          manualDomain={manualDomain}
          setManualDomain={setManualDomain}
          onSelectDomain={selectDomain}
          navigate={navigate}
          onContinue={() => {
            addEvent('Domain confirmed', `${selectedDomain} is ready for DNS setup.`);
            setCurrentStep('dns');
          }}
        />
      );
    }
    if (currentStep === 'dns') {
      return (
        <DnsRecordsStep
          selectedDomain={selectedDomain}
          records={records}
          dnsLoading={dnsLoading}
          onBack={() => setCurrentStep('domain')}
          onContinue={() => {
            addEvent('DNS instructions reviewed', `Records for ${selectedDomain} are ready to add.`);
            setCurrentStep('propagation');
          }}
          onCopy={(record) => addEvent(`${record.type} record copied`, `${record.host} value copied for DNS setup.`)}
        />
      );
    }
    if (currentStep === 'propagation') {
      return (
        <DnsPropagationStep
          records={records}
          dnsCheck={dnsCheck}
          checkingDns={checkingDns}
          onCheck={checkDns}
          onBack={() => setCurrentStep('dns')}
          onContinue={markDnsAdded}
        />
      );
    }
    if (currentStep === 'mailbox') {
      return (
        <MailboxCreateStep
          selectedDomain={selectedDomain}
          mailboxDraft={mailboxDraft}
          setMailboxDraft={setMailboxDraft}
          busy={busy}
          error={mailboxError}
          onSubmit={submitMailbox}
          onBack={() => setCurrentStep('propagation')}
        />
      );
    }
    return (
      <MailboxReadyStep
        selectedDomain={selectedDomain}
        activeMailbox={activeMailbox}
        createdMailbox={createdMailbox || selectedDomainMailboxes[0]}
        onOpen={() => openMailboxes(webmailUrl)}
        onDns={() => setCurrentStep('dns')}
        onPropagation={() => setCurrentStep('propagation')}
      />
    );
  };

  return (
    <>
      <style>{`
        .email-setup-shell { display: grid; gap: 18px; }
        .email-setup-stepper { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
        .email-step { border: 1px solid var(--border); background: var(--card); color: var(--text); border-radius: 8px; padding: 12px; display: flex; gap: 10px; text-align: left; align-items: center; min-height: 74px; transition: border-color .18s ease, transform .18s ease, background .18s ease; }
        .email-step:not(:disabled) { cursor: pointer; }
        .email-step:disabled { opacity: .55; cursor: not-allowed; }
        .email-step.current { border-color: var(--border-strong); background: var(--bg-deep); color: var(--text); transform: translateY(-1px); box-shadow: inset 0 0 0 1px var(--border); }
        .email-step.done .email-step-index { background: var(--accent); color: white; }
        .email-step-index { width: 30px; height: 30px; flex: 0 0 30px; border-radius: 999px; background: var(--bg-deep); border: 1px solid var(--border); display: grid; place-items: center; font-size: 11px; font-weight: 800; }
        .email-step strong { display: block; font-size: 13px; }
        .email-step small { display: block; color: var(--muted); font-size: 11px; margin-top: 3px; line-height: 1.3; }
        .email-setup-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 18px; align-items: start; }
        .email-main-card, .email-summary-card, .email-timeline-card { border: 1px solid var(--border); background: var(--card); border-radius: 8px; padding: 18px; box-shadow: var(--shadow-sm, none); }
        .email-card-head, .email-summary-head, .email-record-head, .email-check-row, .email-timeline-event { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; }
        .email-card-head { margin-bottom: 18px; }
        .email-card-head h2, .email-summary-head h3 { margin: 4px 0 4px; font-size: 22px; letter-spacing: 0; }
        .email-card-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 18px; }
        .email-domain-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
        .email-domain-option { border: 1px solid var(--border); background: var(--bg-deep); color: var(--text); border-radius: 8px; padding: 14px; display: flex; align-items: center; gap: 12px; text-align: left; cursor: pointer; transition: border-color .18s ease, transform .18s ease; }
        .email-domain-option.selected { border-color: var(--accent); transform: translateY(-1px); }
        .email-domain-option strong { display: block; word-break: break-word; }
        .email-domain-option small { display: block; color: var(--muted); font-size: 12px; margin-top: 3px; }
        .email-domain-radio { width: 14px; height: 14px; border-radius: 999px; border: 2px solid var(--accent); box-shadow: inset 0 0 0 3px var(--bg-deep); background: transparent; flex: 0 0 14px; }
        .email-domain-option.selected .email-domain-radio { background: var(--accent); }
        .email-empty-panel, .email-loading-panel, .email-check-message, .email-ready-panel { border: 1px dashed var(--border); border-radius: 8px; background: var(--bg-deep); padding: 16px; }
        .email-inline-actions, .email-input-row, .email-preset-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
        .email-manual-domain { margin-top: 18px; }
        .email-input-row .input { min-width: 240px; flex: 1; }
        .email-field-note { font-size: 12px; margin: 6px 0 0; color: var(--muted); }
        .email-field-note.danger { color: var(--danger); }
        .email-coming-soon { margin-bottom: 14px; }
        .email-record-grid { display: grid; gap: 12px; }
        .email-record-card { border: 1px solid var(--border); background: var(--bg-deep); border-radius: 8px; padding: 15px; }
        .email-record-type { display: inline-grid; place-items: center; min-width: 44px; height: 24px; border-radius: 6px; background: var(--accent-soft); color: var(--accent); font-size: 12px; font-weight: 800; }
        .email-record-card h3 { margin: 8px 0 0; font-size: 15px; letter-spacing: 0; }
        .email-record-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 14px 0 0; }
        .email-record-fields div { min-width: 0; }
        .email-record-fields .wide { grid-column: 1 / -1; }
        .email-record-fields dt { color: var(--muted); font-size: 11px; text-transform: uppercase; font-weight: 800; margin-bottom: 4px; }
        .email-record-fields dd { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; word-break: break-all; }
        .email-copy-btn.copied { animation: emailPulse .9s ease; border-color: var(--accent); }
        .email-checklist { display: grid; gap: 10px; }
        .email-check-row { border: 1px solid var(--border); background: var(--bg-deep); border-radius: 8px; padding: 13px; align-items: center; }
        .email-check-row div { flex: 1; min-width: 0; }
        .email-check-row strong { display: block; font-size: 14px; }
        .email-check-row small { display: block; color: var(--muted); font-size: 12px; margin-top: 3px; }
        .email-status-dot { width: 10px; height: 10px; border-radius: 999px; background: var(--muted); flex: 0 0 10px; }
        .email-status-dot.green { background: var(--accent); }
        .email-status-dot.amber { background: #b8860b; }
        .email-status-dot.red { background: var(--danger); }
        .email-status-dot.blue { background: #2563eb; }
        .email-mailbox-form { display: grid; gap: 14px; }
        .email-mailbox-builder { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; border: 1px solid var(--border); border-radius: 8px; padding: 8px; background: var(--bg-deep); }
        .email-mailbox-builder .input { border: 0; background: transparent; padding-left: 6px; }
        .email-mailbox-builder span { color: var(--muted); font-weight: 700; padding-right: 8px; word-break: break-word; }
        .email-preset { border: 1px solid var(--border); background: var(--bg-deep); color: var(--text); border-radius: 999px; padding: 7px 12px; cursor: pointer; font-size: 13px; }
        .email-preset.selected { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
        .email-ready-panel { display: flex; gap: 14px; align-items: flex-start; }
        .email-ready-panel.active { border-style: solid; border-color: var(--accent); }
        .email-summary-card { position: sticky; top: 16px; }
        .email-summary-list { display: grid; gap: 12px; margin-top: 16px; }
        .email-summary-list > div { display: flex; justify-content: space-between; gap: 10px; align-items: center; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
        .email-summary-list span { color: var(--muted); font-size: 13px; }
        .email-summary-note { color: var(--muted); font-size: 13px; line-height: 1.5; margin: 14px 0; }
        .email-full-width { width: 100%; justify-content: center; }
        .email-setup-pill { display: inline-flex; align-items: center; justify-content: center; padding: 0; font-size: 12px; font-weight: 800; white-space: nowrap; background: transparent; color: var(--muted); border: 0; }
        .email-setup-pill.green { color: var(--accent); }
        .email-setup-pill.amber { color: #9a6700; }
        .email-setup-pill.red { color: #c0392b; }
        .email-setup-pill.blue { color: #2563eb; }
        .email-timeline-card { margin-top: 2px; }
        .email-timeline { display: grid; gap: 12px; margin-top: 14px; }
        .email-timeline-event { align-items: flex-start; justify-content: flex-start; }
        .email-timeline-event div { flex: 1; min-width: 0; }
        .email-timeline-event p { margin: 3px 0 0; color: var(--muted); font-size: 13px; }
        .email-timeline-event time { color: var(--muted); font-size: 12px; white-space: nowrap; }
        .email-timeline-dot { width: 10px; height: 10px; border-radius: 999px; background: var(--accent); margin-top: 5px; flex: 0 0 10px; }
        @keyframes emailPulse { 0% { box-shadow: 0 0 0 0 rgba(42, 122, 226, .35); } 100% { box-shadow: 0 0 0 10px rgba(42, 122, 226, 0); } }
        @media (max-width: 980px) {
          .email-setup-stepper { grid-template-columns: 1fr; }
          .email-setup-grid { grid-template-columns: 1fr; }
          .email-summary-card { position: static; }
        }
        @media (max-width: 640px) {
          .email-card-head, .email-summary-head, .email-record-head, .email-check-row { flex-direction: column; align-items: stretch; }
          .email-record-fields { grid-template-columns: 1fr; }
          .email-mailbox-builder { grid-template-columns: 1fr; }
          .email-input-row { display: grid; grid-template-columns: 1fr; }
          .email-input-row .input { min-width: 0; }
        }
      `}</style>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">Email</div>
          <h1>Business Email Setup</h1>
          <p className="sub">Set up professional mailboxes for your domain and connect them to GlondiaMail.</p>
        </div>
        <div className="actions">
          <button className="btn btn-outline" onClick={refresh} disabled={loading}>
            <ICN.RefreshCw size={14} /> Refresh
          </button>
          <button className="btn btn-primary" type="button" onClick={() => openMailboxes(webmailUrl)}>
            <ICN.Mail size={14} /> Open GlondiaMail
          </button>
        </div>
      </div>

      {error && <div className="email-check-message" style={{ color: 'var(--danger)', marginBottom: 14 }}>{error}</div>}

      <div className="email-setup-shell">
        <SetupStepper currentStep={currentStep} completed={completed} onStep={setCurrentStep} />
        <div className="email-setup-grid">
          {renderCurrentStep()}
          <SetupSummary
            status={status}
            selectedDomain={selectedDomain}
            domains={domains}
            dnsCheck={dnsCheck}
            mailboxes={mailboxes}
            activeMailbox={activeMailbox}
            onRefresh={refresh}
            onOpen={() => openMailboxes(webmailUrl)}
          />
        </div>
        <ActivityTimeline events={setupEvents} />
      </div>
    </>
  );
}
