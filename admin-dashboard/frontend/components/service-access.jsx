// GlondiaSites Admin Dashboard — Service Access view

function ServiceAccessView() {
  const [items, setItems] = React.useState([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [actionErr, setActionErr] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [filterType, setFilterType] = React.useState("");
  const [filterAccess, setFilterAccess] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (filterType)   params.serviceType   = filterType;
      if (filterAccess) params.accessStatus  = filterAccess;
      const result = await window.HEYA_API.listServiceAccess(params);
      setItems(result.items || []);
      setTotal(result.total || 0);
    } catch (ex) {
      setError(ex.message || "Failed to load service access records.");
    } finally {
      setLoading(false);
    }
  }, [filterType, filterAccess]);

  React.useEffect(() => { load(); }, [load]);

  async function handleSuspend(id) {
    const reason = window.prompt("Reason for suspension?");
    if (reason == null) return;
    setBusy("suspend-" + id); setActionErr("");
    try {
      await window.HEYA_API.suspendServiceAccess(id, reason);
      await load();
    } catch (ex) { setActionErr(ex.message || "Suspend failed."); }
    finally { setBusy(""); }
  }

  async function handleReactivate(id) {
    if (!window.confirm("Reactivate this service access?")) return;
    setBusy("reactivate-" + id); setActionErr("");
    try {
      await window.HEYA_API.reactivateServiceAccess(id);
      await load();
    } catch (ex) { setActionErr(ex.message || "Reactivate failed."); }
    finally { setBusy(""); }
  }

  function AccessBadge({ status }) {
    const map = {
      active:    "status-published",
      pending:   "status-ready",
      suspended: "status-draft",
      expired:   "status-draft",
      cancelled: "status-draft",
      deleted:   "status-draft",
    };
    return <span className={"status-badge " + (map[status] || "status-draft")}>{status || "—"}</span>;
  }

  function BillingBadge({ status }) {
    const map = {
      paid:             "status-published",
      trial:            "status-published",
      free:             "status-published",
      pending:          "status-ready",
      payment_uploaded: "status-ready",
      overdue:          "status-draft",
      failed:           "status-draft",
      cancelled:        "status-draft",
    };
    return <span className={"status-badge " + (map[status] || "status-draft")}>{status || "—"}</span>;
  }

  function AdminBadge({ status }) {
    const map = {
      allowed:         "status-published",
      review_required: "status-ready",
      blocked:         "status-draft",
    };
    return <span className={"status-badge " + (map[status] || "status-draft")}>{status || "allowed"}</span>;
  }

  function fmtDate(val) {
    if (!val) return "—";
    return new Date(val).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
  }

  const SERVICE_TYPES = ["hosting", "vps", "domain", "email", "builder"];
  const ACCESS_STATUSES = ["active", "pending", "suspended", "expired", "cancelled", "deleted"];
  const SearchToolbar = window.AdminSearchToolbar;
  const filteredItems = items.filter((item) => window.adminTextMatchesRow(item, search));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Service Access</h1>
          <div className="page-sub">Monthly access passes — {total} record{total !== 1 ? "s" : ""}.</div>
        </div>
        <div className="cluster">
          <button className="btn ghost sm" onClick={load}>Refresh</button>
        </div>
      </div>

      <SearchToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search service access by customer, type, service ID, status..."
        count={filteredItems.length}
        busy={loading}
        filters={[
          {
            key: "serviceType",
            label: "Type",
            value: filterType,
            onChange: setFilterType,
            options: [{ value: "", label: "All types" }].concat(SERVICE_TYPES.map((t) => ({ value: t, label: t }))),
          },
          {
            key: "accessStatus",
            label: "Access",
            value: filterAccess,
            onChange: setFilterAccess,
            options: [{ value: "", label: "All statuses" }].concat(ACCESS_STATUSES.map((s) => ({ value: s, label: s }))),
          },
        ]}
      />

      {actionErr && (
        <div style={{ marginBottom: 12, padding: "10px 16px", background: "var(--danger-bg, #fef2f2)", color: "var(--danger)", borderRadius: 6, fontSize: 13 }}>
          {actionErr}
        </div>
      )}

      {loading && (
        <div className="card" style={{ padding: "32px 24px", textAlign: "center", color: "var(--muted)" }}>Loading…</div>
      )}

      {error && (
        <div className="card" style={{ padding: "20px 24px", color: "var(--danger)" }}>{error}</div>
      )}

      {!loading && !error && filteredItems.length === 0 && (
        <div className="card" style={{ padding: "36px 24px", textAlign: "center", color: "var(--muted)" }}>
          No service access records found.
        </div>
      )}

      {!loading && !error && filteredItems.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line-2)" }}>
                {["Customer", "Type", "Service ID", "Access", "Billing", "Admin", "Expires", "Last Activity", "Actions"].map((h) => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted)", fontWeight: 500, whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((row, idx) => {
                const isLast = idx === filteredItems.length - 1;
                const userLabel = row.user?.email || row.userId || "—";
                return (
                  <tr key={row.id} style={{ borderBottom: isLast ? "none" : "1px solid var(--line-2)" }}>
                    <td style={{ padding: "10px 16px", fontSize: 13 }}>
                      <div>{row.user?.name || userLabel}</div>
                      {row.user?.email && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{row.user.email}</div>}
                    </td>
                    <td style={{ padding: "10px 16px", fontSize: 13, fontFamily: "var(--font-mono)" }}>{row.serviceType || "—"}</td>
                    <td style={{ padding: "10px 16px", fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--muted)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.serviceId || "—"}
                    </td>
                    <td style={{ padding: "10px 16px" }}><AccessBadge status={row.accessStatus} /></td>
                    <td style={{ padding: "10px 16px" }}><BillingBadge status={row.billingStatus} /></td>
                    <td style={{ padding: "10px 16px" }}><AdminBadge status={row.adminStatus} /></td>
                    <td style={{ padding: "10px 16px", fontSize: 13 }}>{fmtDate(row.expiresAt)}</td>
                    <td style={{ padding: "10px 16px", fontSize: 13 }}>{fmtDate(row.lastActivityAt)}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <div className="cluster" style={{ gap: 6 }}>
                        {row.accessStatus !== "suspended" ? (
                          <button
                            className="btn ghost sm"
                            disabled={busy === "suspend-" + row.id}
                            onClick={() => handleSuspend(row.id)}
                            style={{ fontSize: 11 }}
                          >
                            {busy === "suspend-" + row.id ? "…" : "Suspend"}
                          </button>
                        ) : (
                          <button
                            className="btn ghost sm"
                            disabled={busy === "reactivate-" + row.id}
                            onClick={() => handleReactivate(row.id)}
                            style={{ fontSize: 11 }}
                          >
                            {busy === "reactivate-" + row.id ? "…" : "Reactivate"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

window.ServiceAccessView = ServiceAccessView;
