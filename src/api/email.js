/**
 * Business Email API client.
 * Never handles mailbox passwords or provider secrets.
 */
import { liveApiRequest } from '../api.js';

/** List mailboxes for the signed-in user. Returns { mailboxes, webmailUrl } or graceful empty. */
export async function listMailboxes() {
  try {
    const data = await liveApiRequest('/v1/email/mailboxes');
    return {
      mailboxes: Array.isArray(data?.mailboxes) ? data.mailboxes : (Array.isArray(data) ? data : []),
      webmailUrl: data?.webmailUrl || null,
      webmailConfigured: Boolean(data?.webmailConfigured),
    };
  } catch (err) {
    // Backend missing or feature off — UI still renders with empty state.
    if (err?.status === 503 || err?.status === 404 || err?.status === 401) {
      return { mailboxes: [], webmailUrl: null, webmailConfigured: false, error: err.message };
    }
    throw err;
  }
}

/**
 * Submit a mailbox setup request.
 * @param {{ domain: string, mailboxName: string, notes?: string }} body
 */
export async function requestMailbox(body) {
  return liveApiRequest('/v1/email/requests', {
    method: 'POST',
    body: JSON.stringify({
      domain: String(body.domain || '').trim(),
      mailboxName: String(body.mailboxName || '').trim(),
      notes: String(body.notes || '').trim(),
    }),
  });
}
