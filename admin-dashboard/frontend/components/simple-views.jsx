// GlondiaSites Admin Dashboard — tab view components

// ── Shared helpers ────────────────────────────────────────────────────────────

function AdminPage({ title, subtitle, actions, children }) {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <div className="page-sub">{subtitle}</div>}
        </div>
        {actions && <div className="cluster">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

function DataTable({ columns, rows, keyField = "id", onRowClick }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="card" style={{ padding: "36px 24px", textAlign: "center", color: "var(--muted)" }}>
        No records found.
      </div>
    );
  }
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--line-2)" }}>
            {columns.map((col) => (
              <th key={col.key} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted)", fontWeight: 500 }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={row[keyField] || idx}
              className={onRowClick ? "list-row" : ""}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{ borderBottom: idx < rows.length - 1 ? "1px solid var(--line-2)" : "none", cursor: onRowClick ? "pointer" : "default" }}
            >
              {columns.map((col) => (
                <td key={col.key} style={{ padding: "10px 16px", fontSize: 13 }}>
                  {col.render ? col.render(row[col.key], row) : (row[col.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    active: "status-published", published: "status-published",
    suspended: "status-draft",  disabled: "status-draft",
    pending: "status-ready",    approved: "status-published",
    rejected: "status-draft",   paid: "status-published",
  };
  return <span className={"status-badge " + (map[status] || "status-draft")}>{status || "unknown"}</span>;
}

function FmtDate({ value }) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

function LoadingCard() {
  return <div className="card" style={{ padding: "32px 24px", textAlign: "center", color: "var(--muted)" }}>Loading…</div>;
}

function ErrorCard({ message }) {
  return <div className="card" style={{ padding: "20px 24px", color: "var(--danger)" }}>{message || "An error occurred."}</div>;
}

function PendingDataCard({ tab }) {
  return (
    <div className="card" style={{ padding: "36px 24px", textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 20, marginBottom: 8 }}>Data path pending</div>
      <div style={{ color: "var(--muted)", fontSize: 13 }}>
        The <strong>{tab}</strong> tab is shaped and ready for backend integration. No data source has been connected yet.
      </div>
    </div>
  );
}

function useAdminData(fetcher) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    fetcher()
      .then((result) => setData(result))
      .catch((err) => setError(err.message || "Failed to load."))
      .finally(() => setLoading(false));
  }, []);
  React.useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

// ── Customers ─────────────────────────────────────────────────────────────────

function CustomersView() {
  const { data, loading, error, reload } = useAdminData(() => window.HEYA_API.listCustomers());
  const [selected, setSelected] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [actionError, setActionError] = React.useState("");

  const users = Array.isArray(data) ? data : (data?.users || []);

  async function handleAction(action, userId) {
    setBusy(action + userId);
    setActionError("");
    try {
      if (action === "suspend") {
        const reason = window.prompt("Reason for suspension?");
        if (reason == null) { setBusy(""); return; }
        await window.HEYA_API.suspendCustomer(userId, reason);
      } else if (action === "reactivate") {
        await window.HEYA_API.reactivateCustomer(userId);
      } else if (action === "delete") {
        if (!window.confirm("Permanently delete this customer account?")) { setBusy(""); return; }
        await window.HEYA_API.deleteCustomer(userId, "Admin deleted");
      }
      setSelected(null);
      reload();
    } catch (err) {
      setActionError(err.message || "Action failed.");
    } finally {
      setBusy("");
    }
  }

  const columns = [
    { key: "username",  label: "Username",  render: (v, r) => v || r.email || r.id },
    { key: "email",     label: "Email" },
    { key: "plan",      label: "Plan",      render: (v) => v || "—" },
    { key: "status",    label: "Status",    render: (v) => <StatusBadge status={v || "active"} /> },
    { key: "createdAt", label: "Joined",    render: (v) => <FmtDate value={v} /> },
  ];

  return (
    <AdminPage title="Customers" subtitle="All registered GlondiaSites customer accounts."
      actions={<button className="btn ghost sm" onClick={reload}>Refresh</button>}
    >
      {loading && <LoadingCard />}
      {error && <ErrorCard message={error} />}
      {!loading && !error && <DataTable columns={columns} rows={users} onRowClick={setSelected} />}

      {selected && (
        <div className="publish-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
          <div className="edit-modal">
            <div className="edit-modal-head">
              <div>
                <div className="mono eyebrow">Customer</div>
                <div className="edit-modal-title">{selected.username || selected.email || selected.id}</div>
              </div>
              <button className="icon-btn" onClick={() => setSelected(null)}>×</button>
            </div>
            <div className="edit-modal-body stack" style={{ gap: 8 }}>
              {[["ID", selected.id], ["Email", selected.email], ["Username", selected.username], ["Plan", selected.plan], ["Status", selected.status], ["Joined", selected.createdAt ? new Date(selected.createdAt).toLocaleString() : "—"]].map(([label, val]) => (
                <div key={label} style={{ display: "flex", gap: 12 }}>
                  <span className="mono" style={{ fontSize: 11, color: "var(--muted)", minWidth: 80 }}>{label}</span>
                  <span style={{ fontSize: 13 }}>{val || "—"}</span>
                </div>
              ))}
              {actionError && <div style={{ color: "var(--danger)", fontSize: 13 }}>{actionError}</div>}
            </div>
            <div className="edit-modal-foot">
              <div className="cluster">
                {(selected.status !== "suspended" && selected.status !== "disabled") ? (
                  <button className="btn ghost sm" disabled={!!busy} onClick={() => handleAction("suspend", selected.id)}>
                    {busy === "suspend" + selected.id ? "Suspending…" : "Suspend"}
                  </button>
                ) : (
                  <button className="btn accent sm" disabled={!!busy} onClick={() => handleAction("reactivate", selected.id)}>
                    {busy === "reactivate" + selected.id ? "Reactivating…" : "Reactivate"}
                  </button>
                )}
                <button className="btn ghost sm" style={{ color: "var(--danger)" }} disabled={!!busy} onClick={() => handleAction("delete", selected.id)}>Delete</button>
                <button className="btn" onClick={() => setSelected(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminPage>
  );
}

// ── Deployments ───────────────────────────────────────────────────────────────

function CustomerAccountsView() {
  const { data, loading, error, reload } = useAdminData(() => window.HEYA_API.listCustomers());
  const [selected, setSelected] = React.useState(null);
  const [selectedDetail, setSelectedDetail] = React.useState(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailTab, setDetailTab] = React.useState("overview");
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [busy, setBusy] = React.useState("");
  const [actionError, setActionError] = React.useState("");

  const users = Array.isArray(data) ? data : (data?.users || []);
  const statusCounts = users.reduce((acc, user) => {
    const status = String(user.status || "active").toLowerCase();
    acc.all += 1;
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, { all: 0 });
  const filteredUsers = users.filter((user) => {
    const status = String(user.status || "active").toLowerCase();
    const query = search.trim().toLowerCase();
    const haystack = [user.username, user.email, user.id, user.plan, status].filter(Boolean).join(" ").toLowerCase();
    return (!query || haystack.includes(query)) && (statusFilter === "all" || status === statusFilter);
  });

  async function openCustomer(user) {
    setSelected(user);
    setSelectedDetail(null);
    setDetailTab("overview");
    setActionError("");
    setDetailLoading(true);
    try {
      const detail = await window.HEYA_API.getCustomer(user.id);
      setSelectedDetail(detail);
      setSelected(detail.user || user);
    } catch (err) {
      setSelectedDetail({ user, deployments: [], orders: [], receipts: [], totals: {} });
      setActionError(err.message || "Could not load customer detail.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleAction(action, userId) {
    setBusy(action + userId);
    setActionError("");
    try {
      if (action === "suspend") {
        const reason = window.prompt("Reason for suspension?");
        if (reason == null) { setBusy(""); return; }
        await window.HEYA_API.suspendCustomer(userId, reason);
      } else if (action === "reactivate") {
        await window.HEYA_API.reactivateCustomer(userId);
      } else if (action === "delete") {
        if (!window.confirm("Permanently delete this customer account?")) { setBusy(""); return; }
        await window.HEYA_API.deleteCustomer(userId, "Admin deleted");
      }
      setSelected(null);
      setSelectedDetail(null);
      reload();
    } catch (err) {
      setActionError(err.message || "Action failed.");
    } finally {
      setBusy("");
    }
  }

  const tabs = [["all", "All customers"], ["active", "Active"], ["suspended", "Suspended"], ["disabled", "Disabled"], ["deleted", "Deleted"]];

  return (
    <AdminPage title="Customers" subtitle="Customer account cards, service ownership, analytics, and access status." actions={<button className="btn ghost sm" onClick={reload}>Refresh</button>}>
      {loading && <LoadingCard />}
      {error && <ErrorCard message={error} />}
      {!loading && !error && (
        selected ? (
          <div className="customer-inline-panel">
            <div className="customer-inline-panel__bar">
              <button className="btn ghost sm" onClick={() => { setSelected(null); setSelectedDetail(null); setActionError(""); }}>Back to customers</button>
              <div className="cluster">
                {(selected.status !== "suspended" && selected.status !== "disabled") ? (
                  <button className="btn ghost sm" disabled={!!busy} onClick={() => handleAction("suspend", selected.id)}>
                    {busy === "suspend" + selected.id ? "Suspending..." : "Suspend"}
                  </button>
                ) : (
                  <button className="btn accent sm" disabled={!!busy} onClick={() => handleAction("reactivate", selected.id)}>
                    {busy === "reactivate" + selected.id ? "Reactivating..." : "Reactivate"}
                  </button>
                )}
                <button className="btn ghost sm" style={{ color: "var(--danger)" }} disabled={!!busy} onClick={() => handleAction("delete", selected.id)}>Delete</button>
              </div>
            </div>
            <CustomerDetailShell selected={selected} detail={selectedDetail} loading={detailLoading} activeTab={detailTab} setActiveTab={setDetailTab} />
            {actionError && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{actionError}</div>}
          </div>
        ) : (
          <div className="customer-pool talent-customer-pool">
            <div className="pool-tab-strip">
              {tabs.map(([key, label]) => (
                <button key={key} className={"pool-tab" + (statusFilter === key ? " is-active" : "")} onClick={() => setStatusFilter(key)}>
                  {label} <span className="pool-tab-count">{statusCounts[key] || 0}</span>
                </button>
              ))}
            </div>
            <div className="customer-pool-toolbar">
              <input className="customer-pool-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customers, email, plan, or status" />
              <div className="customer-pool-meta">{filteredUsers.length} shown</div>
            </div>
            <div className="talent-grid">
              {filteredUsers.length === 0 && <div className="card talent-empty-card">No customer accounts match this view.</div>}
              {filteredUsers.map((user) => <CustomerProfileCard key={user.id} user={user} onOpen={() => openCustomer(user)} />)}
            </div>
          </div>
        )
      )}
    </AdminPage>
  );
}

function CustomerProfileCard({ user, onOpen }) {
  const name = user.username || user.email || user.id;
  const hints = customerServiceHints(user);
  const plan = user.plan || user.planId || "Starter";
  return (
    <div className={"talent-card clickable " + customerToneFor(user)} onClick={onOpen}>
      <div className="talent-card__banner">
        <StatusBadge status={user.status || "active"} />
        <div className="talent-card__menu-wrap">
          <button className="icon-btn" title="Customer actions" onClick={(event) => { event.stopPropagation(); onOpen(); }}>...</button>
        </div>
      </div>
      <div className="talent-card__avatar-wrap">
        <div className={"avatar talent-card__avatar " + customerToneFor(user)}>{initialsForCustomer(name)}</div>
      </div>
      <div className="talent-card__body">
        <div className="talent-card__name">{name}</div>
        <div className="talent-card__role">{user.email || "customer account"}</div>
        <div className="talent-card__meta">
          <span className="talent-card__meta-chip">{plan}</span>
          <span className="talent-card__meta-chip">Joined <FmtDate value={user.createdAt} /></span>
        </div>
        <div className="talent-card__chips">{hints.map((hint) => <span key={hint} className="talent-card__chip">{hint}</span>)}</div>
      </div>
    </div>
  );
}

function CustomerDetailShell({ selected, detail, loading, activeTab, setActiveTab }) {
  const account = detail?.user || selected;
  const deployments = detail?.deployments || [];
  const orders = detail?.orders || [];
  const receipts = detail?.receipts || [];
  const totals = detail?.totals || {};
  const paidCents = Number(totals.paidCents || 0);
  const tabs = [
    { id: "overview", short: "Overview", full: "Customer Overview", color: "#FCE9EC", border: "#E8B8C1" },
    { id: "services", short: "Services", full: "Assigned Services", color: "#E7F6EE", border: "#BFE5CD" },
    { id: "analytics", short: "Insights", full: "Analytics & Insights", color: "#EAF0FE", border: "#C8D7FB" },
    { id: "billing", short: "Billing", full: "Orders & Billing", color: "#FBF1DC", border: "#EAD7A8" },
    { id: "access", short: "Access", full: "Account Access", color: "#E8F4F2", border: "#BFD8D2" },
    { id: "activity", short: "Activity", full: "Customer Activity", color: "#F4E9FE", border: "#DAC2F2" },
    { id: "notes", short: "Notes", full: "Internal Notes", color: "#F1F4E8", border: "#D4DDBB" },
    { id: "settings", short: "Settings", full: "Customer Settings", color: "#EEF1F5", border: "#CFD6E0" },
  ];
  const serviceRows = customerServiceRows(deployments, orders, receipts);
  const accountName = account.username || account.name || account.email || account.id;
  const plan = account.plan || account.planId || "Starter";

  return (
    <div className="cps-profile-outer customer-profile-outer">
      <div className="cps-tab-tray customer-cps-tab-tray">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            className={"cps-top-tab" + (activeTab === tab.id ? " is-active" : "")}
            style={{ background: tab.color, borderColor: tab.border, zIndex: index + 1 }}
            onClick={() => setActiveTab(tab.id)}
            title={tab.full}
          >
            <span className="cps-tab-num">{index + 1}</span>
            <span className="cps-tab-name">{tab.short}</span>
          </button>
        ))}
      </div>

      <div className="talent-profile-card customer-place-card">
        <div className="talent-profile-hero customer-place-hero">
          <div className={"avatar tone-c customer-place-avatar " + customerToneFor(account)}>
            {initialsForCustomer(accountName)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h1 className="page-title customer-place-title">{accountName}</h1>
              <StatusBadge status={account.status || "active"} />
            </div>
            <div style={{ fontSize: 15, color: "var(--ink-2)", marginTop: 6 }}>{account.email || "No email on file"}</div>
            <div className="mono" style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
              {plan} - Joined {account.createdAt ? new Date(account.createdAt).toLocaleDateString("en-PG") : "not recorded"}
            </div>
            <div className="cluster customer-profile-chips">
              {customerServiceHints(account).map((hint) => <span key={hint} className="tag-pill talent-tag-pill">{hint}</span>)}
            </div>
          </div>
        </div>

        <div className="cps-tab-panel">
          {loading && <div className="customer-detail-loading">Loading customer profile...</div>}

          {!loading && activeTab === "overview" && (
            <div className="cps-panel-content talent-profile-body">
              <div className="stack" style={{ gap: 14 }}>
                <CustomerProfileSection title="Customer summary">
                  <div className="customer-detail-grid">
                    <CustomerMetric label="Deployments" value={deployments.length} note="Sites and apps assigned" />
                    <CustomerMetric label="Orders" value={orders.length} note="Service requests" />
                    <CustomerMetric label="Receipts" value={receipts.length} note="Payment proof records" />
                    <CustomerMetric label="Paid" value={`$${(paidCents / 100).toFixed(2)}`} note="Confirmed revenue" />
                  </div>
                </CustomerProfileSection>
                <CustomerProfileSection title="Account profile">
                  <CustomerKV k="Customer ID" v={account.id} />
                  <CustomerKV k="Name" v={account.name || account.username} />
                  <CustomerKV k="Organization" v={account.organizationName || account.profileDetails?.organizationName} />
                  <CustomerKV k="Plan" v={plan} />
                </CustomerProfileSection>
              </div>
              <div className="stack" style={{ gap: 14 }}>
                <CustomerProfileSection title="Contact">
                  <CustomerKV k="Email" v={account.email} />
                  <CustomerKV k="Phone" v={account.phone} />
                  <CustomerKV k="Status" v={account.status || account.accountStatus || "active"} />
                </CustomerProfileSection>
                <CustomerProfileSection title="Customer insight">
                  <CustomerKV k="Service footprint" v={`${deployments.length} deployment(s), ${orders.length} order(s), ${receipts.length} receipt(s)`} />
                  <CustomerKV k="Billing attention" v={orders.some((item) => String(item.status || "").toLowerCase() !== "paid") ? "Needs review" : "Clear"} />
                  <CustomerKV k="Receipt review" v={receipts.some((item) => String(item.status || "").toLowerCase() === "pending") ? "Pending approval" : "No pending receipt"} />
                </CustomerProfileSection>
              </div>
            </div>
          )}

          {!loading && activeTab === "services" && (
            <div className="cps-panel-content">
              <CustomerProfileSection title="Assigned services">
                <CustomerServiceList deployments={deployments} orders={orders} receipts={receipts} />
              </CustomerProfileSection>
            </div>
          )}

          {!loading && activeTab === "analytics" && (
            <div className="cps-panel-content talent-profile-body">
              <div className="stack" style={{ gap: 14 }}>
                <CustomerProfileSection title="Analytics">
                  <div className="customer-detail-grid">
                    <CustomerMetric label="Active services" value={deployments.filter((item) => String(item.status || "").toLowerCase() === "active").length} note="Currently live" />
                    <CustomerMetric label="Pending billing" value={orders.filter((item) => String(item.status || "").toLowerCase() !== "paid").length} note="Needs follow-up" />
                    <CustomerMetric label="Receipts pending" value={receipts.filter((item) => String(item.status || "").toLowerCase() === "pending").length} note="Awaiting approval" />
                    <CustomerMetric label="Plan" value={plan} note="Current account tier" />
                  </div>
                </CustomerProfileSection>
              </div>
              <div className="stack" style={{ gap: 14 }}>
                <CustomerProfileSection title="Insights">
                  <CustomerKV k="Customer value" v={paidCents > 0 ? "Revenue confirmed" : "No confirmed revenue yet"} />
                  <CustomerKV k="Operational signal" v={deployments.length ? "Service relationship active" : "No service assigned"} />
                  <CustomerKV k="Next action" v={serviceRows.length ? "Review latest service state" : "Assign or onboard service"} />
                </CustomerProfileSection>
              </div>
            </div>
          )}

          {!loading && activeTab === "billing" && (
            <div className="cps-panel-content stack" style={{ gap: 14 }}>
              <CustomerProfileSection title="Billing overview">
                <div className="customer-detail-grid">
                  <CustomerMetric label="Orders" value={orders.length} note="Total records" />
                  <CustomerMetric label="Receipts" value={receipts.length} note="Uploaded proof" />
                  <CustomerMetric label="Paid" value={`$${(paidCents / 100).toFixed(2)}`} note="Confirmed" />
                  <CustomerMetric label="Pending" value={orders.filter((item) => String(item.status || "").toLowerCase() !== "paid").length} note="Open items" />
                </div>
              </CustomerProfileSection>
              <CustomerProfileSection title="Orders and receipts">
                <CustomerServiceList deployments={[]} orders={orders} receipts={receipts} />
              </CustomerProfileSection>
            </div>
          )}

          {!loading && activeTab === "access" && (
            <div className="cps-panel-content talent-profile-body">
              <CustomerProfileSection title="Access record">
                <CustomerKV k="Customer ID" v={account.id} />
                <CustomerKV k="Email" v={account.email} />
                <CustomerKV k="Username" v={account.username} />
                <CustomerKV k="Role" v={account.role || "member"} />
                <CustomerKV k="Status" v={account.status || account.accountStatus || "active"} />
              </CustomerProfileSection>
              <CustomerProfileSection title="Security and lifecycle">
                <CustomerKV k="Created" v={account.createdAt ? new Date(account.createdAt).toLocaleString() : "-"} />
                <CustomerKV k="Updated" v={account.updatedAt ? new Date(account.updatedAt).toLocaleString() : "-"} />
                <CustomerKV k="Disabled reason" v={account.disabledReason} />
                <CustomerKV k="Deleted at" v={account.deletedAt ? new Date(account.deletedAt).toLocaleString() : ""} />
              </CustomerProfileSection>
            </div>
          )}

          {!loading && activeTab === "activity" && (
            <div className="cps-panel-content">
              <CustomerProfileSection title="Activity timeline">
                <CustomerActivityList account={account} deployments={deployments} orders={orders} receipts={receipts} />
              </CustomerProfileSection>
            </div>
          )}

          {!loading && activeTab === "notes" && (
            <div className="cps-panel-content">
              <CustomerEmptyState title="Internal notes" body="Customer notes, follow-up comments, and support observations will appear here once connected to the notes store." />
            </div>
          )}

          {!loading && activeTab === "settings" && (
            <div className="cps-panel-content talent-profile-body">
              <CustomerProfileSection title="Customer settings">
                <CustomerKV k="Promo eligible" v={account.promoEligible === false ? "No" : "Yes"} />
                <CustomerKV k="Promo signup rank" v={account.promoSignupRank} />
                <CustomerKV k="Promo claimed" v={account.promoClaimedAt ? new Date(account.promoClaimedAt).toLocaleString() : "Not claimed"} />
              </CustomerProfileSection>
              <CustomerProfileSection title="Service controls">
                <CustomerKV k="Current mode" v="Admin managed" />
                <CustomerKV k="Deletion state" v={account.deletedAt ? "Deleted" : "Active record"} />
                <CustomerKV k="Suspension state" v={String(account.status || account.accountStatus || "active").toLowerCase() === "suspended" ? "Suspended" : "Not suspended"} />
              </CustomerProfileSection>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CustomerMetric({ label, value, note }) {
  return <div className="customer-metric-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function CustomerProfileSection({ title, children }) {
  return (
    <div className="profile-section customer-profile-section">
      <div className="mono eyebrow" style={{ marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function CustomerKV({ k, v }) {
  return (
    <div className="customer-kv-row">
      <span>{k}</span>
      <strong>{v || "-"}</strong>
    </div>
  );
}

function CustomerServiceList({ deployments, orders, receipts }) {
  const rows = customerServiceRows(deployments, orders, receipts);
  if (!rows.length) return <div className="customer-pool-empty">No services, orders, or receipts are attached yet.</div>;
  return (
    <div className="customer-service-list">
      {rows.map((row, index) => (
        <div key={row.type + row.name + index} className="customer-service-row">
          <div><span>{row.type}</span><strong>{row.name}</strong></div>
          <StatusBadge status={row.status || "pending"} />
          <small><FmtDate value={row.date} /></small>
        </div>
      ))}
    </div>
  );
}

function CustomerActivityList({ account, deployments, orders, receipts }) {
  const rows = [
    { type: "Account", name: "Customer account created", status: account.status || account.accountStatus || "active", date: account.createdAt },
    ...customerServiceRows(deployments, orders, receipts),
  ].filter((row) => row.date || row.name);
  if (!rows.length) return <CustomerEmptyState title="No activity" body="No customer activity has been recorded yet." />;
  return (
    <div className="customer-service-list">
      {rows
        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
        .map((row, index) => (
          <div key={row.type + row.name + index} className="cps-submission-row customer-activity-row">
            <div className="cps-submission-index">{index + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{row.name}</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{row.type} - {row.date ? new Date(row.date).toLocaleString() : "No date"}</div>
            </div>
            <StatusBadge status={row.status || "recorded"} />
          </div>
        ))}
    </div>
  );
}

function CustomerEmptyState({ title, body }) {
  return (
    <div className="cps-empty-state">
      <div className="cps-empty-title">{title}</div>
      <div className="cps-empty-body">{body}</div>
    </div>
  );
}

function customerServiceRows(deployments, orders, receipts) {
  return [
    ...deployments.map((item) => ({ type: "Deployment", name: item.name || item.id, status: item.status, date: item.createdAt })),
    ...orders.map((item) => ({ type: "Order", name: item.description || item.id, status: item.status, date: item.createdAt })),
    ...receipts.map((item) => ({ type: "Receipt", name: item.reference || item.id, status: item.status, date: item.createdAt })),
  ];
}

function customerToneFor(user) {
  const key = String(user?.id || user?.email || user?.username || "a");
  return ["tone-a", "tone-b", "tone-c", "tone-d"][key.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4];
}

function customerServiceHints(user) {
  const items = [user.plan || user.planId || "Starter", user.status || "Active"];
  if (user.email) items.push("Email linked");
  if (user.createdAt) items.push("Profile tracked");
  return items.slice(0, 4);
}

function initialsForCustomer(name) {
  const clean = String(name || "?").replace(/@.*/, "").trim();
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  return (parts[0]?.[0] || "?").toUpperCase() + (parts[1]?.[0] || "").toUpperCase();
}

function DeploymentsView() {
  const { data, loading, error, reload } = useAdminData(() => window.HEYA_API.listDeployments());
  const [selected, setSelected] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [actionError, setActionError] = React.useState("");

  const deployments = Array.isArray(data) ? data : (data?.deployments || []);

  async function handleAction(action, dep) {
    setBusy(action + dep.id);
    setActionError("");
    try {
      if (action === "paid") await window.HEYA_API.markDeploymentPaid(dep.id);
      else if (action === "approveBilling") await window.HEYA_API.approveDeploymentBilling(dep.id);
      else if (action === "suspend") {
        const reason = window.prompt("Reason for suspension?");
        if (reason == null) { setBusy(""); return; }
        await window.HEYA_API.suspendDeployment(dep.id, reason);
      } else if (action === "reactivate") await window.HEYA_API.reactivateDeployment(dep.id);
      setSelected(null);
      reload();
    } catch (err) {
      setActionError(err.message || "Action failed.");
    } finally {
      setBusy("");
    }
  }

  const columns = [
    { key: "name",          label: "Deployment",  render: (v, r) => v || r.id },
    { key: "userId",        label: "Customer" },
    { key: "plan",          label: "Plan",         render: (v) => v || "—" },
    { key: "status",        label: "Status",       render: (v) => <StatusBadge status={v} /> },
    { key: "billingStatus", label: "Billing",      render: (v) => v ? <StatusBadge status={v} /> : "—" },
    { key: "createdAt",     label: "Created",      render: (v) => <FmtDate value={v} /> },
  ];

  return (
    <AdminPage title="Deployments" subtitle="All customer site and app deployments."
      actions={<button className="btn ghost sm" onClick={reload}>Refresh</button>}
    >
      {loading && <LoadingCard />}
      {error && <ErrorCard message={error} />}
      {!loading && !error && <DataTable columns={columns} rows={deployments} onRowClick={setSelected} />}

      {selected && (
        <div className="publish-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) { setSelected(null); setActionError(""); } }}>
          <div className="edit-modal">
            <div className="edit-modal-head">
              <div>
                <div className="mono eyebrow">Deployment</div>
                <div className="edit-modal-title">{selected.name || selected.id}</div>
              </div>
              <button className="icon-btn" onClick={() => { setSelected(null); setActionError(""); }}>×</button>
            </div>
            <div className="edit-modal-body stack" style={{ gap: 8 }}>
              {[["ID", selected.id], ["Customer", selected.userId], ["Plan", selected.plan], ["Render plan", selected.renderPlan], ["Status", selected.status], ["Billing", selected.billingStatus], ["Created", selected.createdAt ? new Date(selected.createdAt).toLocaleString() : "—"]].map(([label, val]) => (
                <div key={label} style={{ display: "flex", gap: 12 }}>
                  <span className="mono" style={{ fontSize: 11, color: "var(--muted)", minWidth: 100 }}>{label}</span>
                  <span style={{ fontSize: 13 }}>{val || "—"}</span>
                </div>
              ))}
              {actionError && <div style={{ color: "var(--danger)", fontSize: 13 }}>{actionError}</div>}
            </div>
            <div className="edit-modal-foot">
              <div className="cluster">
                <button className="btn ghost sm" disabled={!!busy} onClick={() => handleAction("paid", selected)}>
                  {busy === "paid" + selected.id ? "…" : "Mark Paid"}
                </button>
                <button className="btn ghost sm" disabled={!!busy} onClick={() => handleAction("approveBilling", selected)}>
                  {busy === "approveBilling" + selected.id ? "…" : "Approve Billing"}
                </button>
                {selected.status !== "suspended" ? (
                  <button className="btn ghost sm" disabled={!!busy} onClick={() => handleAction("suspend", selected)}>
                    {busy === "suspend" + selected.id ? "…" : "Suspend"}
                  </button>
                ) : (
                  <button className="btn accent sm" disabled={!!busy} onClick={() => handleAction("reactivate", selected)}>
                    {busy === "reactivate" + selected.id ? "…" : "Reactivate"}
                  </button>
                )}
                <button className="btn" onClick={() => { setSelected(null); setActionError(""); }}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminPage>
  );
}

// ── Billing (Orders) ──────────────────────────────────────────────────────────

function BillingView() {
  const { data, loading, error, reload } = useAdminData(() => window.HEYA_API.listOrders());
  const orders = Array.isArray(data) ? data : (data?.orders || []);

  const columns = [
    { key: "id",          label: "Order ID",    render: (v) => <span className="mono" style={{ fontSize: 12 }}>{String(v).slice(0, 12)}</span> },
    { key: "userId",      label: "Customer" },
    { key: "amount",      label: "Amount",      render: (v) => v != null ? `$${(Number(v) / 100).toFixed(2)}` : "—" },
    { key: "status",      label: "Status",      render: (v) => <StatusBadge status={v} /> },
    { key: "description", label: "Description", render: (v) => v || "—" },
    { key: "createdAt",   label: "Date",        render: (v) => <FmtDate value={v} /> },
  ];

  return (
    <AdminPage title="Billing" subtitle="Customer service orders and billing records."
      actions={<button className="btn ghost sm" onClick={reload}>Refresh</button>}
    >
      {loading && <LoadingCard />}
      {error && <ErrorCard message={error} />}
      {!loading && !error && <DataTable columns={columns} rows={orders} />}
    </AdminPage>
  );
}

// ── Receipts ──────────────────────────────────────────────────────────────────

function ReceiptsView() {
  const { data, loading, error, reload } = useAdminData(() => window.HEYA_API.listReceipts());
  const [busy, setBusy] = React.useState("");
  const [actionError, setActionError] = React.useState("");

  const receipts = Array.isArray(data) ? data : (data?.receipts || []);

  async function handleAction(action, receiptId) {
    setBusy(action + receiptId);
    setActionError("");
    try {
      if (action === "approve") {
        await window.HEYA_API.approveReceipt(receiptId);
      } else if (action === "reject") {
        const note = window.prompt("Rejection note:");
        if (note == null) { setBusy(""); return; }
        await window.HEYA_API.rejectReceipt(receiptId, note);
      }
      reload();
    } catch (err) {
      setActionError(err.message || "Action failed.");
    } finally {
      setBusy("");
    }
  }

  const columns = [
    { key: "id",        label: "Receipt ID",  render: (v) => <span className="mono" style={{ fontSize: 12 }}>{String(v).slice(0, 12)}</span> },
    { key: "userId",    label: "Customer" },
    { key: "amount",    label: "Amount",      render: (v) => v != null ? `$${(Number(v) / 100).toFixed(2)}` : "—" },
    { key: "status",    label: "Status",      render: (v) => <StatusBadge status={v} /> },
    { key: "createdAt", label: "Date",        render: (v) => <FmtDate value={v} /> },
    {
      key: "_actions", label: "Actions",
      render: (_, row) => row.status === "pending" ? (
        <div className="cluster" onClick={(e) => e.stopPropagation()}>
          <button className="btn accent sm" disabled={!!busy} onClick={() => handleAction("approve", row.id)}>
            {busy === "approve" + row.id ? "…" : "Approve"}
          </button>
          <button className="btn ghost sm" disabled={!!busy} onClick={() => handleAction("reject", row.id)}>
            {busy === "reject" + row.id ? "…" : "Reject"}
          </button>
        </div>
      ) : null,
    },
  ];

  return (
    <AdminPage title="Receipts" subtitle="Payment receipts pending review and approval."
      actions={<button className="btn ghost sm" onClick={reload}>Refresh</button>}
    >
      {actionError && <ErrorCard message={actionError} />}
      {loading && <LoadingCard />}
      {error && <ErrorCard message={error} />}
      {!loading && !error && <DataTable columns={columns} rows={receipts} />}
    </AdminPage>
  );
}

// ── Activity ──────────────────────────────────────────────────────────────────

function ActivityView() {
  const { data, loading, error, reload } = useAdminData(() => window.HEYA_API.getActivity({ limit: 50 }));
  const items = Array.isArray(data) ? data : (data?.activity || data?.items || []);

  const columns = [
    { key: "action",    label: "Action" },
    { key: "userId",    label: "User",   render: (v) => v ? <span className="mono" style={{ fontSize: 12 }}>{v}</span> : "—" },
    { key: "detail",    label: "Detail", render: (v) => v || "—" },
    { key: "ip",        label: "IP",     render: (v) => v ? <span className="mono" style={{ fontSize: 12 }}>{v}</span> : "—" },
    { key: "createdAt", label: "Time",   render: (v) => v ? new Date(v).toLocaleString() : "—" },
  ];

  return (
    <AdminPage title="Activity" subtitle="Admin audit log — recent system events and account actions."
      actions={<button className="btn ghost sm" onClick={reload}>Refresh</button>}
    >
      {loading && <LoadingCard />}
      {error && <ErrorCard message={error} />}
      {!loading && !error && <DataTable columns={columns} rows={items} />}
    </AdminPage>
  );
}

// ── Hosting, Domains, VPS, Tickets — placeholders ─────────────────────────────

function HostingView() {
  return (
    <AdminPage title="Hosting" subtitle="Manage customer web hosting plans and services.">
      <PendingDataCard tab="Hosting" />
    </AdminPage>
  );
}

function DomainsView() {
  return (
    <AdminPage title="Domains" subtitle="Domain registrations, DNS, and hosting domain assignments.">
      <PendingDataCard tab="Domains" />
    </AdminPage>
  );
}

function VpsView() {
  return (
    <AdminPage title="VPS Hosting" subtitle="Virtual private server allocations and management.">
      <PendingDataCard tab="VPS Hosting" />
    </AdminPage>
  );
}

function TicketsView() {
  return (
    <AdminPage title="Tickets" subtitle="Customer support requests, complaints, and service tickets.">
      <PendingDataCard tab="Tickets" />
    </AdminPage>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────

function AdminSettingsView({ settings, onSaveSettings, onSaveAccountSettings }) {
  const accountSettings = settings?.accountSettings || {};
  const profile = settings?.profile || {};
  const [fullName, setFullName] = React.useState(accountSettings.fullName || profile.displayName || "");
  const [email, setEmail] = React.useState(accountSettings.email || profile.email || "");
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const [error, setError] = React.useState("");

  async function handleSave(e) {
    e.preventDefault();
    setBusy(true);
    setNotice("");
    setError("");
    try {
      await onSaveAccountSettings({ fullName, email });
      setNotice("Settings saved.");
    } catch (err) {
      setError(err.message || "Failed to save settings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPage title="Settings" subtitle="Admin account and dashboard preferences.">
      <div className="card" style={{ maxWidth: 520 }}>
        <div className="card-head">
          <div className="card-title">Account details</div>
        </div>
        <form onSubmit={handleSave}>
          <div className="stack" style={{ gap: 14, padding: "0 0 16px" }}>
            <label style={{ display: "block" }}>
              <div className="mono" style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Full name</div>
              <input className="ifield" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
            </label>
            <label style={{ display: "block" }}>
              <div className="mono" style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Email</div>
              <input className="ifield" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" />
            </label>
          </div>
          {notice && <div style={{ fontSize: 13, color: "var(--accent)", marginBottom: 10 }}>{notice}</div>}
          {error && <div style={{ fontSize: 13, color: "var(--danger)", marginBottom: 10 }}>{error}</div>}
          <div className="card-foot">
            <button type="submit" className="btn accent" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
          </div>
        </form>
      </div>
    </AdminPage>
  );
}

window.CustomersView     = CustomerAccountsView;
window.DeploymentsView   = DeploymentsView;
window.BillingView       = BillingView;
window.ReceiptsView      = ReceiptsView;
window.ActivityView      = ActivityView;
window.HostingView       = HostingView;
window.DomainsView       = DomainsView;
window.VpsView           = VpsView;
window.TicketsView       = TicketsView;
window.AdminSettingsView = AdminSettingsView;
