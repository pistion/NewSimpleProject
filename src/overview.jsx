// overview.jsx — dashboard landing
import React from 'react';
import { ICN } from './icons';
import { GD } from './data';
import { StatusBadge, Tabs, Stat, Empty } from './components';
import { useProjects } from './use-projects';
import { useActivity } from './use-activity';
import { getStoredAuth } from './api';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function Overview({ navigate }) {
  const { projects, source } = useProjects();
  const { items: activity, source: activitySource } = useActivity(8);
  const totalVisitors = projects.reduce((a, p) => a + (p.visitors30d || 0), 0);
  const auth = getStoredAuth();
  const userName = auth.user?.name || auth.user?.email || null;
  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Workspace{userName ? ` · ${userName}` : ''}</div>
          <h1>{greeting()}. {projects.length} project{projects.length === 1 ? '' : 's'} in your workspace.</h1>
          <p className="sub">A summary of your sites, hosting, and recent activity. Jump back into anything in progress.</p>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => navigate({ view: "builder-gallery" })}>
            <ICN.Plus size={14} /> New project
          </button>
        </div>
      </div>

      {/* Stat row */}
      <div className="grid-4">
        <Stat k="Projects"      v={String(projects.length)}   d={source === "api" ? "Loaded from backend" : "Connect to backend to load"} />
        <Stat k="Hosting"       v={projects.length ? String(projects.length) : "—"}   d="Active hosted sites" />
        <Stat k="Visitors (30d)" v={projects.length ? totalVisitors.toLocaleString() : "—"} d={projects.length ? "across all projects" : "No projects yet"} />
        <Stat k="Build minutes" v="—"   d="Loaded from billing API" />
      </div>

      {/* Projects + activity */}
      <div className="grid-side">
        <div className="card card-flush">
          <div className="card-head">
            <h2>Projects</h2>
            <div className="row" style={{ gap: 8 }}>
              <Tabs value="all" onChange={() => {}} options={["All", "Production", "Preview"]} />
              <button className="btn btn-sm btn-outline" onClick={() => navigate({ view: "hosting-list" })}>View all <ICN.ArrowRight size={12} /></button>
            </div>
          </div>
          <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Project</th><th>Live URL</th><th>Last deploy</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {projects.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <Empty icon="Server" title="No projects yet"
                      body="Create your first project or connect the backend to load existing ones."
                      action={<button className="btn btn-sm btn-primary" onClick={() => navigate({ view: "builder-gallery" })}><ICN.Plus size={13} /> New project</button>} />
                  </td>
                </tr>
              ) : projects.map(p => (
                <tr key={p.id}>
                  <td>
                    <a href="#" className="proj-link"
                       onClick={(e) => { e.preventDefault(); navigate({ view: "hosting-detail", params: { id: p.id } }); }}>
                      <span className="proj-thumb">{p.framework[0]}</span>
                      <span>
                        <div>{p.name}</div>
                        <div className="faint" style={{ fontSize: 12 }}>{p.framework} · {p.repo}</div>
                      </span>
                    </a>
                  </td>
                  <td className="mono">{p.liveUrl || p.customDomain || p.domain || "—"}</td>
                  <td>{p.lastDeploy}</td>
                  <td><StatusBadge value={p.status} /></td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn btn-sm btn-ghost"><ICN.ExternalLink size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        <div className="card card-flush">
          <div className="card-head"><h2>Activity</h2><span className="meta">{activitySource === "api" ? "Backend" : "No data yet"}</span></div>
          <div style={{ padding: "8px 4px" }}>
            {activity.length === 0 ? (
              <Empty icon="Activity" title="No activity yet" body="Actions in your workspace will appear here." />
            ) : activity.map(a => (
              <div key={a.id} className="row" style={{ padding: "10px 16px", gap: 12, borderBottom: "1px solid var(--border)" }}>
                <span style={{
                  width: 28, height: 28, borderRadius: 999,
                  background: a.kind === "deploy" ? "var(--accent-soft)" : a.kind === "domain" ? "color-mix(in srgb, var(--info) 14%, transparent)" : a.kind === "ssl" ? "color-mix(in srgb, var(--warning) 14%, transparent)" : "var(--bg-deep)",
                  color: a.kind === "deploy" ? "var(--accent)" : a.kind === "domain" ? "var(--info)" : a.kind === "ssl" ? "var(--warning)" : "var(--text-muted)",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  {a.kind === "deploy" && <ICN.Rocket size={14} />}
                  {a.kind === "domain" && <ICN.Globe size={14} />}
                  {a.kind === "ssl" && <ICN.ShieldCheck size={14} />}
                  {a.kind === "builder" && <ICN.Layers size={14} />}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5 }}>{a.what}</div>
                  <div className="faint" style={{ fontSize: 12 }}>{a.who} · {a.when}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Three product CTAs */}
      <div className="grid-3">
        <ProductCta icon="Server" title="Hosting" body="Deploy from ZIP or GitHub and manage live sites." cta="Open hosting" onClick={() => navigate({ view: "hosting-list" })} />
        <ProductCta icon="Layers" title="Site builder" body="Prepare, organize, and publish sites." cta="Browse templates" onClick={() => navigate({ view: "builder-gallery" })} />
        <ProductCta icon="CreditCard" title="Billing" body="View K50/K200 launch bills and upload bank receipts." cta="Open billing" onClick={() => navigate({ view: "billing" })} />
      </div>
    </>
  );
}

function ProductCta({ icon, title, body, cta, onClick }) {
  const Icon = ICN[icon];
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <span style={{
        width: 40, height: 40, borderRadius: 10,
        background: "var(--accent-soft)", color: "var(--accent-ink)",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}><Icon size={18} /></span>
      <div>
        <h3 style={{ margin: 0, fontFamily: "var(--serif)", fontWeight: 500, fontSize: 22, letterSpacing: "-0.005em" }}>{title}</h3>
        <p className="muted" style={{ margin: "6px 0 0" }}>{body}</p>
      </div>
      <button className="btn btn-outline" style={{ alignSelf: "flex-start" }} onClick={onClick}>
        {cta} <ICN.ArrowRight size={14} />
      </button>
    </div>
  );
}
