// ── Global Search ─────────────────────────────────────────────────────────────

const GS_TYPE_LABELS = {
  customer:        "Customer",
  deployment:      "Deployment",
  order:           "Order",
  domain:          "Domain",
  ticket:          "Ticket",
};

const GS_TYPE_ORDER = ["customer", "deployment", "order", "domain", "ticket"];

function GlobalSearch({ setView, setActivePositionId, setCrmTab, onSearchOpen }) {
  const [query, setQuery]     = React.useState("");
  const [open, setOpen]       = React.useState(false);
  const [busy, setBusy]       = React.useState(false);
  const [results, setResults] = React.useState([]);
  const [error, setError]     = React.useState(null);
  const [selIdx, setSelIdx]   = React.useState(-1);

  const inputRef    = React.useRef(null);
  const panelRef    = React.useRef(null);
  const debounceRef = React.useRef(null);

  // Flat ordered list for keyboard nav
  const flat = React.useMemo(() => {
    const out = [];
    for (const type of GS_TYPE_ORDER) {
      const group = results.filter((r) => r.type === type);
      for (const r of group) out.push(r);
    }
    return out;
  }, [results]);

  // Grouped for display
  const grouped = React.useMemo(() => {
    const map = {};
    for (const type of GS_TYPE_ORDER) {
      const group = results.filter((r) => r.type === type);
      if (group.length) map[type] = group;
    }
    return map;
  }, [results]);

  function doSearch(q) {
    if (!q || q.length < 2) { setResults([]); setBusy(false); setError(null); return; }
    setBusy(true);
    setError(null);
    window.HEYA_API.globalSearch(q, { limit: 40 })
      .then((data) => { setResults(data.results || []); setSelIdx(-1); })
      .catch((err) => setError(err.message || "Search failed."))
      .finally(() => setBusy(false));
  }

  function handleInput(e) {
    const q = e.target.value;
    setQuery(q);
    setOpen(true);
    if (onSearchOpen) onSearchOpen(true);
    clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); setError(null); return; }
    debounceRef.current = setTimeout(() => doSearch(q.trim()), 250);
  }

  function close() {
    setOpen(false);
    setQuery("");
    setResults([]);
    setError(null);
    setSelIdx(-1);
    if (onSearchOpen) onSearchOpen(false);
  }

  function navigateToResult(result) {
    if (!result) return;
    close();
    if (!setView) return;
    const { view, tab, activeId } = result.route || {};
    if (view === "crm") {
      if (setCrmTab && tab) setCrmTab(tab);
      setView("crm");
    } else if (view === "positions" && activeId && setActivePositionId) {
      setActivePositionId(activeId);
      setView("positions");
    } else if (view === "talent") {
      setView("talent");
      // Signal the talent page to open this profile if it supports it
      if (activeId) window.__globalSearchTarget = { type: "talent", id: activeId };
    } else if (view) {
      setView(view);
    }
  }

  // Keyboard: Cmd/Ctrl+K, Escape, ArrowUp/Down, Enter
  React.useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
        if (onSearchOpen) onSearchOpen(true);
        return;
      }
      if (!open) return;
      if (e.key === "Escape") { close(); return; }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelIdx((i) => Math.min(i + 1, flat.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelIdx((i) => Math.max(i - 1, -1));
      } else if (e.key === "Enter" && selIdx >= 0) {
        e.preventDefault();
        navigateToResult(flat[selIdx]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, flat, selIdx]);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    function onClick(e) {
      if (
        inputRef.current && !inputRef.current.closest(".global-search")?.contains(e.target)
      ) close();
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const hasResults = results.length > 0;
  const showPanel  = open && (query.length >= 2);

  return (
    <div className={"global-search" + (open ? " is-open" : "")}>
      <div className="global-search__field">
        <svg className="global-search__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          ref={inputRef}
          className="global-search__input"
          value={query}
          onChange={handleInput}
          onFocus={() => { if (query.length >= 2) setOpen(true); }}
          placeholder="Search dashboard…"
          autoComplete="off"
          spellCheck={false}
        />
        {busy
          ? <span className="global-search__spinner" />
          : !query && <kbd className="global-search__kbd">⌘K</kbd>
        }
        {query && (
          <button className="global-search__clear" onClick={close} tabIndex={-1}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
      </div>

      {showPanel && (
        <div className="global-search__panel" ref={panelRef}>
          {error && (
            <div className="global-search__error">⚠ {error}</div>
          )}
          {!error && !busy && !hasResults && (
            <div className="global-search__empty">No results for "{query}"</div>
          )}
          {!error && hasResults && Object.entries(grouped).map(([type, group]) => {
            return (
              <div key={type} className="global-search__group">
                <div className="global-search__group-title">{GS_TYPE_LABELS[type] || type}</div>
                {group.slice(0, 6).map((r) => {
                  const idx = flat.indexOf(r);
                  return (
                    <button
                      key={r.id}
                      className={"global-search__result" + (idx === selIdx ? " is-active" : "")}
                      onMouseEnter={() => setSelIdx(idx)}
                      onMouseDown={(e) => { e.preventDefault(); navigateToResult(r); }}
                    >
                      <span className={"global-search__badge gs-badge--" + r.type}>
                        {GS_TYPE_LABELS[r.type] || r.type}
                      </span>
                      <span className="global-search__result-body">
                        <span className="global-search__result-title">{r.title}</span>
                        {r.subtitle && <span className="global-search__result-sub">{r.subtitle}</span>}
                        {r.meta && <span className="global-search__result-meta">{r.meta}</span>}
                      </span>
                      {r.status && (
                        <span className="global-search__result-status">{r.status}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Topbar ────────────────────────────────────────────────────────────────────

function Topbar({
  view,
  onLogout,
  loggingOut,
  notifications = [],
  notificationSummary = {},
  onMarkNotificationRead,
  onDeleteNotification,
  settings,
  messages = [],
  messageSummary = {},
  positions = [],
  onMessagesChanged,
  onNotificationsOpenChange,
  onMessagesOpenChange,
  onMessageModalOpenChange,
  onMenuToggle,
  setView,
  setActivePositionId,
  setCrmTab,
}) {
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);
  const [messagesOpen, setMessagesOpen] = React.useState(false);
  const [activeMessage, setActiveMessage] = React.useState(null);
  const labels = {
    dashboard:   "Overview",
    customers:   "Customers",
    hosting:     "Hosting",
    deployments: "Deployments",
    domains:     "Domains",
    vps:         "VPS Hosting",
    billing:     "Billing",
    receipts:    "Receipts",
    tickets:     "Tickets",
    activity:    "Activity",
    settings:    "Settings",
  };
  const notificationCount = React.useMemo(
    () => Number(notificationSummary.unread || notifications.filter((item) => item.status === "unread").length || 0),
    [notificationSummary.unread, notifications]
  );
  const quickNotification = React.useMemo(
    () => notifications.find((item) => item.status === "unread") || notifications[0] || null,
    [notifications]
  );
  const unreadMessageCount = React.useMemo(
    () => Number(messageSummary.unread || messages.filter((item) => item.status === "unread").length || 0),
    [messageSummary.unread, messages]
  );
  const visibleMessages = React.useMemo(
    () => messages.filter((item) => item.status !== "archived").slice(0, 8),
    [messages]
  );
  const accountSettings = settings?.accountSettings || {};
  const profile = settings?.profile || {};
  const displayName = accountSettings.fullName || profile.displayName || profile.username || "Dashboard Admin";
  const initials = displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "DA";

  React.useEffect(() => {
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      if (activeMessage) { setActiveMessage(null); return; }
      setNotificationsOpen(false);
      setMessagesOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeMessage]);

  React.useEffect(() => {
    if (onNotificationsOpenChange) onNotificationsOpenChange(notificationsOpen);
  }, [notificationsOpen, onNotificationsOpenChange]);

  React.useEffect(() => {
    if (onMessagesOpenChange) onMessagesOpenChange(messagesOpen);
  }, [messagesOpen, onMessagesOpenChange]);

  React.useEffect(() => {
    if (onMessageModalOpenChange) onMessageModalOpenChange(Boolean(activeMessage));
  }, [activeMessage, onMessageModalOpenChange]);

  const openMessage = React.useCallback(async (message) => {
    setActiveMessage(message);
    setMessagesOpen(false);
    setNotificationsOpen(false);
    if (message.status !== "unread") return;
    try {
      const response = await window.HEYA_API.markMessageRead(message.id);
      if (response.message) setActiveMessage(response.message);
      if (onMessagesChanged) await onMessagesChanged();
    } catch (err) {
      console.warn("Unable to mark inbox message as read.", err);
    }
  }, [onMessagesChanged]);

  function replaceActiveMessage(message) {
    if (message) setActiveMessage(message);
  }

  const markNotificationRead = React.useCallback(async (item) => {
    if (!item || !onMarkNotificationRead) return;
    await onMarkNotificationRead(item.id);
  }, [onMarkNotificationRead]);

  const deleteNotification = React.useCallback(async (item) => {
    if (!item || !onDeleteNotification) return;
    if (!window.confirm(`Delete notification "${item.title || "this notification"}"?`)) return;
    await onDeleteNotification(item.id);
  }, [onDeleteNotification]);

  const markAllNotificationsRead = React.useCallback(async () => {
    try {
      await window.HEYA_API.markAllNotificationsRead();
      if (onMessagesChanged) await onMessagesChanged();
    } catch {}
  }, [onMessagesChanged]);

  const markAllMessagesRead = React.useCallback(async () => {
    try {
      await window.HEYA_API.markAllMessagesRead();
      if (onMessagesChanged) await onMessagesChanged();
    } catch {}
  }, [onMessagesChanged]);

  return (
    <header className="topbar">
      {onMenuToggle && (
        <button className="menu-hamburger" onClick={onMenuToggle} aria-label="Open navigation">
          <I.Menu />
        </button>
      )}
      <div className="crumbs">Glondiasites <span style={{ margin: "0 6px", color: "var(--muted-2)" }}>/</span> <b>{labels[view] || ""}</b></div>

      <GlobalSearch
        setView={setView}
        setActivePositionId={setActivePositionId}
        setCrmTab={setCrmTab}
      />

      <div className="topbar-actions">
        <div className="notifications-wrap inbox-wrap">
          <button className="icon-btn notifications-btn" title="Inbox messages" onClick={() => {
            setMessagesOpen((value) => !value);
            setNotificationsOpen(false);
          }}>
            <I.Mail />
            {unreadMessageCount > 0 && <sup className="notif-count">{unreadMessageCount > 9 ? "9+" : unreadMessageCount}</sup>}
          </button>
          {messagesOpen && (
            <>
              <div className="menu-scrim" onClick={() => setMessagesOpen(false)} />
              <div className="notifications-menu inbox-menu">
                <div className="notifications-menu__head">
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Inbox</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {unreadMessageCount > 0 && (
                      <button className="notif-mark-all-btn" onClick={markAllMessagesRead}>
                        Mark all read
                      </button>
                    )}
                    <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{unreadMessageCount} unread</span>
                  </div>
                </div>
                <div className="notifications-scroll">
                  {visibleMessages.length === 0 && (
                    <div className="notifications-empty">No application or CV messages yet.</div>
                  )}
                  {visibleMessages.map((item) => (
                    <button key={item.id} className={"inbox-item " + (item.status === "unread" ? "is-unread" : "")} onClick={() => openMessage(item)}>
                      <span className={"notifications-item__pill notifications-item__pill--" + (item.status === "unread" ? "urgent" : "info")}></span>
                      <span>
                        <span className="inbox-item__title">{item.subject || "New message"}</span>
                        <span className="inbox-item__detail">{item.name}{item.email ? ` · ${item.email}` : ""}</span>
                        <span className="inbox-item__meta">{(item.receivedAt || item.createdAt) ? new Date(item.receivedAt || item.createdAt).toLocaleDateString("en-PG", { day: "numeric", month: "short" }) : ""}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="notifications-wrap">
          <div className="notification-hover-target">
            <button className="icon-btn notifications-btn" title="Notifications" onClick={() => {
              setNotificationsOpen((value) => !value);
              setMessagesOpen(false);
            }}>
              <I.Bell />
              {notificationCount > 0 && <sup className="notif-count">{notificationCount > 9 ? "9+" : notificationCount}</sup>}
            </button>
            {quickNotification && (
              <div className="notification-quick-actions">
                <button onClick={(event) => { event.stopPropagation(); markNotificationRead(quickNotification); }}>Mark as read</button>
                <button onClick={(event) => { event.stopPropagation(); deleteNotification(quickNotification); }}>Delete</button>
              </div>
            )}
          </div>
          {notificationsOpen && (
            <>
              <div className="menu-scrim" onClick={() => setNotificationsOpen(false)} />
              <div className="notifications-menu">
                <div className="notifications-menu__head">
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Notifications</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {notificationCount > 0 && (
                      <button className="notif-mark-all-btn" onClick={markAllNotificationsRead}>
                        Mark all read
                      </button>
                    )}
                    <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{notificationCount} unread</span>
                  </div>
                </div>
                <div className="notifications-scroll">
                  {notifications.length === 0 && (
                    <div className="notifications-empty">No new dashboard notifications.</div>
                  )}
                  {notifications.map((item) => (
                    <div key={item.id} className={"notifications-item " + (item.status === "read" ? "is-read" : "")}>
                      <span className={"notifications-item__pill notifications-item__pill--" + (item.status === "unread" ? (item.tone || "info") : "read")}></span>
                      <div style={{ minWidth: 0 }}>
                        <div className="notifications-item__title">{item.title}</div>
                        <div className="notifications-item__detail">{item.detail}</div>
                        <div className="notifications-item__actions">
                          <button onClick={() => markNotificationRead(item)} disabled={item.status === "read"}>Mark read</button>
                          <button onClick={() => deleteNotification(item)}>Delete</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        <button className="btn ghost sm" onClick={onLogout} disabled={loggingOut}>
          {loggingOut ? "Signing out..." : "Logout"}
        </button>
      </div>

      {activeMessage && (
        <InboxMessageModal
          message={activeMessage}
          onClose={() => setActiveMessage(null)}
        />
      )}
    </header>
  );
}

function InboxMessageModal({ message, onClose }) {
  return (
    <div className="publish-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="edit-modal inbox-modal">
        <div className="edit-modal-head">
          <div>
            <div className="mono eyebrow">Message</div>
            <div className="edit-modal-title">{message.subject || "Inbox message"}</div>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close">×</button>
        </div>
        <div className="edit-modal-body">
          <div className="stack" style={{ gap: 12 }}>
            <div className="inbox-read-card">
              <div className="mono eyebrow">Sender</div>
              <div className="inbox-read-card__name">{message.name}</div>
              <div className="inbox-read-card__line">{message.email || "No email provided"}</div>
              {message.phone && <div className="inbox-read-card__line">{message.phone}</div>}
            </div>
            <InboxField label="Message">
              <textarea className="ifield" rows="10" value={message.body || ""} readOnly />
            </InboxField>
            <div className="cluster">
              {message.cvFile?.downloadUrl && <a className="btn accent sm" href={message.cvFile.downloadUrl} target="_blank" rel="noreferrer">Download attachment</a>}
            </div>
          </div>
        </div>
        <div className="edit-modal-foot">
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Received {(message.receivedAt || message.createdAt) ? new Date(message.receivedAt || message.createdAt).toLocaleDateString("en-PG", { day: "numeric", month: "short", year: "numeric" }) : "recently"}</span>
          <div className="cluster">
            <button className="btn" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InboxField({ label, children }) {
  return (
    <label className="inbox-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

window.Topbar = Topbar;
