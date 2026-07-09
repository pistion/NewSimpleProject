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
            <div style={S.dots}>
              <span style={S.dot('#ff5f57')} />
              <span style={S.dot('#febc2e')} />
              <span style={S.dot('#28c840')} />
            </div>
            <div style={S.titleBar}>mailboxes — offline</div>
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
        <div style={{ color: '#4A5550', fontFamily: mono, fontSize: 13 }}>Loading mailboxes…</div>
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
          <ICN.Search size={14} style={{ color: '#4A5550' }} />
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
              <div style={{ fontWeight: 600, color: '#E8E8DC', marginBottom: 6 }}>No messages</div>
              <div style={{ color: '#4A5550', fontSize: 13, maxWidth: 280, lineHeight: 1.5, textAlign: 'center' }}>
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
              <div style={{ fontWeight: 600, color: '#E8E8DC', marginBottom: 6 }}>Select a message</div>
              <div style={{ color: '#4A5550', fontSize: 13 }}>
                Choose a message from the list to read it here.
              </div>
            </div>
          ) : (
            <article style={M.reader}>
              <h1 style={M.readSubject}>{selected?.subject || '(no subject)'}</h1>
              <div style={M.readMeta}>
                <div style={M.avatarLg}>{(selected?.from || session.mailbox || '?')[0].toUpperCase()}</div>
                <div>
                  <div style={{ color: '#E8E8DC', fontWeight: 600, fontSize: 14 }}>{selected?.from || '—'}</div>
                  <div style={{ color: '#4A5550', fontSize: 12, marginTop: 2 }}>
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
          <div style={S.dots}>
            <span style={S.dot('#ff5f57')} />
            <span style={S.dot('#febc2e')} />
            <span style={S.dot('#28c840')} />
          </div>
          <div style={S.titleBar}>mailboxes — sign in</div>
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
          <strong style={{ color: '#E8E8DC' }}>New message</strong>
          <button type="button" style={M.btnGhost} onClick={onClose}>Close</button>
        </div>
        <div style={{ padding: 18, display: 'grid', gap: 12 }}>
          <div>
            <div style={S.label}>From</div>
            <div style={{ ...S.input(false), color: '#4A5550' }}>{from}</div>
          </div>
          <div>
            <label style={S.label} htmlFor="c-to">To</label>
            <input id="c-to" style={S.input(false)} value={to} onChange={(e) => setTo(e.target.value)} placeholder="recipient@example.com" />
          </div>
          <div>
            <label style={S.label} htmlFor="c-sub">Subject</label>
            <input id="c-sub" style={S.input(false)} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
          </div>
          <div>
            <label style={S.label} htmlFor="c-body">Message</label>
            <textarea
              id="c-body"
              rows={8}
              style={{ ...S.input(false), resize: 'vertical', minHeight: 140, fontFamily: mono }}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message…"
            />
          </div>
          {msg && <div style={{ color: '#5BFF8F', fontSize: 12 }}>{msg}</div>}
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

const mono = "'JetBrains Mono', 'SF Mono', ui-monospace, monospace";

// ── Login styles (match dashboard LoginPage) ─────────────────────────────────
const S = {
  page: {
    minHeight: '100vh',
    background: '#0A0D0A',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: mono,
    backgroundImage: 'radial-gradient(rgba(91,255,143,0.04) 1px, transparent 1px)',
    backgroundSize: '32px 32px',
    padding: 24,
    position: 'relative',
  },
  back: {
    position: 'absolute',
    top: 24,
    left: 28,
    fontFamily: mono,
    fontSize: 12,
    color: '#4A5550',
    background: 'none',
    border: 'none',
    letterSpacing: '0.06em',
    cursor: 'pointer',
  },
  box: {
    width: '100%',
    maxWidth: 420,
    border: '1px solid #1E2A20',
    background: '#0D110D',
    boxShadow: '0 0 60px -20px rgba(91,255,143,0.12)',
  },
  head: {
    borderBottom: '1px solid #1E2A20',
    background: '#0F140F',
    padding: '12px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: 11,
    color: '#4A5550',
  },
  dots: { display: 'flex', gap: 6 },
  dot: (c) => ({ width: 10, height: 10, borderRadius: '50%', background: c }),
  titleBar: { flex: 1, textAlign: 'center', color: '#4A5550' },
  body: { padding: '32px 28px 28px' },
  eyebrow: {
    fontSize: 10,
    color: '#5BFF8F',
    letterSpacing: '0.18em',
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
    background: '#5BFF8F',
    boxShadow: '0 0 8px #5BFF8F',
  },
  h1: {
    fontSize: 22,
    fontWeight: 600,
    color: '#E8E8DC',
    letterSpacing: '-0.02em',
    margin: '0 0 6px',
  },
  sub: {
    fontSize: 13,
    color: '#4A5550',
    marginBottom: 22,
    lineHeight: 1.5,
  },
  notice: {
    fontSize: 12,
    color: '#8A9388',
    border: '1px solid #1E2A20',
    background: '#0A0D0A',
    padding: '10px 12px',
    marginBottom: 18,
    lineHeight: 1.5,
  },
  label: {
    display: 'block',
    fontSize: 11,
    color: '#8A9388',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  input: (focused) => ({
    width: '100%',
    background: '#0A0D0A',
    border: `1px solid ${focused ? '#5BFF8F' : '#1E2A20'}`,
    color: '#E8E8DC',
    fontFamily: mono,
    fontSize: 13,
    padding: '10px 14px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  }),
  fieldWrap: { marginBottom: 16 },
  btn: (disabled) => ({
    width: '100%',
    background: disabled ? '#2D5A3A' : '#5BFF8F',
    color: '#001A09',
    border: 'none',
    fontFamily: mono,
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.06em',
    padding: '13px 20px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    marginTop: 8,
    opacity: disabled ? 0.6 : 1,
  }),
  error: { color: '#ff7b72', fontSize: 12, marginBottom: 8 },
  footer: { marginTop: 20, fontSize: 12, color: '#4A5550', textAlign: 'center' },
  footerLink: { color: '#5BFF8F', textDecoration: 'none' },
  linkBack: { color: '#5BFF8F', fontSize: 13, textDecoration: 'none' },
};

// ── Mail shell styles ────────────────────────────────────────────────────────
const M = {
  shell: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#0A0D0A',
    color: '#E8E8DC',
    fontFamily: mono,
  },
  topbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '10px 16px',
    borderBottom: '1px solid #1E2A20',
    background: '#0D110D',
    flexWrap: 'wrap',
  },
  brand: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 160 },
  brandMark: {
    width: 34,
    height: 34,
    borderRadius: 8,
    background: 'rgba(91,255,143,0.12)',
    color: '#5BFF8F',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: { fontWeight: 700, fontSize: 14, color: '#E8E8DC', letterSpacing: '0.04em' },
  brandSub: { fontSize: 10, color: '#4A5550', letterSpacing: '0.08em', textTransform: 'uppercase' },
  searchWrap: {
    flex: 1,
    minWidth: 180,
    maxWidth: 420,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: '#0A0D0A',
    border: '1px solid #1E2A20',
    padding: '8px 12px',
  },
  search: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#E8E8DC',
    fontFamily: mono,
    fontSize: 13,
  },
  topActions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  btnPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: '#5BFF8F',
    color: '#001A09',
    border: 'none',
    fontFamily: mono,
    fontSize: 12,
    fontWeight: 700,
    padding: '8px 12px',
    cursor: 'pointer',
  },
  btnGhost: {
    background: 'transparent',
    border: '1px solid #1E2A20',
    color: '#8A9388',
    fontFamily: mono,
    fontSize: 12,
    padding: '7px 10px',
    cursor: 'pointer',
    textDecoration: 'none',
  },
  userChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    border: '1px solid #1E2A20',
    padding: '4px 10px 4px 4px',
    background: '#0A0D0A',
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: '50%',
    background: 'rgba(91,255,143,0.18)',
    color: '#5BFF8F',
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
    background: 'rgba(91,255,143,0.18)',
    color: '#5BFF8F',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    fontWeight: 700,
    flexShrink: 0,
  },
  userEmail: { fontSize: 11, color: '#8A9388', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' },
  banner: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 16px',
    background: 'rgba(91,255,143,0.06)',
    borderBottom: '1px solid #1E2A20',
    color: '#8A9388',
    fontSize: 12,
  },
  body: { display: 'flex', flex: 1, minHeight: 0 },
  sidebar: {
    width: 210,
    borderRight: '1px solid #1E2A20',
    background: '#0D110D',
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
    background: '#5BFF8F',
    color: '#001A09',
    border: 'none',
    fontFamily: mono,
    fontWeight: 700,
    fontSize: 12,
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
    color: '#8A9388',
    fontFamily: mono,
    fontSize: 13,
    padding: '9px 10px',
    cursor: 'pointer',
    textAlign: 'left',
    borderRadius: 0,
  },
  folderBtnActive: {
    background: 'rgba(91,255,143,0.1)',
    color: '#5BFF8F',
  },
  sideFoot: { marginTop: 'auto', paddingTop: 16 },
  sideLink: { color: '#4A5550', fontSize: 11, textDecoration: 'none' },
  listPane: {
    width: 340,
    maxWidth: '40vw',
    borderRight: '1px solid #1E2A20',
    display: 'flex',
    flexDirection: 'column',
    background: '#0A0D0A',
    minWidth: 260,
  },
  listHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    padding: '14px 16px',
    borderBottom: '1px solid #1E2A20',
  },
  listTitle: { margin: 0, fontSize: 15, color: '#E8E8DC' },
  listCount: { fontSize: 11, color: '#4A5550' },
  listScroll: { overflow: 'auto', flex: 1 },
  msgRow: {
    width: '100%',
    textAlign: 'left',
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid #1E2A20',
    padding: '12px 16px',
    cursor: 'pointer',
    fontFamily: mono,
    display: 'grid',
    gap: 3,
  },
  msgRowActive: {
    background: 'rgba(91,255,143,0.08)',
    boxShadow: 'inset 2px 0 0 #5BFF8F',
  },
  msgFrom: { fontSize: 12, color: '#E8E8DC', fontWeight: 600 },
  msgSubject: { fontSize: 12, color: '#C8D0C8' },
  msgPreview: { fontSize: 11, color: '#4A5550', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  msgDate: { fontSize: 10, color: '#4A5550', marginTop: 2 },
  readPane: { flex: 1, minWidth: 0, background: '#0D110D', overflow: 'auto' },
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
    background: 'rgba(91,255,143,0.08)',
    color: '#4A5550',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  reader: { padding: '28px 32px', maxWidth: 720 },
  readSubject: {
    margin: '0 0 18px',
    fontSize: 22,
    fontWeight: 600,
    color: '#E8E8DC',
    letterSpacing: '-0.02em',
    lineHeight: 1.3,
  },
  readMeta: { display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24 },
  readBody: {
    color: '#C8D0C8',
    fontSize: 14,
    lineHeight: 1.7,
    whiteSpace: 'pre-wrap',
    borderTop: '1px solid #1E2A20',
    paddingTop: 20,
  },
  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 500,
    background: 'rgba(0,0,0,.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modal: {
    width: 'min(560px, 100%)',
    background: '#0D110D',
    border: '1px solid #1E2A20',
    boxShadow: '0 20px 60px rgba(0,0,0,.5)',
  },
  modalHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid #1E2A20',
    background: '#0F140F',
  },
};
