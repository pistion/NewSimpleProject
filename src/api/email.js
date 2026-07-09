/**
 * Dashboard Business Email API client.
 * Setup / DNS / mailbox requests only — never passwords or provider secrets.
 */
import { liveApiRequest } from '../api.js';

function soft(err, fallback) {
  if (err?.status === 503 || err?.status === 404 || err?.status === 401) {
    return { ...fallback, error: err.message };
  }
  throw err;
}

export async function getEmailStatus() {
  try {
    return await liveApiRequest('/v1/email/status');
  } catch (err) {
    return soft(err, {
      configured: false,
      dnsVerified: false,
      dnsStatus: 'setup_required',
      mailboxCount: 0,
      domainCount: 0,
      webmailUrl: '/mailboxes',
      message: err.message || 'Email status unavailable.',
    });
  }
}

export async function listEmailMailboxes() {
  try {
    const data = await liveApiRequest('/v1/email/mailboxes');
    return {
      mailboxes: Array.isArray(data?.mailboxes) ? data.mailboxes : (Array.isArray(data) ? data : []),
      webmailUrl: data?.webmailUrl || '/mailboxes',
      webmailConfigured: Boolean(data?.webmailConfigured ?? true),
    };
  } catch (err) {
    return soft(err, { mailboxes: [], webmailUrl: '/mailboxes', webmailConfigured: false });
  }
}

/** @deprecated use listEmailMailboxes */
export async function listMailboxes() {
  return listEmailMailboxes();
}

export async function requestEmailMailbox(body) {
  return liveApiRequest('/v1/email/mailboxes/request', {
    method: 'POST',
    body: JSON.stringify({
      domain: String(body.domain || '').trim(),
      mailboxName: String(body.mailboxName || '').trim(),
      displayName: String(body.displayName || '').trim(),
      notes: String(body.notes || '').trim(),
    }),
  });
}

/** @deprecated use requestEmailMailbox */
export async function requestMailbox(body) {
  return requestEmailMailbox(body);
}

export async function getEmailDnsRecords(domain) {
  const d = encodeURIComponent(String(domain || '').trim());
  return liveApiRequest(`/v1/email/dns/${d}`);
}

export async function checkEmailDns(domain) {
  const d = encodeURIComponent(String(domain || '').trim());
  return liveApiRequest(`/v1/email/dns/${d}/check`, { method: 'POST', body: '{}' });
}
