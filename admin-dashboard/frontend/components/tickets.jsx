// GlondiaSites Admin Dashboard — Tickets view

function TicketStatusBadge({ status }) {
  const map = {
    open:             "status-ready",
    pending_admin:    "status-draft",
    pending_customer: "status-published",
    closed:           "status-draft",
  };
  const label = { open: "Open", pending_admin: "Awaiting Admin", pending_customer: "Awaiting Customer", closed: "Closed" };
  return <span className={"status-badge " + (map[status] || "status-draft")}>{label[status] || status || "unknown"}</span>;
}

function TicketDetailPanel({ ticket, onClose, onAction }) {
  const [replyBody, setReplyBody] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [err, setErr] = React.useState("");

  async function handleReply(e) {
    e.preventDefault();
    if (!replyBody.trim()) return;
    setBusy("reply"); setErr("");
    try {
      await window.HEYA_API.replyAdminTicket(ticket.id, replyBody.trim());
      setReplyBody("");
      onAction();
    } catch (ex) { setErr(ex.message || "Reply failed."); }
    finally { setBusy(""); }
  }

  async function handleStatusChange(status) {
    setBusy("status"); setErr("");
    try {
      await window.HEYA_API.updateAdminTicket(ticket.id, { status });
      onAction();
    } catch (ex) { setErr(ex.message || "Update failed."); }
    finally { setBusy(""); }
  }

  const messages = ticket.messages || [];

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line-2)", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{ticket.subject}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <TicketStatusBadge status={ticket.status} />
            <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>#{ticket.id.slice(0, 8)}</span>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>{ticket.category} · {ticket.priority}</span>
          </div>
        </div>
        <button className="btn ghost sm" onClick={onClose}>Close</button>
      </div>

      {/* Actions */}
      <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--line-2)", display: "flex", gap: 8, flexWrap: "wrap" }}>
        {ticket.status !== "closed" && (
          <button className="btn ghost sm" disabled={busy === "status"} onClick={() => handleStatusChange("closed")}>
            Mark Closed
          </button>
        )}
        {ticket.status === "closed" && (
          <button className="btn ghost sm" disabled={busy === "status"} onClick={() => handleStatusChange("open")}>
            Reopen
          </button>
        )}
        {["urgent", "high"].includes(ticket.priority) && (
          <button className="btn ghost sm" disabled={busy === "status"} onClick={() => handleStatusChange("pending_admin")}>
            Mark Pending Admin
          </button>
        )}
        {err && <span style={{ color: "var(--danger)", fontSize: 12 }}>{err}</span>}
      </div>

      {/* Messages */}
      <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12, maxHeight: 340, overflowY: "auto" }}>
        {messages.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13 }}>No messages yet.</div>}
        {messages.map((m) => (
          <div key={m.id} style={{
            padding: "10px 14px",
            borderRadius: 8,
            background: m.senderRole === "admin" ? "var(--surface-2)" : "var(--surface-1)",
            border: "1px solid var(--line-2)",
            alignSelf: m.senderRole === "admin" ? "flex-end" : "flex-start",
            maxWidth: "85%",
          }}>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
              {m.senderRole === "admin" ? "Admin" : "Customer"} · <FmtDate value={m.createdAt} />
            </div>
            <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{m.body}</div>
          </div>
        ))}
      </div>

      {/* Reply */}
      {ticket.status !== "closed" && (
        <form onSubmit={handleReply} style={{ padding: "12px 20px", borderTop: "1px solid var(--line-2)", display: "flex", gap: 8 }}>
          <textarea
            className="input"
            style={{ flex: 1, minHeight: 60, resize: "vertical", fontSize: 13 }}
            placeholder="Write a reply…"
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            disabled={busy === "reply"}
          />
          <button className="btn sm" type="submit" disabled={busy === "reply" || !replyBody.trim()}>
            {busy === "reply" ? "…" : "Send"}
          </button>
        </form>
      )}
    </div>
  );
}

function TicketsView() {
  const [filter, setFilter] = React.useState("open");
  const [search, setSearch] = React.useState("");
  const [items, setItems] = React.useState([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [selected, setSelected] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = filter !== "all" ? { status: filter } : {};
      const result = await window.HEYA_API.listAdminTickets(params);
      setItems(result.items || []);
      setTotal(result.total || 0);
    } catch (ex) { setError(ex.message || "Failed to load tickets."); }
    finally { setLoading(false); }
  }, [filter]);

  React.useEffect(() => { load(); }, [load]);

  async function loadTicketDetail(id) {
    const full = await window.HEYA_API.getAdminTicket(id);
    if (full) setSelected(full);
  }

  const FILTERS = [
    { key: "all",             label: "All" },
    { key: "open",            label: "Open" },
    { key: "pending_admin",   label: "Awaiting Admin" },
    { key: "pending_customer",label: "Awaiting Customer" },
    { key: "closed",          label: "Closed" },
  ];

  const columns = [
    { key: "subject",   label: "Subject",   render: (v) => <span style={{ fontWeight: 500 }}>{v}</span> },
    { key: "category",  label: "Category" },
    { key: "priority",  label: "Priority",  render: (v) => <span style={{ textTransform: "capitalize" }}>{v}</span> },
    { key: "status",    label: "Status",    render: (v) => <TicketStatusBadge status={v} /> },
    { key: "createdAt", label: "Created",   render: (v) => <FmtDate value={v} /> },
    { key: "updatedAt", label: "Updated",   render: (v) => <FmtDate value={v} /> },
  ];

  const SearchToolbar = window.AdminSearchToolbar;
  const filteredItems = items.filter((item) => window.adminTextMatchesRow(item, search));

  return (
    <AdminPage title="Support Tickets" subtitle={`${total} ticket${total !== 1 ? "s" : ""} · ${filter === "all" ? "all statuses" : filter.replace("_", " ")}`}
      actions={<button className="btn ghost sm" onClick={load}>Refresh</button>}
    >
      <SearchToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search tickets by subject, customer, category, priority..."
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

      {loading && <LoadingCard />}
      {error && <ErrorCard message={error} />}
      {!loading && !error && (
        <DataTable
          columns={columns}
          rows={filteredItems}
          onRowClick={(row) => loadTicketDetail(row.id)}
        />
      )}

      {selected && (
        <div style={{ marginTop: 24 }}>
          <TicketDetailPanel
            ticket={selected}
            onClose={() => setSelected(null)}
            onAction={async () => {
              await loadTicketDetail(selected.id);
              load();
            }}
          />
        </div>
      )}
    </AdminPage>
  );
}

window.TicketsView = TicketsView;
