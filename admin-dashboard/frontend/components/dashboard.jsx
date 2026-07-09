// GlondiaSites Admin Overview — business snapshot for site/hosting/billing admin
function GlondiaDashboard({ overview, settings, setView }) {
  const accountSettings = settings?.accountSettings || {};
  const profile = settings?.profile || {};
  const displayName = accountSettings.fullName || profile.displayName || profile.username || "there";
  const firstName = displayName.split(/\s+/)[0] || displayName;
  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";
  const formattedDate = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" })
    .format(now).replace(",", " ·");

  const recent = overview?.recent || {};

  const stats = [
    { label: "Total Customers",    value: overview?.users                    ?? "—", sub: "registered accounts", view: "customers" },
    { label: "Active Deployments", value: overview?.deployments?.total        ?? "—", sub: "live sites & apps",   view: "deployments" },
    { label: "Pending Orders",     value: overview?.orders?.pending           ?? "—", sub: "awaiting processing", view: "billing" },
    { label: "Pending Receipts",   value: overview?.receipts?.pending         ?? "—", sub: "require review",      view: "receipts" },
  ];

  const recentUsers       = recent.users       || [];
  const recentDeployments = recent.deployments || [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="mono eyebrow">{formattedDate}</div>
          <h1 className="page-title" style={{ marginTop: 8 }}>{greeting}, <em>{firstName}</em>.</h1>
          <div className="page-sub">A snapshot of your GlondiaSites operations — customers, hosting, billing, and what needs attention.</div>
        </div>
      </div>

      <div className="grid cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card stat clickable" onClick={() => setView(s.view)}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid cols-2" style={{ marginTop: 20 }}>
        <div className="card">
          <div className="card-head">
            <div className="card-title">Recent Customers</div>
            <button className="btn ghost sm" onClick={() => setView("customers")}>View all →</button>
          </div>
          <div className="stack" style={{ gap: 0 }}>
            {recentUsers.length === 0 && (
              <div style={{ color: "var(--muted)", padding: "12px 0" }}>No recent customers.</div>
            )}
            {recentUsers.slice(0, 6).map((u) => (
              <div key={u.id} className="list-row">
                <div>
                  <div style={{ fontWeight: 500 }}>{u.username || u.email || u.id}</div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                    {u.email}{u.plan ? ` · ${u.plan}` : ""}
                  </div>
                </div>
                <span className={"status-badge status-" + (u.status === "active" ? "published" : u.status || "draft")}>
                  {u.status || "active"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">Recent Deployments</div>
            <button className="btn ghost sm" onClick={() => setView("deployments")}>View all →</button>
          </div>
          <div className="stack" style={{ gap: 0 }}>
            {recentDeployments.length === 0 && (
              <div style={{ color: "var(--muted)", padding: "12px 0" }}>No recent deployments.</div>
            )}
            {recentDeployments.slice(0, 6).map((d) => (
              <div key={d.id} className="list-row">
                <div>
                  <div style={{ fontWeight: 500 }}>{d.name || d.id}</div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                    {d.userId ? `user:${d.userId}` : ""}{d.plan ? ` · ${d.plan}` : ""}
                  </div>
                </div>
                <span className={"status-badge status-" + (d.status === "active" ? "published" : d.status === "suspended" ? "draft" : d.status || "draft")}>
                  {d.status || "pending"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {!overview && (
        <div className="card" style={{ marginTop: 20, padding: "20px 24px", color: "var(--muted)" }}>
          Admin overview data not yet available. Check that <code>/api/admin/overview</code> is returning data.
        </div>
      )}
    </div>
  );
}

window.GlondiaDashboard = GlondiaDashboard;

// Keep window.Dashboard as alias for compatibility
window.Dashboard = GlondiaDashboard;
