/**
 * glondia-mail.service.js — GlondiaMail webmail (read/send).
 *
 * Separate from Dashboard Business Email setup.
 * IMAP/SMTP credentials stay server-side only.
 * Never logs or returns mailbox passwords.
 * MVP: safe disabled responses until IMAP/SMTP is configured.
 */

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim();
}

export function getMailProviderConfig() {
  const imapHost = env('GLONDIA_MAIL_IMAP_HOST');
  const smtpHost = env('GLONDIA_MAIL_SMTP_HOST');
  const imapPort = Number(env('GLONDIA_MAIL_IMAP_PORT', '993')) || 993;
  const smtpPort = Number(env('GLONDIA_MAIL_SMTP_PORT', '465')) || 465;
  const configured = Boolean(imapHost && smtpHost);

  return {
    configured,
    // Never expose passwords or secrets — hostnames/ports only for status UI.
    imap: configured ? { host: imapHost, port: imapPort, secure: imapPort === 993 } : null,
    smtp: configured ? { host: smtpHost, port: smtpPort, secure: smtpPort === 465 || smtpPort === 587 } : null,
    message: configured
      ? 'GlondiaMail provider hosts are set. Full IMAP/SMTP session handling will connect server-side only.'
      : 'GlondiaMail connection is being prepared. IMAP/SMTP is not configured yet.',
  };
}

function disabledPayload(extra = {}) {
  const cfg = getMailProviderConfig();
  return {
    enabled: false,
    configured: cfg.configured,
    message: cfg.message,
    folders: [],
    messages: [],
    ...extra,
  };
}

/** Session check — no fake logged-in user when IMAP is off. */
export async function getSession(req) {
  const cfg = getMailProviderConfig();
  if (!cfg.configured) {
    return {
      authenticated: false,
      enabled: false,
      configured: false,
      message: 'GlondiaMail connection is being prepared.',
      mailbox: null,
    };
  }
  // Future: validate opaque server-side session cookie. No password in response.
  const session = req.glondiaMailSession || null;
  return {
    authenticated: Boolean(session?.mailbox),
    enabled: true,
    configured: true,
    message: session?.mailbox
      ? 'Signed in to GlondiaMail.'
      : 'Sign in with your mailbox address. Passwords are verified server-side only.',
    mailbox: session?.mailbox || null,
  };
}

export async function login(body = {}) {
  const cfg = getMailProviderConfig();
  if (!cfg.configured) {
    const err = new Error('GlondiaMail connection is being prepared. IMAP/SMTP is not configured yet.');
    err.status = 503;
    err.code = 'GLONDIA_MAIL_NOT_CONFIGURED';
    throw err;
  }

  const email = String(body.email || body.mailbox || '').trim().toLowerCase();
  const password = body.password; // never log or return
  if (!email || !String(email).includes('@')) {
    const err = new Error('Enter a valid mailbox email address.');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  if (!password || String(password).length < 1) {
    const err = new Error('Password is required.');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  // Intentionally do not authenticate against a real provider until IMAP client is wired.
  // Clear password from memory path as much as possible.
  void password;

  const err = new Error('GlondiaMail IMAP login is not enabled yet. Your password was not stored.');
  err.status = 503;
  err.code = 'GLONDIA_MAIL_LOGIN_PENDING';
  throw err;
}

export async function logout() {
  return { ok: true, message: 'Signed out of GlondiaMail.' };
}

export async function listFolders() {
  const cfg = getMailProviderConfig();
  if (!cfg.configured) return disabledPayload();
  // No fake mailboxes — empty until IMAP is live.
  return {
    enabled: true,
    configured: true,
    message: 'Folders will appear after IMAP is connected.',
    folders: [
      { id: 'inbox', name: 'Inbox', role: 'inbox' },
      { id: 'starred', name: 'Starred', role: 'starred' },
      { id: 'sent', name: 'Sent', role: 'sent' },
      { id: 'drafts', name: 'Drafts', role: 'drafts' },
      { id: 'spam', name: 'Spam', role: 'spam' },
      { id: 'trash', name: 'Trash', role: 'trash' },
      { id: 'archive', name: 'Archive', role: 'archive' },
    ],
  };
}

export async function listMessages(query = {}) {
  const cfg = getMailProviderConfig();
  if (!cfg.configured) return disabledPayload({ folder: query.folder || 'inbox' });
  // Never invent real-looking mail.
  return {
    enabled: true,
    configured: true,
    folder: query.folder || 'inbox',
    messages: [],
    message: 'No messages yet. Inbox sync will use server-side IMAP when enabled.',
  };
}

export async function getMessage(id) {
  const cfg = getMailProviderConfig();
  if (!cfg.configured) {
    const err = new Error('GlondiaMail connection is being prepared.');
    err.status = 503;
    err.code = 'GLONDIA_MAIL_NOT_CONFIGURED';
    throw err;
  }
  const err = new Error('Message not found.');
  err.status = 404;
  err.code = 'NOT_FOUND';
  throw err;
}

export async function sendMail(body = {}) {
  const cfg = getMailProviderConfig();
  if (!cfg.configured) {
    const err = new Error('GlondiaMail connection is being prepared. Cannot send mail yet.');
    err.status = 503;
    err.code = 'GLONDIA_MAIL_NOT_CONFIGURED';
    throw err;
  }
  // Do not accept/store passwords here; sending uses server SMTP session later.
  void body;
  const err = new Error('SMTP send is not enabled yet.');
  err.status = 503;
  err.code = 'GLONDIA_MAIL_SEND_PENDING';
  throw err;
}
