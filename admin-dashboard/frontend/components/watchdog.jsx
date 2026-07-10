// GlondiaSites Admin Dashboard — Watchdog & Warnings views

// ── Shared severity badge ─────────────────────────────────────────────────────

function SeverityBadge({ severity }) {
  const map = {
    low:      "status-published",
    info:     "status-published",
    medium:   "status-ready",
    warning:  "status-ready",
    high:     "status-draft",
    danger:   "status-draft",
    critical: "status-draft",
  };
  return <span className={"status-badge " + (map[severity] || "status-draft")}>{severity || "unknown"}</span>;
}

function WatchdogStatusBadge({ status }) {
  const map = { open: "status-ready", reviewed: "status-published", dismissed: "status-draft", escalated: "status-draft" };
  return <span className={"status-badge " + (map[status] || "status-draft")}>{status || "unknown"}</span>;
}

// ── WatchdogView ──────────────────────────────────────────────────────────────

function WatchdogView() {
  const [filter, setFilter] = React.useState("open");
  const [search, setSearch] = React.useState("");
  const [items, setItems] = React.useState([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [actionErr, setActionErr] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = filter !== "all" ? { status: filter } : {};
      const result = await window.HEYA_API.listWatchdog(params);
      setItems(result.items || []);
      setTotal(result.total || 0);
    } catch (ex) { setError(ex.message || "Failed to load watchdog events."); }
    finally { setLoading(false); }
  }, [filter]);

  React.useEffect(() => { load(); }, [load]);

  async function handleReview(id) {
    setBusy("review-" + id); setActionErr("");
    try {
      await window.HEYA_API.reviewWatchdog(id);
      await load();
    } catch (ex) { setActionErr(ex.message || "Action failed."); }
    finally { setBusy(""); }
  }

  async function handleDismiss(id) {
    if (!window.confirm("Dismiss this watchdog event?")) return;
    setBusy("dismiss-" + id); setActionErr("");
    try {
      await window.HEYA_API.dismissWatchdog(id);
      await load();
    } catch (ex) { setActionErr(ex.message || "Action failed."); }
    finally { setBusy(""); }
  }

  const FILTERS = [
    { key: "open",     label: "Open" },
    { key: "reviewed", label: "Reviewed" },
    { key: "all",      label: "All" },
  ];

  const columns = [
    { key: "eventType", label: "Event Type", render: (v) => <span className="mono" style={{ fontSize: 12 }}>{v}</span> },
    { key: "severity",  label: "Severity",   render: (v) => <SeverityBadge severity={v} /> },
    { key: "status",    label: "Status",     render: (v) => <WatchdogStatusBadge status={v} /> },
    { key: "message",   label: "Message",    render: (v) => <span style={{ color: "var(--muted)", fontSize: 12 }}>{v ? v.slice(0, 80) + (v.length > 80 ? "…" : "") : "—"}</span> },
    { key: "createdAt", label: "Created",    render: (v) => <FmtDate value={v} /> },
    {
      key: "id",
      label: "Actions",
      render: (id, row) => row.status === "dismissed" ? null : (
        <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
          {row.status === "open" && (
            <button className="btn ghost sm" disabled={busy === "review-" + id} onClick={() => handleReview(id)}>
              Review
            </button>
          )}
          <button className="btn ghost sm" disabled={busy === "dismiss-" + id} onClick={() => handleDismiss(id)}>
            Dismiss
          </button>
        </div>
      ),
    },
  ];

  const SearchToolbar = window.AdminSearchToolbar;
  const filteredItems = items.filter((item) => window.adminTextMatchesRow(item, search));

  return (
    <AdminPage
      title="Watchdog"
      subtitle={`${total} event${total !== 1 ? "s" : ""} · monitoring alerts requiring review`}
      actions={<button className="btn ghost sm" onClick={load}>Refresh</button>}
    >
      <SearchToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search watchdog events by type, severity, status, message..."
        count={filteredItems.length}
        busy={loading}
        filters={[{
          key: "status",
          label: "Status",
          value: filter,
          onChange: setFilter,
          options: FILTERS.map((f) => ({ value: f.key, label: f.label })),
        }]}
      />

      {actionErr && <ErrorCard message={actionErr} />}
      {loading && <LoadingCard />}
      {error && <ErrorCard message={error} />}
      {!loading && !error && <DataTable columns={columns} rows={filteredItems} />}
    </AdminPage>
  );
}

// ── WarningsView ──────────────────────────────────────────────────────────────

function WarningsView() {
  const [filter, setFilter] = React.useState("open");
  const [search, setSearch] = React.useState("");
  const [items, setItems] = React.useState([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [actionErr, setActionErr] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = filter !== "all" ? { status: filter } : {};
      const result = await window.HEYA_API.listWarnings(params);
      setItems(result.items || []);
      setTotal(result.total || 0);
    } catch (ex) { setError(ex.message || "Failed to load warnings."); }
    finally { setLoading(false); }
  }, [filter]);

  React.useEffect(() => { load(); }, [load]);

  async function handleDismiss(id) {
    setBusy("dismiss-" + id); setActionErr("");
    try {
      await window.HEYA_API.dismissWarning(id);
      await load();
    } catch (ex) { setActionErr(ex.message || "Dismiss failed."); }
    finally { setBusy(""); }
  }

  async function handleEscalate(id) {
    if (!window.confirm("Escalate this warning to a Watchdog event?")) return;
    setBusy("escalate-" + id); setActionErr("");
    try {
      await window.HEYA_API.escalateWarning(id);
      await load();
    } catch (ex) { setActionErr(ex.message || "Escalation failed."); }
    finally { setBusy(""); }
  }

  const FILTERS = [
    { key: "open",      label: "Open" },
    { key: "escalated", label: "Escalated" },
    { key: "all",       label: "All" },
  ];

  const columns = [
    { key: "warningType",   label: "Type",     render: (v) => <span className="mono" style={{ fontSize: 12 }}>{v}</span> },
    { key: "severity",      label: "Severity", render: (v) => <SeverityBadge severity={v} /> },
    { key: "status",        label: "Status",   render: (v) => <WatchdogStatusBadge status={v} /> },
    { key: "affectedRoute", label: "Route",    render: (v) => v ? <span className="mono" style={{ fontSize: 11 }}>{v}</span> : "—" },
    { key: "count",         label: "Count" },
    { key: "lastSeenAt",    label: "Last Seen", render: (v) => <FmtDate value={v} /> },
    {
      key: "id",
      label: "Actions",
      render: (id, row) => row.status === "dismissed" ? null : (
        <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
          {row.status === "open" && (
            <button className="btn ghost sm" disabled={busy === "escalate-" + id} onClick={() => handleEscalate(id)}>
              Escalate
            </button>
          )}
          <button className="btn ghost sm" disabled={busy === "dismiss-" + id} onClick={() => handleDismiss(id)}>
            Dismiss
          </button>
        </div>
      ),
    },
  ];

  const SearchToolbar = window.AdminSearchToolbar;
  const filteredItems = items.filter((item) => window.adminTextMatchesRow(item, search));

  return (
    <AdminPage
      title="Warnings"
      subtitle={`${total} warning${total !== 1 ? "s" : ""} · early operational signals`}
      actions={<button className="btn ghost sm" onClick={load}>Refresh</button>}
    >
      <SearchToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search warnings by type, route, severity, status..."
        count={filteredItems.length}
        busy={loading}
        filters={[{
          key: "status",
          label: "Status",
          value: filter,
          onChange: setFilter,
          options: FILTERS.map((f) => ({ value: f.key, label: f.label })),
        }]}
      />

      {actionErr && <ErrorCard message={actionErr} />}
      {loading && <LoadingCard />}
      {error && <ErrorCard message={error} />}
      {!loading && !error && <DataTable columns={columns} rows={filteredItems} />}
    </AdminPage>
  );
}

window.WatchdogView  = WatchdogView;
window.WarningsView  = WarningsView;
