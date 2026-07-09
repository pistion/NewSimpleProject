// components.jsx — shared UI primitives: Logo, Badge, Topbar, Sidebar
import React from 'react';
import { ICN } from './icons';
import { clearAuthSession, getStoredAuth, login, register, AUTH_CHANGED_EVENT } from './api';
import { getAvatarUrl } from './api/profile.js';
import {
  listNotifications as apiListNotifications,
  getUnreadCount as apiUnreadCount,
  markNotificationRead as apiMarkRead,
  markAllNotificationsRead as apiMarkAllRead,
  deleteNotification as apiDeleteNotification,
} from './api/notifications.js';
import { isFeatureEnabled } from './app/features.js';

const { useState } = React;

// Brand mark served from the app public dir. Falls back to a clean text mark if
// the asset ever fails to load (never shows a broken-image icon).
const GLONDIA_ICON_SRC = "/glondia-logo.png";

function BrandMark({ size }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span style={{
        width: size, height: size, borderRadius: 8,
        background: "var(--accent)", color: "#fff",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--serif)", fontWeight: 600, fontSize: size * 0.55, lineHeight: 1,
      }}>G</span>
    );
  }
  return (
    <img
      src={GLONDIA_ICON_SRC}
      alt="Glondia"
      width={size}
      height={size}
      onError={() => setFailed(true)}
      style={{ width: size, height: size, objectFit: "contain", display: "block", borderRadius: 6 }}
    />
  );
}

export function Logo({ compact = false, onClick }) {
  // "Domains" only appears in the subtitle when the domains feature is on.
  const subtitle = isFeatureEnabled("domains") ? "Hosting · Domains · Sites" : "Hosting · Sites";
  return (
    <a className="logo" href="#" onClick={(e) => { e.preventDefault(); onClick && onClick(); }}
       style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "inherit" }}>
      <BrandMark size={compact ? 28 : 32} />
      <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
        <span style={{ fontWeight: 700, fontSize: compact ? 14 : 15, letterSpacing: "-0.005em" }}>Glondia</span>
        {!compact && <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{subtitle}</span>}
      </span>
    </a>
  );
}

export function Badge({ tone = "muted", children, dot = true }) {
  return (
    <span className={`badge ${tone}`}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

export function StatusBadge({ value }) {
  const v = String(value || "").toLowerCase();
  if (["ready", "active", "success", "connected", "live"].includes(v)) return <Badge tone="success">{value}</Badge>;
  if (["building", "queued", "pending dns", "pending setup", "transferring", "in progress", "needs review", "waiting reply", "preparing"].includes(v)) return <Badge tone="warn">{value}</Badge>;
  if (["preview", "draft", "paused", "queued"].includes(v)) return <Badge tone="info">{value}</Badge>;
  if (["failed", "error", "denied"].includes(v)) return <Badge tone="danger">{value}</Badge>;
  return <Badge tone="muted">{value}</Badge>;
}

export function Avatar({ name, imageUrl, size = 28, fallbackIcon = false }) {
  const [imgFailed, setImgFailed] = useState(false);
  const safeName = String(name || "").trim();

  // 1. Profile photo — circular, cropped. Falls back to initials/icon on error.
  if (imageUrl && !imgFailed) {
    return (
      <img
        src={imageUrl}
        alt={safeName || "Account"}
        width={size}
        height={size}
        onError={() => setImgFailed(true)}
        style={{
          width: size, height: size, borderRadius: "50%",
          objectFit: "cover", display: "block", border: "1px solid var(--border)",
        }}
      />
    );
  }

  // 2. Initials when we have a name (and aren't forced to the icon).
  if (safeName && !fallbackIcon) {
    const initials = safeName.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
    let h = 0; for (let i = 0; i < safeName.length; i++) h = (h * 31 + safeName.charCodeAt(i)) % 360;
    return (
      <span style={{
        width: size, height: size, borderRadius: "50%",
        background: `hsl(${h} 35% 88%)`,
        color: `hsl(${h} 35% 28%)`,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.4, fontWeight: 600, letterSpacing: 0.02 + "em",
        border: "1px solid var(--border)",
      }}>{initials}</span>
    );
  }

  // 3. No name / signed out — neutral account icon (never fake initials).
  return (
    <span style={{
      width: size, height: size, borderRadius: "50%",
      background: "var(--bg-deep)", color: "var(--text-muted)",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      border: "1px solid var(--border)",
    }}><ICN.User size={Math.round(size * 0.55)} /></span>
  );
}

export const DASH_NAV = [
  {
    title: "Workspace",
    items: [
      { key: "overview",     label: "Overview",       icon: "LayoutDashboard", route: { view: "overview" } },
      { key: "hosting",      label: "Hosting",        icon: "Server",          route: { view: "hosting-list" } },
      { key: "vps-hosting",  label: "Cloud Servers",  icon: "Cpu",             route: { view: "vps-hosting" }, feature: "vps" },
      { key: "domains",      label: "Domains",        icon: "Globe",           route: { view: "domains-mine" }, feature: "domains" },
      { key: "buy",          label: "Buy a domain",   icon: "Cart",            route: { view: "domains-buy" },  indent: true, feature: "domains" },
      { key: "dns",          label: "DNS records",    icon: "Network",         route: { view: "dns" },          indent: true, feature: "domains" },
      { key: "builder",      label: "Site builder",   icon: "Layers",          route: { view: "builder-gallery" } },
    ],
  },
  {
    title: "Manage",
    items: [
      { key: "analytics",  label: "Analytics",      icon: "ChartBar",        route: { view: "analytics" }, feature: "analytics" },
      { key: "activity",   label: "Activity",       icon: "Activity",        route: { view: "activity" }, feature: "activity" },
    ],
  },
  {
    title: "Account",
    items: [
      { key: "billing",    label: "Billing",        icon: "CreditCard",      route: { view: "billing" } },
      { key: "email",      label: "Email",          icon: "Mail",            route: { view: "email" }, feature: "email" },
      { key: "settings",   label: "Settings",       icon: "Settings",        route: { view: "settings" }, feature: "settings" },
    ],
  },
];

// Sidebar groups with disabled-feature items removed (and empty groups dropped).
// Admin tools live in the separate /dashboard app — not in this client shell.
function visibleNavGroups() {
  return DASH_NAV
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.feature && !isFeatureEnabled(item.feature)) return false;
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);
}

export function DashSidebar({ active, navigate, mobileOpen = false, onClose }) {
  return (
    <aside className={`dash-side ${mobileOpen ? 'is-open' : ''}`}>
      <div className="dash-side-head">
        <Logo compact onClick={() => { window.location.href = "/"; }} />
        <button className="btn btn-icon btn-ghost dash-side-close" onClick={onClose} aria-label="Close menu">
          <ICN.X size={16} />
        </button>
      </div>
      <nav className="dash-side-nav">
        {visibleNavGroups().map((group) => (
          <div key={group.title}>
            <div className="dash-side-group-title">{group.title}</div>
            {group.items.map((item) => {
              const Icon = ICN[item.icon];
              const isActive = item.key === active;
              return (
                <a key={item.key}
                   className={`dash-side-link ${isActive ? "active" : ""}`}
                   href="#"
                   style={item.indent ? { paddingLeft: 32 } : undefined}
                   onClick={(e) => { e.preventDefault(); navigate(item.route); }}>
                  <Icon size={item.indent ? 13 : 16} />
                  <span style={item.indent ? { fontSize: 13 } : undefined}>{item.label}</span>
                </a>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="dash-side-foot">
        <div className="help">
          <b>Need a hand?</b>
          <div style={{ color: "var(--text-muted)" }}>Docs, status page, and live support are one click away.</div>
          <a href="mailto:johnweslytawa@gmail.com"
             className="btn btn-outline btn-sm"
             style={{ width: "100%", marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, textDecoration: "none" }}>
            <ICN.HelpCircle size={14} /> Help center
          </a>
          {/* LinkedIn */}
          <a href="https://www.linkedin.com/company/111230074/" target="_blank" rel="noopener noreferrer"
             className="btn btn-outline btn-sm"
             style={{ width: "100%", marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "var(--text-muted)", textDecoration: "none" }}>
            <ICN.LinkedIn size={13} /> Follow on LinkedIn
          </a>
        </div>
      </div>
    </aside>
  );
}

// ── Notifications (Bell dropdown) ─────────────────────────────────────────────

const NOTIF_ICON = {
  success: 'CheckCircle', billing: 'CreditCard', receipt: 'Cloud', subscription: 'RefreshCw',
  deployment: 'Server', account: 'User', warning: 'AlertCircle', danger: 'AlertCircle', info: 'Bell',
};
const NOTIF_COLOR = {
  success: 'var(--accent)', billing: '#b8860b', receipt: 'var(--info, #7fb5e6)', subscription: '#b8860b',
  warning: '#b8860b', danger: 'var(--danger)', deployment: 'var(--accent)', info: 'var(--text-muted)',
};

function relTime(value) {
  if (!value) return '';
  const s = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(value).toLocaleDateString();
}

// Map a notification actionUrl to an in-app route.
// Admin work happens in the separate /dashboard app (not this client shell).
function routeForAction(url) {
  const u = String(url || '');
  if (u.includes('/admin') || u.includes('/dashboard')) {
    window.location.href = '/dashboard';
    return null;
  }
  if (u.includes('billing')) return { view: 'billing' };
  return null;
}

function NotificationBell({ navigate }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const signedIn = Boolean(getStoredAuth()?.accessToken);

  const refreshCount = React.useCallback(async () => {
    if (!getStoredAuth()?.accessToken) { setCount(0); return; }
    try { const r = await apiUnreadCount(); setCount(r?.count || 0); } catch { /* non-critical */ }
  }, []);

  const loadList = React.useCallback(async () => {
    setLoading(true);
    try { const r = await apiListNotifications({ limit: 10 }); setItems(r?.items || []); }
    catch { setItems([]); }
    finally { setLoading(false); }
  }, []);

  // Poll the unread count every 60s; refresh on auth change.
  React.useEffect(() => {
    refreshCount();
    const t = setInterval(refreshCount, 60000);
    const onAuth = () => refreshCount();
    window.addEventListener(AUTH_CHANGED_EVENT, onAuth);
    return () => { clearInterval(t); window.removeEventListener(AUTH_CHANGED_EVENT, onAuth); };
  }, [refreshCount]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) loadList();
  };

  const onItemClick = async (n) => {
    if (!n.read) {
      try { await apiMarkRead(n.id); } catch { /* ignore */ }
      setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, read: true, readAt: new Date().toISOString() } : x)));
      setCount((c) => Math.max(0, c - 1));
    }
    const route = routeForAction(n.actionUrl);
    if (route && navigate) { setOpen(false); navigate(route); }
  };

  const onMarkAll = async () => {
    try { await apiMarkAllRead(); } catch { /* ignore */ }
    setItems((cur) => cur.map((x) => ({ ...x, read: true })));
    setCount(0);
  };

  const onDelete = async (e, id) => {
    e.stopPropagation();
    try { await apiDeleteNotification(id); } catch { /* ignore */ }
    setItems((cur) => cur.filter((x) => x.id !== id));
    refreshCount();
  };

  if (!signedIn) {
    return <button className="btn btn-icon btn-ghost notification-bell notification-bell--signed-out" title="Notifications" aria-label="Notifications"><ICN.Bell size={16} /></button>;
  }

  return (
    <div className="notification-bell" style={{ position: 'relative' }}>
      <button className="btn btn-icon btn-ghost" title="Notifications" onClick={toggle} aria-label="Notifications">
        <ICN.Bell size={16} />
        {count > 0 && <span className="notification-badge">{count > 99 ? '99+' : count}</span>}
      </button>
      {open && (
        <>
          <button className="notification-overlay" aria-label="Close notifications" onClick={() => setOpen(false)} />
          <div className="notification-menu" role="menu">
            <div className="notification-menu-head">
              <b>Notifications</b>
              <button className="btn btn-sm btn-ghost" onClick={onMarkAll} disabled={!items.some((i) => !i.read)}>Mark all read</button>
            </div>
            <div className="notification-list">
              {loading ? (
                <div className="notification-empty">Loading…</div>
              ) : items.length === 0 ? (
                <div className="notification-empty">You're all caught up.</div>
              ) : items.map((n) => {
                const Icon = ICN[NOTIF_ICON[n.type] || 'Bell'] || ICN.Bell;
                return (
                  <button key={n.id} className={`notification-item ${n.read ? '' : 'unread'}`} onClick={() => onItemClick(n)}>
                    <span className="notification-icon" style={{ color: NOTIF_COLOR[n.type] || 'var(--text-muted)' }}><Icon size={15} /></span>
                    <span className="notification-body">
                      <span className="notification-title">{n.title}</span>
                      <span className="notification-message">{n.message}</span>
                      <span className="notification-meta">{relTime(n.createdAt)}{n.audience === 'admin' ? ' · admin' : ''}</span>
                    </span>
                    <span className="notification-actions">
                      {!n.read && <span className="notification-dot" aria-label="unread" />}
                      <span className="notification-del" role="button" title="Dismiss" onClick={(e) => onDelete(e, n.id)}>×</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function DashTopbar({ crumbs = [], onSearch, navigate, theme, toggleTheme, onOpenNav }) {
  return (
    <div className="dash-top">
      <button className="btn btn-icon btn-ghost dash-menu-btn" onClick={onOpenNav} aria-label="Open menu">
        <ICN.Menu size={16} />
      </button>
      <div className="crumb" style={{ flex: 1 }}>
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="sep">/</span>}
            {c.onClick
              ? <a href="#" onClick={(e) => { e.preventDefault(); c.onClick(); }} style={{ color: "inherit" }}>{c.label}</a>
              : <b>{c.label}</b>}
          </React.Fragment>
        ))}
      </div>
      <div className="row dash-search" style={{ position: "relative" }}>
        <ICN.Search size={14} style={{ position: "absolute", left: 12, top: 12, color: "var(--text-faint)" }} />
        <input className="input" placeholder="Search projects, domains…" style={{ paddingLeft: 34, width: 280, height: 36 }} />
      </div>
      <button className="btn btn-icon btn-ghost" onClick={toggleTheme} title="Toggle theme">
        {theme === "dark" ? <ICN.Sun size={16} /> : <ICN.Moon size={16} />}
      </button>
      <NotificationBell navigate={navigate} />
      <AuthMenu navigate={navigate} />
    </div>
  );
}

/**
 * Resolve a SAFE, already-public avatar URL from the auth user (e.g. an
 * external social photo). The first-party avatar lives behind an authenticated
 * route and is fetched as a blob by useCurrentUserAvatar instead — never the
 * raw idPhotoPath/avatarPath SSD path.
 */
function getUserAvatarUrl(user) {
  return user?.profileImageUrl || user?.photoUrl || user?.headshotUrl || null;
}

/**
 * Fetch the signed-in user's avatar as an object URL through the authenticated
 * /profile/avatar route (a plain <img src> can't send the Bearer header). Re-runs
 * when auth changes (cache-busted avatarUrl) and revokes old object URLs.
 */
function useCurrentUserAvatar(auth) {
  const [url, setUrl] = useState(null);
  const signal = auth?.user?.avatarUrl || (auth?.user?.hasAvatar ? 'has' : '');
  React.useEffect(() => {
    // Prefer an already-public URL when present; otherwise fetch the blob.
    const publicUrl = getUserAvatarUrl(auth?.user);
    if (publicUrl) { setUrl(publicUrl); return undefined; }
    if (!auth?.accessToken || !signal) { setUrl(null); return undefined; }
    let revoked = false;
    let current = null;
    (async () => {
      try {
        const objUrl = await getAvatarUrl();
        if (revoked) { URL.revokeObjectURL(objUrl); return; }
        current = objUrl;
        setUrl(objUrl);
      } catch { setUrl(null); }
    })();
    return () => { revoked = true; if (current) URL.revokeObjectURL(current); };
  }, [auth?.accessToken, signal]); // eslint-disable-line react-hooks/exhaustive-deps
  return url;
}

function AuthMenu({ navigate }) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState("login");
  const [auth, setAuth] = React.useState(() => getStoredAuth());
  const [form, setForm] = React.useState({ name: "", organizationName: "", email: "", password: "" });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    const sync = () => setAuth(getStoredAuth());
    window.addEventListener(AUTH_CHANGED_EVENT, sync);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, sync);
  }, []);

  const signedIn = !!auth.accessToken;
  const displayName = auth.user?.name || auth.user?.email || "Account";
  const avatarUrl = useCurrentUserAvatar(signedIn ? auth : null);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") await login(form.email, form.password);
      else await register({ name: form.name, email: form.email, password: form.password, organizationName: form.organizationName });
      setOpen(false);
      setAuth(getStoredAuth());
    } catch (err) {
      setError(err.message || "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-menu">
      <button className="btn btn-ghost auth-menu-trigger" onClick={() => signedIn ? setOpen(!open) : navigate && navigate({ view: 'login' })}>
        <Avatar name={signedIn ? displayName : ""} imageUrl={avatarUrl} size={28} fallbackIcon={!signedIn} />
        <span className="auth-menu-name">{signedIn ? displayName : "Sign in"}</span>
      </button>
      {open && (
        <div className="card auth-menu-panel">
          {signedIn ? (
            <div>
              <div className="auth-user-block">
                <span className="auth-user-label">Signed in</span>
                <span className="auth-user-name">{displayName}</span>
                <span className="auth-user-email">{auth.user?.email}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  className="auth-panel-btn"
                  onClick={() => { setOpen(false); navigate && navigate({ view: 'profile' }); }}
                  title="View and edit your account details"
                >
                  <ICN.Briefcase size={18} />
                  <span className="auth-panel-btn-inner">
                    <span className="auth-panel-btn-label">Account details</span>
                    <span className="auth-panel-btn-sub">Business profile and contact details</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="auth-panel-signout"
                  onClick={() => { clearAuthSession(); setAuth(getStoredAuth()); setOpen(false); window.location.href = "/"; }}
                >
                  Sign out
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="row between"><h2 style={{ margin: 0 }}>{mode === "login" ? "Sign in" : "Create account"}</h2><button type="button" className="btn btn-sm btn-ghost" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}>{mode === "login" ? "Register" : "Login"}</button></div>
              {mode === "register" && <><div><label className="label">Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div><div><label className="label">Organization</label><input className="input" value={form.organizationName} onChange={(e) => setForm({ ...form, organizationName: e.target.value })} required /></div></>}
              <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
              <div><label className="label">Password</label><input className="input" type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></div>
              {error && <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div>}
              <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Working..." : mode === "login" ? "Sign in" : "Create account"}</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export function PubNavbar({ navigate }) {
  return (
    <nav className="pub-nav">
      <Logo onClick={() => { window.location.href = "/"; }} />
      <div className="grow" />
      <a className="navlink" href="/#hosting">Hosting</a>
      <a className="navlink" href="/#domains">Domains</a>
      <a className="navlink" href="/#builder">Site builder</a>
      <a className="navlink" href="/#pricing">Pricing</a>
      <a className="navlink" href="#">Docs</a>
      <div style={{ width: 10 }} />
      <button className="btn btn-ghost" onClick={() => navigate({ view: "login" })}>Sign in</button>
      <button className="btn btn-primary" onClick={() => navigate({ view: "signup" })}>Start free <ICN.ArrowRight size={14} /></button>
    </nav>
  );
}

export function Empty({ icon = "Box", title, body, action }) {
  const Icon = ICN[icon];
  return (
    <div className="empty">
      <div style={{ width: 44, height: 44, borderRadius: 999, background: "var(--bg-deep)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}><Icon size={20} /></div>
      <div style={{ fontWeight: 600, color: "var(--text)" }}>{title}</div>
      {body && <div style={{ maxWidth: 40 + "ch" }}>{body}</div>}
      {action}
    </div>
  );
}

export function Tabs({ value, onChange, options }) {
  return <div className="tabs">{options.map((opt) => { const v = typeof opt === "string" ? opt : opt.value; const label = typeof opt === "string" ? opt : opt.label; return <button key={v} className={v === value ? "active" : ""} onClick={() => onChange(v)}>{label}</button>; })}</div>;
}

export function Stat({ k, v, d }) { return <div className="card stat-card"><div className="k">{k}</div><div className="v">{v}</div><div className="d">{d}</div></div>; }

export function ToggleRow({ label, sub, defaultOn }) {
  const [on, setOn] = React.useState(!!defaultOn);
  return (
    <div className="row between" style={{ padding: "12px 0", borderBottom: "1px solid var(--border)", alignItems: "flex-start" }}>
      <div style={{ flex: 1 }}><div style={{ fontWeight: 500 }}>{label}</div><div className="muted" style={{ fontSize: 13 }}>{sub}</div></div>
      <button onClick={() => setOn(!on)} style={{ width: 38, height: 22, borderRadius: 999, background: on ? "var(--accent)" : "var(--border-strong)", position: "relative", transition: "background .2s" }}>
        <span style={{ position: "absolute", top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: 999, background: "#fff", transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.18)" }} />
      </button>
    </div>
  );
}
