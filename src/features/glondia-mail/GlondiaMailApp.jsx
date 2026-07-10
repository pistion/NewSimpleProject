/**
 * Mailboxes — separate full-page webmail on the same site.
 * Routes: /mailboxes, /mail, /glondiamail
 *
 * - Login looks like the Glondia dashboard auth screen
 * - Inside: classic mail layout (folders + list + reading pane)
 * - No fake real messages. Passwords never stored in localStorage.
 */
import React from 'react';
import { ICN } from '../../icons';
import { isFeatureEnabled } from '../../app/features.js';
import {
  getMailSession,
  loginMail,
  logoutMail,
  listMailFolders,
  listMailMessages,
  getMailMessage,
} from '../../api/glondiaMail.js';

const { useState, useEffect, useCallback, useMemo } = React;

const PREVIEW_KEY = 'glondia.mailboxes.preview';

const FOLDERS = [
  { id: 'inbox', name: 'Inbox', icon: 'Inbox' },
  { id: 'starred', name: 'Starred', icon: 'Star' },
  { id: 'sent', name: 'Sent', icon: 'Send' },
  { id: 'drafts', name: 'Drafts', icon: 'File' },
  { id: 'spam', name: 'Spam', icon: 'AlertCircle' },
  { id: 'trash', name: 'Trash', icon: 'Trash' },
  { id: 'archive', name: 'Archive', icon: 'Archive' },
];

function readPreview() {
  try {
    const raw = sessionStorage.getItem(PREVIEW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.mailbox) return parsed;
  } catch { /* ignore */ }
  return null;
}

function writePreview(mailbox) {
  try {
    sessionStorage.setItem(PREVIEW_KEY, JSON.stringify({ mailbox, at: Date.now() }));
  } catch { /* ignore */ }
}

function clearPreview() {
  try { sessionStorage.removeItem(PREVIEW_KEY); } catch { /* ignore */ }
}

export default function GlondiaMailApp() {
  if (!isFeatureEnabled('glondiaMail')) {
    return (
      <div style={S.page}>
        <div style={S.box}>
          <div style={S.head}>
            <div style={S.headBrand}><ICN.Mail size={16} /></div>
            <div style={S.titleBar}>Mailboxes — offline</div>
          </div>
          <div style={S.body}>
            <div style={S.eyebrow}><span style={S.pulse} /> Feature off</div>
            <h1 style={S.h1}>Mailboxes unavailable</h1>
            <p style={S.sub}>Enable VITE_FEATURE_GLONDIA_MAIL to use business mailboxes.</p>
            <a href="/" style={S.linkBack}>← Back to Glondia</a>
          </div>
        </div>
      </div>
    );
  }

  return <MailboxesApp />;
}

function MailboxesApp() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [folder, setFolder] = useState('inbox');
  const [messages, setMessages] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [listMsg, setListMsg] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [previewMode, setPreviewMode] = useState(false);

  const refreshSession = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getMailSession();
      if (s?.authenticated && s?.mailbox) {
        setSession(s);
        setPreviewMode(false);
        clearPreview();
      } else {
        const prev = readPreview();
        if (prev?.mailbox) {
          setSession({
            authenticated: true,
            configured: s?.configured === true,
            enabled: false,
            message: s?.message || 'Mail connection is being prepared. You can explore the Mailboxes interface.',
            mailbox: prev.mailbox,
            preview: true,
          });
          setPreviewMode(true);
        } else {
          setSession(s || { authenticated: false, configured: false });
          setPreviewMode(false);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshSession(); }, [refreshSession]);

  useEffect(() => {
    if (!session?.authenticated) return;
    let cancelled = false;
    setSelectedId(null);
    setSelected(null);
    (async () => {
      try {
        const data = await listMailMessages(folder);
        if (cancelled) return;
        setMessages(Array.isArray(data?.messages) ? data.messages : []);
        setListMsg(data?.message || (previewMode
          ? 'No messages yet. Your mailbox will sync when mail hosting is connected.'
          : ''));
      } catch {
        if (!cancelled) {
          setMessages([]);
          setListMsg('Could not load messages.');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [session?.authenticated, folder, previewMode]);

  const openMessage = async (id) => {
    setSelectedId(id);
    const local = messages.find((m) => m.id === id);
    if (local?.body) {
      setSelected(local);
      return;
    }
    try {
      const msg = await getMailMessage(id);
      setSelected(msg);
    } catch {
      setSelected(local || { id, subject: '(unavailable)', body: '' });
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) =>
      [m.subject, m.from, m.preview, m.to].filter(Boolean).some((t) => String(t).toLowerCase().includes(q))
    );
  }, [messages, search]);

  const signOut = async () => {
    clearPreview();
    await logoutMail();
    setSession({ authenticated: false, configured: session?.configured });
    setPreviewMode(false);
    setMessages([]);
    setSelected(null);
  };

  if (loading && !session) {
    return (
      <div style={S.page}>
        <div style={{ color: '#9a9f98', fontFamily: sans, fontSize: 14 }}>Loading mailboxes…</div>
      </div>
    );
  }

  if (!session?.authenticated) {
    return (
      <MailboxLogin
        session={session}
        onSuccess={async (mailbox, meta = {}) => {
          if (meta.preview) {
            writePreview(mailbox);
            setPreviewMode(true);
            setSession({
              authenticated: true,
              configured: false,
              enabled: false,
              preview: true,
              mailbox,
              message: 'Mail connection is being prepared. Interface is ready; messages will appear when hosting is live.',
            });
          } else {
            clearPreview();
            setPreviewMode(false);
            await refreshSession();
          }
        }}
      />
    );
  }

  const folderMeta = FOLDERS.find((f) => f.id === folder) || FOLDERS[0];

  return (
    <div style={M.shell} data-theme="dark">
      {/* Top bar */}
      <header style={M.topbar}>
        <div style={M.brand}>
          <div style={M.brandMark}><ICN.Mail size={18} /></div>
          <div>
            <div style={M.brandTitle}>Mailboxes</div>
            <div style={M.brandSub}>Glondia business mail</div>
          </div>
        </div>

        <div style={M.searchWrap}>
          <ICN.Search size={14} style={{ color: '#6c757d' }} />
          <input
            style={M.search}
            placeholder={`Search ${folderMeta.name.toLowerCase()}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div style={M.topActions}>
          <button type="button" style={M.btnPrimary} onClick={() => setComposeOpen(true)}>
            <ICN.Plus size={14} /> Compose
          </button>
          <div style={M.userChip}>
            <div style={M.avatar}>{(session.mailbox || '?')[0].toUpperCase()}</div>
            <span style={M.userEmail}>{session.mailbox}</span>
          </div>
          <a href="/" style={M.btnGhost}>Dashboard</a>
          <button type="button" style={M.btnGhost} onClick={signOut}>Sign out</button>
        </div>
      </header>

      {(previewMode || session.configured === false) && (
        <div style={M.banner}>
          <ICN.Info size={14} />
          <span>
            {session.message || 'Mail connection is being prepared. Folders are ready; live sync starts when IMAP/SMTP is configured on the server.'}
          </span>
        </div>
      )}

      <div style={M.body}>
        {/* Folder rail */}
        <aside style={M.sidebar}>
          <button type="button" style={M.composeSide} onClick={() => setComposeOpen(true)}>
            <ICN.Mail size={15} /> New message
          </button>
          <nav style={{ marginTop: 12 }}>
            {FOLDERS.map((f) => {
              const Icon = ICN[f.icon] || ICN.Mail;
              const active = folder === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  style={{ ...M.folderBtn, ...(active ? M.folderBtnActive : {}) }}
                  onClick={() => setFolder(f.id)}
                >
                  <Icon size={15} />
                  <span>{f.name}</span>
                </button>
              );
            })}
          </nav>
          <div style={M.sideFoot}>
            <a href="/#email" style={M.sideLink} onClick={(e) => {
              // Prefer dashboard email setup when using client router entry
              e.preventDefault();
              window.location.href = '/';
            }}>
              Business Email setup →
            </a>
          </div>
        </aside>

        {/* Message list */}
        <section style={M.listPane}>
          <div style={M.listHead}>
            <h2 style={M.listTitle}>{folderMeta.name}</h2>
            <span style={M.listCount}>{filtered.length} message{filtered.length === 1 ? '' : 's'}</span>
          </div>

          {filtered.length === 0 ? (
            <div style={M.emptyList}>
              <div style={M.emptyIcon}><ICN.Mail size={22} /></div>
              <div style={{ fontWeight: 600, color: '#111827', marginBottom: 6 }}>No messages</div>
              <div style={{ color: '#6c757d', fontSize: 13.5, maxWidth: 280, lineHeight: 1.5, textAlign: 'center' }}>
                {listMsg || `${folderMeta.name} is empty. Messages will appear here when your mailbox is connected.`}
              </div>
            </div>
          ) : (
            <div style={M.listScroll}>
              {filtered.map((m) => {
                const active = selectedId === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    style={{ ...M.msgRow, ...(active ? M.msgRowActive : {}) }}
                    onClick={() => openMessage(m.id)}
                  >
                    <div style={M.msgFrom}>{m.from || m.to || 'Unknown'}</div>
                    <div style={M.msgSubject}>{m.subject || '(no subject)'}</div>
                    <div style={M.msgPreview}>{m.preview || m.snippet || ''}</div>
                    <div style={M.msgDate}>{formatDate(m.date || m.createdAt)}</div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Reading pane */}
        <section style={M.readPane}>
          {!selectedId ? (
            <div style={M.emptyList}>
              <div style={M.emptyIcon}><ICN.Layers size={22} /></div>
              <div style={{ fontWeight: 600, color: '#111827', marginBottom: 6 }}>Select a message</div>
              <div style={{ color: '#6c757d', fontSize: 13.5 }}>
                Choose a message from the list to read it here.
              </div>
            </div>
          ) : (
            <article style={M.reader}>
              <h1 style={M.readSubject}>{selected?.subject || '(no subject)'}</h1>
              <div style={M.readMeta}>
                <div style={M.avatarLg}>{(selected?.from || session.mailbox || '?')[0].toUpperCase()}</div>
                <div>
                  <div style={{ color: '#111827', fontWeight: 600, fontSize: 14 }}>{selected?.from || '—'}</div>
                  <div style={{ color: '#6c757d', fontSize: 12.5, marginTop: 2 }}>
                    to {selected?.to || session.mailbox} · {formatDate(selected?.date || selected?.createdAt, true)}
                  </div>
                </div>
              </div>
              <div style={M.readBody}>
                {selected?.body || selected?.text || selected?.html
                  ? (selected.body || selected.text || selected.html)
                  : 'Message body will appear when mail sync is connected.'}
              </div>
            </article>
          )}
        </section>
      </div>

      {composeOpen && (
        <ComposeModal
          from={session.mailbox}
          onClose={() => setComposeOpen(false)}
          previewMode={previewMode || session.configured === false}
        />
      )}
    </div>
  );
}

function MailboxLogin({ session, onSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [focus, setFocus] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    const mailbox = email.trim().toLowerCase();
    try {
      await loginMail({ email: mailbox, password });
      setPassword('');
      await onSuccess(mailbox, { preview: false });
    } catch (error) {
      setPassword('');
      const code = error?.code || error?.body?.error?.code || '';
      const msg = error?.message || '';
      // Allow clean UI entry when IMAP is not live yet — never keep the password.
      if (
        code === 'GLONDIA_MAIL_NOT_CONFIGURED'
        || code === 'GLONDIA_MAIL_LOGIN_PENDING'
        || /being prepared|not configured|not enabled|IMAP/i.test(msg)
        || error?.status === 503
      ) {
        if (!mailbox.includes('@')) {
          setErr('Enter a valid mailbox address (you@yourdomain.com).');
        } else {
          await onSuccess(mailbox, { preview: true });
        }
      } else {
        setErr(msg || 'Could not sign in to this mailbox.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={S.page}>
      <button type="button" style={S.back} onClick={() => { window.location.href = '/'; }}>
        ← Glondia
      </button>

      <div style={S.box}>
        <div style={S.head}>
          <div style={S.headBrand}><ICN.Mail size={16} /></div>
          <div style={S.titleBar}>Glondia Mailboxes</div>
        </div>

        <div style={S.body}>
          <div style={S.eyebrow}>
            <span style={S.pulse} />
            Business mailbox
          </div>
          <h1 style={S.h1}>Sign in to Mailboxes</h1>
          <p style={S.sub}>
            Use the email address and password for your Glondia business mailbox.
          </p>

          {session?.configured === false && (
            <div style={S.notice}>
              Mail hosting is still being prepared. You can sign in to open the interface; live send/receive starts when the server connection is ready.
            </div>
          )}

          <form onSubmit={onSubmit}>
            <div style={S.fieldWrap}>
              <label style={S.label} htmlFor="mbx-email">Email</label>
              <input
                id="mbx-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocus('email')}
                onBlur={() => setFocus('')}
                placeholder="you@yourdomain.com"
                style={S.input(focus === 'email')}
              />
            </div>
            <div style={S.fieldWrap}>
              <label style={S.label} htmlFor="mbx-pass">Password</label>
              <input
                id="mbx-pass"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocus('pass')}
                onBlur={() => setFocus('')}
                placeholder="••••••••"
                style={S.input(focus === 'pass')}
              />
            </div>

            {err && <div style={S.error}>{err}</div>}

            <button type="submit" disabled={busy} style={S.btn(busy)}>
              {busy ? 'Signing in…' : 'Open mailbox →'}
            </button>
          </form>

          <div style={S.footer}>
            Need a mailbox?{' '}
            <a href="/" style={S.footerLink}>Set up Business Email in Glondia</a>
          </div>
        </div>
      </div>
    </div>
  );
}

function ComposeModal({ from, onClose, previewMode }) {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [msg, setMsg] = useState('');

  return (
    <div style={M.modalBackdrop} onClick={onClose}>
      <div style={M.modal} onClick={(e) => e.stopPropagation()}>
        <div style={M.modalHead}>
          <strong style={{ color: '#111827' }}>New message</strong>
          <button type="button" style={M.btnGhost} onClick={onClose}>Close</button>
        </div>
        <div style={{ padding: 18, display: 'grid', gap: 12 }}>
          <div>
            <div style={M.label}>From</div>
            <div style={{ ...M.input, color: '#6c757d', background: '#f8faf9' }}>{from}</div>
          </div>
          <div>
            <label style={M.label} htmlFor="c-to">To</label>
            <input id="c-to" style={M.input} value={to} onChange={(e) => setTo(e.target.value)} placeholder="recipient@example.com" />
          </div>
          <div>
            <label style={M.label} htmlFor="c-sub">Subject</label>
            <input id="c-sub" style={M.input} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
          </div>
          <div>
            <label style={M.label} htmlFor="c-body">Message</label>
            <textarea
              id="c-body"
              rows={8}
              style={{ ...M.input, resize: 'vertical', minHeight: 140 }}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message…"
            />
          </div>
          {msg && <div style={{ color: '#146c43', fontSize: 13 }}>{msg}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" style={M.btnGhost} onClick={onClose}>Discard</button>
            <button
              type="button"
              style={M.btnPrimary}
              onClick={() => {
                if (previewMode) {
                  setMsg('Sending will be available when mail hosting is connected. Nothing was sent.');
                  return;
                }
                setMsg('SMTP send is not enabled yet. Nothing was sent.');
              }}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDate(value, long = false) {
  if (!value) return '';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    if (long) return d.toLocaleString();
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

const sans = "Inter, 'Segoe UI', system-ui, -apple-system, sans-serif";

// ── Login styles (match dashboard auth pages) ────────────────────────────────
const S = {
  page: {
    minHeight: '100vh',
    background: '#050706',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: sans,
    backgroundImage: 'radial-gradient(ellipse 70% 45% at 50% -5%, rgba(62,207,142,0.09), transparent 55%)',
    padding: 24,
    position: 'relative',
  },
  back: {
    position: 'absolute',
    top: 24,
    left: 28,
    fontFamily: sans,
    fontSize: 13.5,
    fontWeight: 500,
    color: '#9a9f98',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  },
  box: {
    width: '100%',
    maxWidth: 440,
    border: '1px solid #1a221c',
    borderRadius: 16,
    overflow: 'hidden',
    background: '#0b0f0c',
    boxShadow: '0 28px 80px rgba(0,0,0,0.55)',
  },
  head: {
    borderBottom: '1px solid #1a221c',
    background: '#0e1310',
    padding: '14px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  headBrand: {
    width: 30,
    height: 30,
    borderRadius: 8,
    background: 'rgba(62,207,142,0.14)',
    color: '#3ecf8e',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBar: { fontSize: 13, fontWeight: 600, color: '#f2f0e8' },
  body: { padding: '32px 28px 28px' },
  eyebrow: {
    fontSize: 11,
    fontWeight: 600,
    color: '#3ecf8e',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  pulse: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#3ecf8e',
    boxShadow: '0 0 8px #3ecf8e',
  },
  h1: {
    fontSize: 24,
    fontWeight: 700,
    color: '#f2f0e8',
    letterSpacing: '-0.02em',
    margin: '0 0 6px',
  },
  sub: {
    fontSize: 14,
    color: '#9a9f98',
    marginBottom: 22,
    lineHeight: 1.55,
  },
  notice: {
    fontSize: 12.5,
    color: '#9a9f98',
    border: '1px solid #1a221c',
    borderRadius: 10,
    background: '#0e1310',
    padding: '10px 12px',
    marginBottom: 18,
    lineHeight: 1.5,
  },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    color: '#9a9f98',
    marginBottom: 6,
  },
  input: (focused) => ({
    width: '100%',
    background: '#050706',
    border: `1px solid ${focused ? '#3ecf8e' : '#2a362e'}`,
    borderRadius: 10,
    color: '#f2f0e8',
    fontFamily: sans,
    fontSize: 14,
    padding: '11px 14px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
    boxShadow: focused ? '0 0 0 3px rgba(62,207,142,0.14)' : 'none',
  }),
  fieldWrap: { marginBottom: 16 },
  btn: (disabled) => ({
    width: '100%',
    background: 'linear-gradient(180deg, #6ee7b0, #3ecf8e)',
    color: '#04140c',
    border: 'none',
    borderRadius: 10,
    fontFamily: sans,
    fontSize: 14.5,
    fontWeight: 700,
    padding: '13px 20px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    marginTop: 8,
    opacity: disabled ? 0.55 : 1,
    boxShadow: '0 6px 20px rgba(62,207,142,0.25)',
  }),
  error: { color: '#ff8a8a', fontSize: 13, marginBottom: 8 },
  footer: { marginTop: 20, fontSize: 13, color: '#9a9f98', textAlign: 'center' },
  footerLink: { color: '#3ecf8e', textDecoration: 'none', fontWeight: 600 },
  linkBack: { color: '#3ecf8e', fontSize: 13.5, textDecoration: 'none', fontWeight: 600 },
};

// ── Mail shell styles (match client dashboard theme) ─────────────────────────
const M = {
  shell: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#f8faf9',
    color: '#111827',
    fontFamily: sans,
  },
  topbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '10px 16px',
    borderBottom: '1px solid #dfe7e2',
    background: '#ffffff',
    flexWrap: 'wrap',
  },
  brand: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 160 },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: '#d8f3dc',
    color: '#198754',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: { fontWeight: 700, fontSize: 15, color: '#111827' },
  brandSub: { fontSize: 11, color: '#6c757d' },
  searchWrap: {
    flex: 1,
    minWidth: 180,
    maxWidth: 420,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: '#f8faf9',
    border: '1px solid #dfe7e2',
    borderRadius: 10,
    padding: '8px 12px',
  },
  search: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#111827',
    fontFamily: sans,
    fontSize: 14,
  },
  topActions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  btnPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: '#198754',
    color: '#ffffff',
    border: 'none',
    borderRadius: 8,
    fontFamily: sans,
    fontSize: 13.5,
    fontWeight: 600,
    padding: '8px 14px',
    cursor: 'pointer',
  },
  btnGhost: {
    background: '#ffffff',
    border: '1px solid #dfe7e2',
    borderRadius: 8,
    color: '#374151',
    fontFamily: sans,
    fontSize: 13.5,
    fontWeight: 500,
    padding: '7px 12px',
    cursor: 'pointer',
    textDecoration: 'none',
  },
  userChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    border: '1px solid #dfe7e2',
    borderRadius: 999,
    padding: '4px 12px 4px 4px',
    background: '#ffffff',
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: '50%',
    background: '#d8f3dc',
    color: '#146c43',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
  },
  avatarLg: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: '#d8f3dc',
    color: '#146c43',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    fontWeight: 700,
    flexShrink: 0,
  },
  userEmail: { fontSize: 12.5, color: '#374151', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' },
  banner: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 16px',
    background: '#eef8f1',
    borderBottom: '1px solid #dfe7e2',
    color: '#146c43',
    fontSize: 13,
  },
  body: { display: 'flex', flex: 1, minHeight: 0 },
  sidebar: {
    width: 210,
    borderRight: '1px solid #dfe7e2',
    background: '#ffffff',
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
  },
  composeSide: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    background: '#198754',
    color: '#ffffff',
    border: 'none',
    borderRadius: 10,
    fontFamily: sans,
    fontWeight: 600,
    fontSize: 13.5,
    padding: '11px 12px',
    cursor: 'pointer',
  },
  folderBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'transparent',
    border: 'none',
    color: '#4b5563',
    fontFamily: sans,
    fontSize: 14,
    fontWeight: 500,
    padding: '9px 10px',
    cursor: 'pointer',
    textAlign: 'left',
    borderRadius: 8,
  },
  folderBtnActive: {
    background: '#d8f3dc',
    color: '#146c43',
    fontWeight: 600,
  },
  sideFoot: { marginTop: 'auto', paddingTop: 16 },
  sideLink: { color: '#6c757d', fontSize: 12.5, textDecoration: 'none' },
  listPane: {
    width: 340,
    maxWidth: '40vw',
    borderRight: '1px solid #dfe7e2',
    display: 'flex',
    flexDirection: 'column',
    background: '#ffffff',
    minWidth: 260,
  },
  listHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    padding: '14px 16px',
    borderBottom: '1px solid #eef2ef',
  },
  listTitle: { margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' },
  listCount: { fontSize: 12, color: '#6c757d' },
  listScroll: { overflow: 'auto', flex: 1 },
  msgRow: {
    width: '100%',
    textAlign: 'left',
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid #eef2ef',
    padding: '12px 16px',
    cursor: 'pointer',
    fontFamily: sans,
    display: 'grid',
    gap: 3,
  },
  msgRowActive: {
    background: '#f0faf4',
    boxShadow: 'inset 3px 0 0 #198754',
  },
  msgFrom: { fontSize: 13.5, color: '#111827', fontWeight: 600 },
  msgSubject: { fontSize: 13, color: '#374151' },
  msgPreview: { fontSize: 12.5, color: '#6c757d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  msgDate: { fontSize: 11.5, color: '#9ca3af', marginTop: 2 },
  readPane: { flex: 1, minWidth: 0, background: '#f8faf9', overflow: 'auto' },
  emptyList: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 4,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    background: '#d8f3dc',
    color: '#198754',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  reader: { padding: '28px 32px', maxWidth: 720 },
  readSubject: {
    margin: '0 0 18px',
    fontSize: 22,
    fontWeight: 700,
    color: '#111827',
    letterSpacing: '-0.02em',
    lineHeight: 1.3,
  },
  readMeta: { display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24 },
  readBody: {
    color: '#374151',
    fontSize: 14.5,
    lineHeight: 1.7,
    whiteSpace: 'pre-wrap',
    borderTop: '1px solid #dfe7e2',
    paddingTop: 20,
  },
  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 500,
    background: 'rgba(5,8,7,.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modal: {
    width: 'min(560px, 100%)',
    background: '#ffffff',
    border: '1px solid #dfe7e2',
    borderRadius: 14,
    overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(5,8,7,.25)',
  },
  modalHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid #dfe7e2',
    background: '#f8faf9',
  },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    background: '#ffffff',
    border: '1px solid #dfe7e2',
    borderRadius: 8,
    color: '#111827',
    fontFamily: sans,
    fontSize: 14,
    padding: '10px 12px',
    outline: 'none',
    boxSizing: 'border-box',
  },
};
