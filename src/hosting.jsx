// hosting.jsx — project list + project detail
import React, { useState as useStateH } from 'react';
import { ICN } from './icons';
import { GD } from './data';
import { StatusBadge, Tabs, Stat, Badge, Empty } from './components';
import { useProjects } from './use-projects';
import { useDeploymentLogs, useProjectArtifacts, useProjectDeployments, useProjectEnvVars } from './use-project-detail-data';
import { archiveProject, cancelDeployment, connectGitHubUrl, createDeployment, createEnvVar, createProject, deleteDomain, deleteEnvVar, disconnectGitHub, exportEnvVars, getGitHubStatus, linkProjectRepo, linkRenderService, listGitHubBranches, listGitHubRepos, listRenderServices, rollbackDeployment, updateDomain, updateEnvVar, updateProject } from './api';
import { useDomains } from './use-domains';

export function HostingList({ navigate }) {
  const { projects, loading, source, error } = useProjects();
  const [showCreate, setShowCreate] = useStateH(false);
  const [showImport, setShowImport] = useStateH(false);
  const [creating, setCreating] = useStateH(false);
  const [createError, setCreateError] = useStateH(null);
  const [projectForm, setProjectForm] = useStateH({
    name: '',
    framework: 'Next.js',
    productionBranch: 'main',
    buildCommand: 'npm run build',
    outputDirectory: '.next',
  });

  const updateProjectForm = (field, value) => {
    setProjectForm((current) => ({ ...current, [field]: value }));
  };

  const handleCreateProject = async (event) => {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);

    try {
      const project = await createProject(cleanPayload(projectForm));
      setShowCreate(false);
      navigate({ view: "hosting-detail", params: { id: project.id } });
      setProjectForm({
        name: '',
        framework: 'Next.js',
        productionBranch: 'main',
        buildCommand: 'npm run build',
        outputDirectory: '.next',
      });
    } catch (error) {
      setCreateError(error.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Hosting</div>
          <h1>Projects</h1>
          <p className="sub">Every site, app, and preview environment in your workspace.</p>
        </div>
        <div className="actions">
          <button className="btn btn-outline" onClick={() => setShowImport(true)}><ICN.Git size={14} /> Import from Git</button>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}><ICN.Plus size={14} /> New project</button>
        </div>
      </div>

      {showImport && (
        <ImportFromGitModal
          onClose={() => setShowImport(false)}
          onCreated={(project) => { setShowImport(false); navigate({ view: "hosting-detail", params: { id: project.id } }); }}
        />
      )}

      {source === "api" && (
        <div className="card" style={{ padding: "10px 14px", fontSize: 13 }}>
          <span className="row" style={{ gap: 8 }}><ICN.Server size={14} /> Connected to backend API</span>
        </div>
      )}
      {error && (
        <div className="card" style={{ padding: "10px 14px", fontSize: 13, color: "var(--text-muted)" }}>
          Backend unavailable, showing prototype data.
        </div>
      )}
      {showCreate && (
        <form className="card" onSubmit={handleCreateProject}>
          <div className="row between" style={{ marginBottom: 16 }}>
            <h2 style={{ margin: 0 }}>New project</h2>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
          <div className="grid-2" style={{ gap: 14 }}>
            <div>
              <label className="label">Project name</label>
              <input className="input" value={projectForm.name} onChange={(e) => updateProjectForm('name', e.target.value)} required minLength={2} />
            </div>
            <div>
              <label className="label">Framework</label>
              <select className="select" value={projectForm.framework} onChange={(e) => updateProjectForm('framework', e.target.value)}>
                {GD.frameworks.map(f => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Production branch</label>
              <input className="input mono" value={projectForm.productionBranch} onChange={(e) => updateProjectForm('productionBranch', e.target.value)} />
            </div>
            <div>
              <label className="label">Build command</label>
              <input className="input mono" value={projectForm.buildCommand} onChange={(e) => updateProjectForm('buildCommand', e.target.value)} />
            </div>
            <div>
              <label className="label">Output directory</label>
              <input className="input mono" value={projectForm.outputDirectory} onChange={(e) => updateProjectForm('outputDirectory', e.target.value)} />
            </div>
          </div>
          {createError && <div className="muted" style={{ color: "var(--danger)", marginTop: 12 }}>{createError}</div>}
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
            <button className="btn btn-primary" disabled={creating}>{creating ? "Creating..." : "Create project"}</button>
          </div>
        </form>
      )}

      <div className="row" style={{ gap: 10 }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
          <ICN.Search size={14} style={{ position: "absolute", left: 12, top: 12, color: "var(--text-faint)" }} />
          <input className="input" placeholder="Search projects…" style={{ paddingLeft: 34 }} />
        </div>
        <Tabs value="all" onChange={() => {}} options={["All", "Ready", "Building", "Failed"]} />
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm btn-outline"><ICN.Filter size={14} /> Region</button>
        <button className="btn btn-sm btn-outline"><ICN.Filter size={14} /> Framework</button>
      </div>

      {loading ? (
        <div className="card" style={{ padding: "40px 24px" }}>
          <Empty icon="Server" title="Loading projects…" />
        </div>
      ) : projects.length === 0 ? (
        <div className="card" style={{ padding: "48px 24px" }}>
          <Empty icon="Server" title="No projects yet"
            body="Import a Git repository or create a new project to get started."
            action={
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-outline" onClick={() => setShowImport(true)}><ICN.Git size={14} /> Import from Git</button>
                <button className="btn btn-primary" onClick={() => setShowCreate(true)}><ICN.Plus size={14} /> New project</button>
              </div>
            } />
        </div>
      ) : (
        <div className="grid-2">
          {projects.map(p => <ProjectCard key={p.id} p={p} navigate={navigate} />)}
        </div>
      )}
    </>
  );
}

function ProjectCard({ p, navigate }) {
  return (
    <a className="card" href="#"
       onClick={(e) => { e.preventDefault(); navigate({ view: "hosting-detail", params: { id: p.id } }); }}
       style={{ display: "flex", flexDirection: "column", gap: 14, color: "inherit", transition: "border-color .15s, box-shadow .15s" }}
       onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.boxShadow = "var(--shadow)"; }}
       onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}>
      <div className="row between">
        <div className="row" style={{ gap: 12, minWidth: 0 }}>
          <span className="proj-thumb" style={{ width: 36, height: 36, fontSize: 14 }}>{p.framework[0]}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</div>
            <div className="faint mono" style={{ fontSize: 12 }}>{p.repo}</div>
          </div>
        </div>
        <StatusBadge value={p.status} />
      </div>
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
        <div className="kv" style={{ gridTemplateColumns: "100px 1fr", gap: "6px 14px" }}>
          <dt>Domain</dt><dd className="mono" style={{ fontSize: 13 }}>{p.customDomain || p.domain}</dd>
          <dt>Branch</dt><dd className="mono" style={{ fontSize: 13 }}>{p.branch}</dd>
          <dt>Region</dt><dd>{p.region}</dd>
          <dt>Last deploy</dt><dd>{p.lastDeploy} · <span className="faint">{p.deployedBy}</span></dd>
        </div>
      </div>
    </a>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// PROJECT DETAIL
// ────────────────────────────────────────────────────────────────────────────

export function HostingDetail({ id, navigate }) {
  const { projects } = useProjects();
  const p = projects.find(x => x.id === id) || projects[0] || null;

  if (!p) {
    return (
      <div style={{ padding: "64px 24px" }}>
        <Empty icon="Server" title="Project not found"
          body="This project may have been archived or you may not have access."
          action={<button className="btn btn-outline" onClick={() => navigate({ view: "hosting-list" })}>← Back to projects</button>} />
      </div>
    );
  }
  const [tab, setTab] = useStateH("Deployments");
  const [deploying, setDeploying] = useStateH(false);
  const [deployError, setDeployError] = useStateH(null);

  const handleDeploy = async () => {
    setDeploying(true);
    setDeployError(null);

    try {
      await createDeployment(p.id, {
        environment: 'production',
        source: 'manual',
        branch: p.branch || 'main',
        commitMessage: `Manual deploy for ${p.name}`,
      });
      setTab("Deployments");
    } catch (error) {
      setDeployError(error.message);
    } finally {
      setDeploying(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <a className="page-eyebrow" href="#" onClick={(e) => { e.preventDefault(); navigate({ view: "hosting-list" }); }}>
            ← Hosting / Projects
          </a>
          <div className="row" style={{ gap: 14, marginTop: 8 }}>
            <span className="proj-thumb" style={{ width: 42, height: 42, fontSize: 16, borderRadius: 10 }}>{p.framework[0]}</span>
            <div>
              <h1 style={{ margin: 0 }}>{p.name}</h1>
              <div className="row" style={{ gap: 12, marginTop: 6, color: "var(--text-muted)", fontSize: 13 }}>
                <span className="row" style={{ gap: 6 }}><ICN.Git size={13} /> {p.repo}</span>
                <span>·</span>
                <a href="#" className="row" style={{ gap: 6, color: "var(--accent)" }}>
                  <ICN.ExternalLink size={13} /> {p.customDomain || p.domain}
                </a>
                <span>·</span>
                <StatusBadge value={p.status} />
              </div>
            </div>
          </div>
        </div>
        <div className="actions">
          <button className="btn btn-outline"><ICN.Eye size={14} /> Visit</button>
          <button className="btn btn-outline" onClick={handleDeploy} disabled={deploying}><ICN.Refresh size={14} /> Redeploy</button>
          <button className="btn btn-primary" onClick={handleDeploy} disabled={deploying}><ICN.Rocket size={14} /> {deploying ? "Deploying..." : "Deploy"}</button>
        </div>
      </div>
      {deployError && <div className="card" style={{ padding: "10px 14px", color: "var(--danger)", fontSize: 13 }}>{deployError}</div>}

      <Tabs value={tab} onChange={setTab}
        options={["Deployments", "Build logs", "Environment variables", "Environments", "Domains", "Analytics", "Settings"]} />

      {tab === "Deployments" && <DeploymentsTab p={p} />}
      {tab === "Build logs" && <BuildLogsTab p={p} onRedeploy={handleDeploy} deploying={deploying} />}
      {tab === "Environment variables" && <EnvVarsTab projectId={p.id} />}
      {tab === "Environments" && <EnvsTab />}
      {tab === "Domains" && <ProjectDomainsTabIntegrated p={p} navigate={navigate} />}
      {tab === "Analytics" && <ProjectAnalyticsTab p={p} />}
      {tab === "Settings" && <ProjectSettingsTab p={p} />}
    </>
  );
}

function DeploymentsTab({ p }) {
  const { deployments, loading, source, error } = useProjectDeployments(p.id);
  const { artifacts, loading: artifactsLoading, source: artifactsSource, error: artifactsError } = useProjectArtifacts(p.id);
  const [actionId, setActionId] = useStateH(null);
  const [actionError, setActionError] = useStateH(null);

  const handleDeploymentAction = async (deployment, action) => {
    setActionId(`${action}:${deployment.id}`);
    setActionError(null);

    try {
      if (action === 'cancel') {
        await cancelDeployment(deployment.id);
      } else {
        await rollbackDeployment(deployment.id);
      }
    } catch (error) {
      setActionError(error.message);
    } finally {
      setActionId(null);
    }
  };

  return (
    <>
      <div className="grid-4">
        <Stat k="Visitors (30d)"   v={p.visitors30d.toLocaleString()} d="+12% vs prior" />
        <Stat k="Bandwidth (30d)"  v={p.bandwidth30d} d="of 1 TB included" />
        <Stat k="Requests (30d)"   v={p.requests30d} d="across all edges" />
        <Stat k="Avg response"     v="142 ms" d="p95 · global" />
      </div>

      <div className="card card-flush">
        <div className="card-head">
          <h2>Build artifacts</h2>
          <div className="row" style={{ gap: 8 }}>
            {artifactsSource === "api" && <Badge tone="success" dot={false}>API</Badge>}
            <span className="meta">{artifacts.length} objects</span>
          </div>
        </div>
        {artifactsError && <div style={{ padding: "10px 16px", color: "var(--text-muted)", fontSize: 13 }}>No backend artifacts available yet.</div>}
        <table className="tbl">
          <thead><tr><th>Object</th><th>Status</th><th>Size</th><th>Checksum</th><th>Created</th><th></th></tr></thead>
          <tbody>
            {artifactsLoading ? (
              <tr><td colSpan={6}>Loading artifacts...</td></tr>
            ) : artifacts.length === 0 ? (
              <tr><td colSpan={6}>Artifacts will appear here after a deployment worker publishes a build.</td></tr>
            ) : artifacts.map((artifact) => (
              <tr key={artifact.id}>
                <td className="mono" style={{ wordBreak: "break-all" }}>{artifact.objectKey}</td>
                <td><StatusBadge value={artifact.status} /></td>
                <td className="mono">{artifact.size}</td>
                <td className="mono">{artifact.checksum || "-"}</td>
                <td>{artifact.createdAt ? new Date(artifact.createdAt).toLocaleString() : "-"}</td>
                <td style={{ textAlign: "right" }}>
                  <button className="btn btn-sm btn-ghost"><ICN.ExternalLink size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card card-flush">
        <div className="card-head">
          <h2>Recent deployments</h2>
          <div className="row" style={{ gap: 8 }}>
            {source === "api" && <Badge tone="success" dot={false}>API</Badge>}
            <Tabs value="All" onChange={() => {}} options={["All", "Production", "Preview"]} />
            <button className="btn btn-sm btn-outline"><ICN.Filter size={14} /> Branch</button>
          </div>
        </div>
        {error && <div style={{ padding: "10px 16px", color: "var(--text-muted)", fontSize: 13 }}>Backend unavailable, showing prototype deployments.</div>}
        {actionError && <div style={{ padding: "10px 16px", color: "var(--danger)", fontSize: 13 }}>{actionError}</div>}
        <table className="tbl">
          <thead>
            <tr><th>Commit</th><th>Branch</th><th>SHA</th><th>Environment</th><th>Status</th><th>Artifact</th><th>When</th><th></th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8}>Loading deployments...</td></tr>
            ) : deployments.length === 0 ? (
              <tr><td colSpan={8}><Empty icon="Rocket" title="No deployments yet" body="Trigger a deploy above to see build history here." /></td></tr>
            ) : deployments.map(d => (
              <tr key={d.id}>
                <td>
                  <div style={{ fontWeight: 500 }}>{d.commit}</div>
                  <div className="faint" style={{ fontSize: 12 }}>by {d.author}</div>
                </td>
                <td className="mono">{d.branch}</td>
                <td className="mono">{d.sha}</td>
                <td>{d.env === "Production" ? <Badge tone="success">Production</Badge> : <Badge tone="info">Preview</Badge>}</td>
                <td><StatusBadge value={d.status} /></td>
                <td className="mono">{d.artifact?.size || d.providerDeployId || d.duration}</td>
                <td>{d.time}</td>
                <td style={{ textAlign: "right" }}>
                  <DeploymentRowActions
                    deployment={d}
                    source={source}
                    actionId={actionId}
                    onAction={handleDeploymentAction}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DeploymentRowActions({ deployment, source, actionId, onAction }) {
  const cancellable = ["Queued", "Building"].includes(deployment.status);
  const rollbackable = deployment.status === "Ready";
  const disabled = source !== "api" || !!actionId;

  if (cancellable) {
    return (
      <button
        className="btn btn-sm btn-outline"
        onClick={() => onAction(deployment, 'cancel')}
        disabled={disabled}
      >
        {actionId === `cancel:${deployment.id}` ? "Cancelling..." : "Cancel"}
      </button>
    );
  }

  if (rollbackable) {
    return (
      <button
        className="btn btn-sm btn-outline"
        onClick={() => onAction(deployment, 'rollback')}
        disabled={disabled}
      >
        {actionId === `rollback:${deployment.id}` ? "Rolling back..." : "Rollback"}
      </button>
    );
  }

  return <button className="btn btn-sm btn-ghost"><ICN.Chevron size={14} /></button>;
}

function BuildLogsTab({ p, onRedeploy, deploying }) {
  const { deployments } = useProjectDeployments(p.id);
  const deployment = deployments[0] || null;
  const { logs, loading, source, error } = useDeploymentLogs(deployment?.id);

  return (
    <div className="card card-flush">
      <div className="card-head">
        <div>
          <h2 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ICN.Terminal size={16} /> Build - {deployment?.id || "latest"}
          </h2>
          <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>{deployment?.branch || "main"} - {deployment?.sha || "manual"} - {deployment?.duration || "-"} - Sydney</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {source === "api" && <Badge tone="success" dot={false}>API</Badge>}
          <Badge tone="success">{deployment?.status || "Ready"}</Badge>
          <button className="btn btn-sm btn-outline"><ICN.Copy size={14} /> Copy log</button>
          <button className="btn btn-sm btn-outline" onClick={onRedeploy} disabled={deploying}><ICN.Refresh size={14} /> {deploying ? "Deploying..." : "Redeploy"}</button>
        </div>
      </div>
      {error && <div style={{ padding: "10px 16px", color: "var(--text-muted)", fontSize: 13 }}>Backend unavailable, showing prototype logs.</div>}
      {deployment?.artifact && (
        <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", fontSize: 13 }}>
          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            <span><b>Artifact</b></span>
            <span className="mono">{deployment.artifact.size}</span>
            <span className="mono" style={{ color: "var(--text-muted)" }}>{deployment.artifact.objectKey}</span>
            <Badge tone={deployment.artifact.status === "ready" ? "success" : "warn"} dot={false}>{deployment.artifact.status}</Badge>
          </div>
        </div>
      )}
      <div className="term" style={{ borderRadius: 0, maxHeight: 460 }}>
        {loading ? <div><span className="ts">--:--:--</span>  <span className="info">Loading logs...</span></div> : logs.map((l, i) => (
          <div key={i}><span className="ts">{l.t}</span>  <span className={l.level}>{l.msg}</span></div>
        ))}
      </div>
    </div>
  );
}

function EnvVarsTab({ projectId }) {
  const { envVars, loading, source, error } = useProjectEnvVars(projectId);
  const [showForm, setShowForm] = useStateH(false);
  const [saving, setSaving] = useStateH(false);
  const [formError, setFormError] = useStateH(null);
  const [form, setForm] = useStateH({ key: '', value: '', environment: 'production' });
  const [editingId, setEditingId] = useStateH(null);
  const [editValue, setEditValue] = useStateH('');
  const [actionError, setActionError] = useStateH(null);
  const [exportEnv, setExportEnv] = useStateH('production');
  const [exporting, setExporting] = useStateH(false);

  const handleExportDotEnv = async () => {
    setExporting(true);
    try {
      const vars = await exportEnvVars(projectId, exportEnv);
      const lines = vars.map(v => `${v.key}=${v.value}`).join('\n');
      const blob = new Blob([lines + '\n'], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `.env.${exportEnv}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setActionError(err.message || 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleCreateEnvVar = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);

    try {
      await createEnvVar(projectId, {
        key: form.key.trim().toUpperCase(),
        value: form.value,
        environment: form.environment,
      });
      setForm({ key: '', value: '', environment: 'production' });
      setShowForm(false);
    } catch (error) {
      setFormError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const startEditingEnvVar = (envVar) => {
    setEditingId(envVar.id);
    setEditValue('');
    setActionError(null);
  };

  const handleUpdateEnvVar = async (envVar) => {
    if (!editValue) {
      setActionError('Enter a replacement value before saving.');
      return;
    }

    setSaving(true);
    setActionError(null);

    try {
      await updateEnvVar(projectId, envVar.id, { value: editValue });
      setEditingId(null);
      setEditValue('');
    } catch (error) {
      setActionError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEnvVar = async (envVar) => {
    setSaving(true);
    setActionError(null);

    try {
      await deleteEnvVar(projectId, envVar.id);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="row between">
        <p className="muted" style={{ maxWidth: 60 + "ch", margin: 0 }}>
          Variables are encrypted at rest and injected at build and runtime. Update them per environment; redeploys pick up changes automatically.
        </p>
        <div className="row" style={{ gap: 8 }}>
          {source === "api" && <Badge tone="success" dot={false}>API</Badge>}
          <select className="select" value={exportEnv} onChange={(e) => setExportEnv(e.target.value)} style={{ height: 34, fontSize: 13 }}>
            <option value="production">Production</option>
            <option value="preview">Preview</option>
            <option value="development">Development</option>
          </select>
          <button className="btn btn-outline" onClick={handleExportDotEnv} disabled={exporting || source !== "api"}>
            <ICN.Code size={14} /> {exporting ? "Exporting…" : "Pull as .env"}
          </button>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}><ICN.Plus size={14} /> Add variable</button>
        </div>
      </div>

      {showForm && (
        <form className="card" onSubmit={handleCreateEnvVar}>
          <div className="row between" style={{ marginBottom: 16 }}>
            <h2 style={{ margin: 0 }}>Add variable</h2>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
          <div className="grid-2" style={{ gap: 14 }}>
            <div>
              <label className="label">Key</label>
              <input className="input mono" value={form.key} onChange={(e) => updateForm('key', e.target.value.toUpperCase())} placeholder="DATABASE_URL" pattern="[A-Z_][A-Z0-9_]*" required />
            </div>
            <div>
              <label className="label">Environment</label>
              <select className="select" value={form.environment} onChange={(e) => updateForm('environment', e.target.value)}>
                <option value="production">Production</option>
                <option value="preview">Preview</option>
                <option value="development">Development</option>
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="label">Value</label>
              <input className="input mono" value={form.value} onChange={(e) => updateForm('value', e.target.value)} required />
            </div>
          </div>
          {formError && <div className="muted" style={{ color: "var(--danger)", marginTop: 12 }}>{formError}</div>}
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
            <button className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Save variable"}</button>
          </div>
        </form>
      )}

      <div className="card card-flush">
        {error && <div style={{ padding: "10px 16px", color: "var(--text-muted)", fontSize: 13 }}>Backend unavailable or permission denied, showing prototype variables.</div>}
        {actionError && <div style={{ padding: "10px 16px", color: "var(--danger)", fontSize: 13 }}>{actionError}</div>}
        <table className="tbl">
          <thead>
            <tr><th style={{ width: "26%" }}>Key</th><th>Value</th><th>Environments</th><th>Updated</th><th></th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5}>Loading environment variables...</td></tr>
            ) : envVars.length === 0 ? (
              <tr><td colSpan={5}><Empty icon="Code" title="No variables yet" body="Add your first environment variable above." /></td></tr>
            ) : envVars.map((v, i) => (
              <tr key={v.id || `${v.key}-${i}`}>
                <td className="mono" style={{ color: "var(--text)" }}>{v.key}</td>
                <td className="mono">
                  {editingId === v.id ? (
                    <input className="input mono" value={editValue} onChange={(e) => setEditValue(e.target.value)} placeholder="New secret value" />
                  ) : v.value}
                </td>
                <td>
                  <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                    {v.env.map(e => <Badge key={e} tone={e === "Production" ? "success" : e === "Preview" ? "info" : "muted"} dot={false}>{e}</Badge>)}
                  </div>
                </td>
                <td>{v.updated}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="btn btn-sm btn-ghost"><ICN.Eye size={14} /></button>
                  {editingId === v.id ? (
                    <>
                      <button className="btn btn-sm btn-ghost" onClick={() => handleUpdateEnvVar(v)} disabled={saving}>Save</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => { setEditingId(null); setEditValue(''); }}>Cancel</button>
                    </>
                  ) : (
                    <button className="btn btn-sm btn-ghost" onClick={() => startEditingEnvVar(v)} disabled={!v.id || source !== "api"}><ICN.Edit size={14} /></button>
                  )}
                  <button className="btn btn-sm btn-ghost" onClick={() => handleDeleteEnvVar(v)} disabled={!v.id || source !== "api" || saving} style={{ color: "var(--danger)" }}><ICN.Trash size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Build settings */}
      <div className="card">
        <div className="row between" style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Build settings</h2>
          <button className="btn btn-sm btn-outline">Edit</button>
        </div>
        <div className="grid-2" style={{ gap: 18 }}>
          <Field label="Framework preset" value="Next.js (auto-detected)" mono />
          <Field label="Node version" value="20.11.1" mono />
          <Field label="Install command" value="npm ci" mono />
          <Field label="Build command" value="npm run build" mono />
          <Field label="Output directory" value=".next" mono />
          <Field label="Root directory" value="./" mono />
        </div>
      </div>
    </>
  );
}

function cleanPayload(input) {
  return Object.fromEntries(
    Object.entries(input)
      .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
      .filter(([, value]) => value !== '' && value !== undefined && value !== null)
  );
}

function Field({ label, value, mono }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className={mono ? "mono" : ""} style={{ background: "var(--bg-deep)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "10px 12px", fontSize: 13 }}>
        {value}
      </div>
    </div>
  );
}

function EnvsTab() {
  return (
    <>
      <p className="muted" style={{ margin: 0, maxWidth: 60 + "ch" }}>
        Define where pushes go. Each environment has its own domain alias, env vars, and deploy log.
      </p>
      <div className="card card-flush">
        <div className="card-head">
          <h2>Environments</h2>
          <button className="btn btn-sm btn-primary"><ICN.Plus size={14} /> Add environment</button>
        </div>
        <table className="tbl">
          <thead>
            <tr><th>Environment</th><th>Branch</th><th>Auto-deploy</th><th>Domain</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={6}>
                <Empty icon="Layers" title="No environments configured"
                  body="Add environments to map branches to deployment targets." />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="row between">
          <div>
            <h2 style={{ margin: 0 }}>Rollbacks</h2>
            <p className="muted" style={{ margin: "6px 0 0", fontSize: 13.5 }}>Instantly revert production to a previous deployment if something goes sideways.</p>
          </div>
          <button className="btn btn-outline" disabled><ICN.Refresh size={14} /> No deployments to roll back</button>
        </div>
      </div>
    </>
  );
}

function ProjectDomainsTab({ p, navigate }) {
  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Primary domain</h2>
        <div className="row between" style={{ gap: 16, alignItems: "flex-start" }}>
          <div className="kv" style={{ gridTemplateColumns: "140px 1fr" }}>
            <dt>Custom domain</dt><dd className="mono">{p.customDomain || <span className="faint">None connected</span>}</dd>
            <dt>Glondia subdomain</dt><dd className="mono">{p.domain}</dd>
            <dt>SSL</dt><dd><Badge tone="success">Issued · auto-renew</Badge></dd>
            <dt>Status</dt><dd><StatusBadge value={p.status} /></dd>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-outline">Connect a domain</button>
            <button className="btn btn-outline" onClick={() => navigate({ view: "domains-buy" })}>
              <ICN.Cart size={14} /> Buy a new domain
            </button>
          </div>
        </div>
      </div>

      <div className="card card-flush">
        <div className="card-head">
          <h2>Connected hostnames</h2>
          <button className="btn btn-sm btn-outline"><ICN.Plus size={14} /> Add hostname</button>
        </div>
        <table className="tbl">
          <thead>
            <tr><th>Hostname</th><th>Type</th><th>SSL</th><th>DNS</th><th>Added</th><th></th></tr>
          </thead>
          <tbody>
            {[
              { h: p.customDomain || p.domain, t: "Primary", ssl: "Issued", dns: "Verified", added: "5 days ago" },
              { h: "www." + (p.customDomain || p.domain).replace(/^www\./, ""), t: "Redirect", ssl: "Issued", dns: "Verified", added: "5 days ago" },
              { h: p.domain, t: "Glondia default", ssl: "Issued", dns: "Auto", added: "5 days ago" },
            ].map((d, i) => (
              <tr key={i}>
                <td className="mono">{d.h}</td>
                <td>{d.t}</td>
                <td><Badge tone="success" dot={false}>{d.ssl}</Badge></td>
                <td><Badge tone="success" dot={false}>{d.dns}</Badge></td>
                <td>{d.added}</td>
                <td style={{ textAlign: "right" }}>
                  <button className="btn btn-sm btn-ghost"><ICN.Trash size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ProjectDomainsTabIntegrated({ p, navigate }) {
  const { domains, loading, source, error } = useDomains();
  const linkedDomains = domains.filter((domain) => domain.linkedProject === p.id);
  const availableDomains = domains.filter((domain) => !domain.linkedProject);
  const primaryDomain = linkedDomains[0]?.name || p.customDomain || null;
  const [selectedDomainId, setSelectedDomainId] = useStateH('');
  const [busyId, setBusyId] = useStateH(null);
  const [actionError, setActionError] = useStateH(null);

  const connectDomain = async () => {
    if (!selectedDomainId) return;
    setBusyId(selectedDomainId);
    setActionError(null);

    try {
      await updateDomain(selectedDomainId, { projectId: p.id, status: 'active' });
      setSelectedDomainId('');
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusyId(null);
    }
  };

  const unlinkDomain = async (domain) => {
    setBusyId(domain.id);
    setActionError(null);

    try {
      await updateDomain(domain.id, { projectId: null });
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusyId(null);
    }
  };

  const archiveDomain = async (domain) => {
    setBusyId(domain.id);
    setActionError(null);

    try {
      await deleteDomain(domain.id);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Primary domain</h2>
        <div className="row between" style={{ gap: 16, alignItems: "flex-start" }}>
          <div className="kv" style={{ gridTemplateColumns: "140px 1fr" }}>
            <dt>Custom domain</dt><dd className="mono">{primaryDomain || <span className="faint">None connected</span>}</dd>
            <dt>Glondia subdomain</dt><dd className="mono">{p.domain}</dd>
            <dt>SSL</dt><dd><Badge tone="success">Issued</Badge></dd>
            <dt>Status</dt><dd><StatusBadge value={p.status} /></dd>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <select className="select" value={selectedDomainId} onChange={(event) => setSelectedDomainId(event.target.value)} disabled={source !== "api" || availableDomains.length === 0}>
              <option value="">Select domain</option>
              {availableDomains.map((domain) => <option key={domain.id} value={domain.id}>{domain.name}</option>)}
            </select>
            <button className="btn btn-outline" onClick={connectDomain} disabled={source !== "api" || !selectedDomainId || !!busyId}>Connect</button>
            <button className="btn btn-outline" onClick={() => navigate({ view: "domains-buy" })}>
              <ICN.Cart size={14} /> Buy a new domain
            </button>
          </div>
        </div>
      </div>

      {source === "api" && (
        <div className="card" style={{ padding: "10px 14px", fontSize: 13 }}>
          <span className="row" style={{ gap: 8 }}><ICN.Server size={14} /> Connected to backend domain API</span>
        </div>
      )}
      {(error || actionError) && (
        <div className="card" style={{ padding: "10px 14px", fontSize: 13, color: actionError ? "var(--danger)" : "var(--text-muted)" }}>
          {actionError || "Backend unavailable, showing prototype domain data."}
        </div>
      )}

      <div className="card card-flush">
        <div className="card-head">
          <h2>Connected hostnames</h2>
          <button className="btn btn-sm btn-outline" onClick={() => navigate({ view: "domains-buy" })}><ICN.Plus size={14} /> Add hostname</button>
        </div>
        <table className="tbl">
          <thead>
            <tr><th>Hostname</th><th>Type</th><th>SSL</th><th>DNS</th><th>Expires</th><th></th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6}>Loading domains...</td></tr>
            ) : (
              <>
                {linkedDomains.map((domain, index) => (
                  <tr key={domain.id}>
                    <td className="mono">{domain.name}</td>
                    <td>{index === 0 ? "Primary" : "Alias"}</td>
                    <td><Badge tone="success" dot={false}>Issued</Badge></td>
                    <td><Badge tone={domain.status === "Active" ? "success" : "warn"} dot={false}>{domain.status === "Active" ? "Verified" : domain.status}</Badge></td>
                    <td>{domain.expires}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => navigate({ view: "dns", params: { domain: domain.name } })}><ICN.Network size={14} /></button>
                      <button className="btn btn-sm btn-ghost" onClick={() => unlinkDomain(domain)} disabled={source !== "api" || busyId === domain.id}>Unlink</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => archiveDomain(domain)} disabled={source !== "api" || busyId === domain.id} style={{ color: "var(--danger)" }}><ICN.Trash size={14} /></button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="mono">{p.domain}</td>
                  <td>Glondia default</td>
                  <td><Badge tone="success" dot={false}>Issued</Badge></td>
                  <td><Badge tone="success" dot={false}>Auto</Badge></td>
                  <td>Always on</td>
                  <td style={{ textAlign: "right" }}><button className="btn btn-sm btn-ghost"><ICN.Chevron size={14} /></button></td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ProjectAnalyticsTab({ p }) {
  // simple sparkline data
  const data = [4, 6, 5, 8, 7, 11, 9, 13, 10, 14, 12, 16, 15, 19, 17, 22, 18, 24, 20, 26, 23, 28, 25, 30, 27, 32, 28, 34, 30, 36];
  const max = Math.max(...data);
  return (
    <>
      <div className="grid-4">
        <Stat k="Visitors (30d)" v={p.visitors30d.toLocaleString()} d="unique" />
        <Stat k="Page views"     v="19,300" d="across all pages" />
        <Stat k="Avg session"    v="1m 42s" d="time on site" />
        <Stat k="Bounce rate"    v="38%" d="below industry avg" />
      </div>

      <div className="card">
        <div className="row between" style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Visitors over time</h2>
          <Tabs value="30d" onChange={() => {}} options={["24h", "7d", "30d", "90d"]} />
        </div>
        <svg viewBox="0 0 600 160" style={{ width: "100%", height: 160 }}>
          <defs>
            <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {(() => {
            const pts = data.map((v, i) => [i * (600 / (data.length - 1)), 150 - (v / max) * 130]);
            const path = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
            const area = `${path} L600,150 L0,150 Z`;
            return (
              <>
                <path d={area} fill="url(#g1)" />
                <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
              </>
            );
          })()}
        </svg>
      </div>

      <div className="grid-side">
        <div className="card card-flush">
          <div className="card-head"><h2>Top pages</h2></div>
          <table className="tbl">
            <thead><tr><th>Path</th><th>Views</th><th>Avg time</th></tr></thead>
            <tbody>
              {[["/", 3240, "1m 12s"], ["/shop", 2815, "2m 04s"], ["/products/clay-vase", 1750, "1m 36s"], ["/about", 1220, "42s"], ["/contact", 980, "31s"]].map(([p, v, t], i) => (
                <tr key={i}><td className="mono">{p}</td><td>{v.toLocaleString()}</td><td>{t}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card card-flush">
          <div className="card-head"><h2>Top regions</h2></div>
          <table className="tbl">
            <thead><tr><th>Region</th><th>Visitors</th></tr></thead>
            <tbody>
              {[["Papua New Guinea", 3420], ["Australia", 2210], ["United States", 1640], ["New Zealand", 720], ["Singapore", 430]].map(([r, v], i) => (
                <tr key={i}><td>{r}</td><td>{v.toLocaleString()}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function RenderLinkCard({ p }) {
  const [services, setServices] = useStateH([]);
  const [loadingServices, setLoadingServices] = useStateH(false);
  const [selectedId, setSelectedId] = useStateH(p.renderServiceId || '');
  const [busy, setBusy] = useStateH(false);
  const [msg, setMsg] = useStateH(null);
  const [err, setErr] = useStateH(null);
  const { getStoredAuth } = React.useMemo(() => ({ getStoredAuth: () => ({ accessToken: true }) }), []);

  React.useEffect(() => {
    setLoadingServices(true);
    listRenderServices()
      .then(svcs => { setServices(svcs); })
      .catch(() => { setServices([]); })
      .finally(() => setLoadingServices(false));
  }, []);

  const linked = services.find(s => s.id === p.renderServiceId);

  const handleLink = async () => {
    setBusy(true); setMsg(null); setErr(null);
    try {
      await linkRenderService(p.id, selectedId || null);
      setMsg(selectedId ? 'Render service linked — deploys will use Render.' : 'Render service unlinked — deploys will use the internal build queue.');
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Deployment provider</h2>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            Link a Render service to route deploys through Render's infrastructure. Leave unset to use Glondia's internal build queue.
          </div>
        </div>
        {linked && <Badge tone="success" dot={false}>{linked.name}</Badge>}
      </div>

      {p.renderServiceId && (
        <div className="kv" style={{ gridTemplateColumns: "140px 1fr", marginBottom: 14 }}>
          <dt>Current service</dt>
          <dd className="mono">{linked ? `${linked.name} (${linked.id})` : p.renderServiceId}</dd>
          {linked?.url && <><dt>Service URL</dt><dd><a href={linked.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>{linked.url}</a></dd></>}
          {linked?.region && <><dt>Region</dt><dd>{linked.region}</dd></>}
        </div>
      )}

      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        <select
          className="select"
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          disabled={loadingServices || busy}
          style={{ flex: 1, minWidth: 220 }}
        >
          <option value="">— None (use internal queue) —</option>
          {services.map(s => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.type} · {s.region || 'unknown region'}{s.suspended ? ' · SUSPENDED' : ''}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={handleLink} disabled={busy || loadingServices}>
          {busy ? 'Saving…' : selectedId ? 'Link service' : 'Unlink'}
        </button>
      </div>

      {msg && <div style={{ marginTop: 10, fontSize: 13, color: "var(--accent)" }}>{msg}</div>}
      {err && <div style={{ marginTop: 10, fontSize: 13, color: "var(--danger)" }}>{err}</div>}
      {loadingServices && <div style={{ marginTop: 10, fontSize: 13, color: "var(--text-muted)" }}>Loading Render services…</div>}
    </div>
  );
}

function ProjectSettingsTab({ p }) {
  const [settings, setSettings] = useStateH(() => projectSettingsFromProject(p));
  const [saving, setSaving] = useStateH(false);
  const [settingsError, setSettingsError] = useStateH(null);
  const [settingsMessage, setSettingsMessage] = useStateH(null);

  React.useEffect(() => {
    setSettings(projectSettingsFromProject(p));
  }, [p.id]);

  const updateSettings = (field, value) => {
    setSettings((current) => ({ ...current, [field]: value }));
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    setSaving(true);
    setSettingsError(null);
    setSettingsMessage(null);

    try {
      await updateProject(p.id, cleanPayload(settings));
      setSettingsMessage('Project settings saved.');
    } catch (error) {
      setSettingsError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const pauseProject = async () => {
    setSaving(true);
    setSettingsError(null);
    setSettingsMessage(null);

    try {
      await updateProject(p.id, { status: 'paused' });
      setSettingsMessage('Project paused.');
    } catch (error) {
      setSettingsError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const archiveCurrentProject = async () => {
    setSaving(true);
    setSettingsError(null);
    setSettingsMessage(null);

    try {
      await archiveProject(p.id);
      setSettingsMessage('Project archived.');
    } catch (error) {
      setSettingsError(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <form className="card" onSubmit={saveSettings}>
        <h2 style={{ marginTop: 0 }}>General</h2>
        <div className="grid-2">
          <div><label className="label">Project name</label><input className="input" value={settings.name} onChange={(e) => updateSettings('name', e.target.value)} required minLength={2} /></div>
          <div><label className="label">Region</label>
            <select className="select" defaultValue={p.region}>
              {GD.regions.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div><label className="label">Framework</label>
            <select className="select" value={settings.framework} onChange={(e) => updateSettings('framework', e.target.value)}>
              {GD.frameworks.map(f => <option key={f}>{f}</option>)}
            </select>
          </div>
          <div><label className="label">Production branch</label><input className="input mono" value={settings.productionBranch} onChange={(e) => updateSettings('productionBranch', e.target.value)} /></div>
          <div><label className="label">Root directory</label><input className="input mono" value={settings.rootDirectory} onChange={(e) => updateSettings('rootDirectory', e.target.value)} /></div>
          <div><label className="label">Install command</label><input className="input mono" value={settings.installCommand} onChange={(e) => updateSettings('installCommand', e.target.value)} /></div>
          <div><label className="label">Build command</label><input className="input mono" value={settings.buildCommand} onChange={(e) => updateSettings('buildCommand', e.target.value)} /></div>
          <div><label className="label">Output directory</label><input className="input mono" value={settings.outputDirectory} onChange={(e) => updateSettings('outputDirectory', e.target.value)} /></div>
        </div>
        {settingsError && <div className="muted" style={{ color: "var(--danger)", marginTop: 12 }}>{settingsError}</div>}
        {settingsMessage && <div className="muted" style={{ color: "var(--accent)", marginTop: 12 }}>{settingsMessage}</div>}
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn btn-primary" disabled={saving}>Save settings</button>
        </div>
      </form>

      <GitHubCard p={p} />

      <RenderLinkCard p={p} />

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Danger zone</h2>
        <div className="row between" style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontWeight: 500 }}>Pause project</div>
            <div className="muted" style={{ fontSize: 13 }}>Stop serving production traffic. Builds continue to run.</div>
          </div>
          <button className="btn btn-outline" onClick={pauseProject} disabled={saving}>Pause</button>
        </div>
        <div className="row between" style={{ padding: "12px 0" }}>
          <div>
            <div style={{ fontWeight: 500, color: "var(--danger)" }}>Archive project</div>
            <div className="muted" style={{ fontSize: 13 }}>Move this project out of active hosting without removing its history.</div>
          </div>
          <button className="btn btn-danger" onClick={archiveCurrentProject} disabled={saving}>Archive</button>
        </div>
      </div>
    </>
  );
}

// ─── GitHub import modal ───────────────────────────────────────────────────────
function ImportFromGitModal({ onClose, onCreated }) {
  const [ghStatus, setGhStatus] = useStateH(null);
  const [loadingStatus, setLoadingStatus] = useStateH(true);
  const [repos, setRepos] = useStateH([]);
  const [loadingRepos, setLoadingRepos] = useStateH(false);
  const [branches, setBranches] = useStateH([]);
  const [loadingBranches, setLoadingBranches] = useStateH(false);
  const [selectedRepo, setSelectedRepo] = useStateH('');
  const [selectedBranch, setSelectedBranch] = useStateH('main');
  const [projectName, setProjectName] = useStateH('');
  const [framework, setFramework] = useStateH('Next.js');
  const [creating, setCreating] = useStateH(false);
  const [err, setErr] = useStateH(null);

  const loadRepos = () => {
    setLoadingRepos(true);
    listGitHubRepos()
      .then(r => setRepos(r || []))
      .catch(() => setRepos([]))
      .finally(() => setLoadingRepos(false));
  };

  React.useEffect(() => {
    getGitHubStatus()
      .then(s => { setGhStatus(s); if (s?.connected) loadRepos(); })
      .catch(() => setGhStatus({ connected: false }))
      .finally(() => setLoadingStatus(false));
  }, []);

  React.useEffect(() => {
    if (!selectedRepo) { setBranches([]); return; }
    const [owner, repo] = selectedRepo.split('/');
    setLoadingBranches(true);
    listGitHubBranches(owner, repo)
      .then(b => { setBranches(b || []); setSelectedBranch(b?.[0]?.name || 'main'); })
      .catch(() => setBranches([]))
      .finally(() => setLoadingBranches(false));
  }, [selectedRepo]);

  React.useEffect(() => {
    if (selectedRepo && !projectName) {
      setProjectName(selectedRepo.split('/')[1] || '');
    }
  }, [selectedRepo]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!selectedRepo) return;
    const [owner, repo] = selectedRepo.split('/');
    const repoData = repos.find(r => r.full_name === selectedRepo);
    setCreating(true); setErr(null);
    try {
      const project = await createProject({
        name: projectName || repo,
        framework,
        repositoryProvider: 'github',
        repositoryOwner: owner,
        repositoryName: repo,
        repositoryId: String(repoData?.id || ''),
        productionBranch: selectedBranch,
      });
      onCreated(project);
    } catch (e) { setErr(e.message); }
    finally { setCreating(false); }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="card" style={{ width: "min(520px, 94vw)", maxHeight: "85vh", overflowY: "auto" }}>
        <div className="row between" style={{ marginBottom: 18 }}>
          <h2 style={{ margin: 0 }}><ICN.Git size={18} style={{ marginRight: 8 }} />Import from GitHub</h2>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>✕</button>
        </div>

        {loadingStatus ? (
          <div className="muted" style={{ fontSize: 13, padding: "12px 0" }}>Checking GitHub connection…</div>
        ) : !ghStatus?.connected ? (
          <div style={{ textAlign: "center", padding: "28px 0" }}>
            <div className="muted" style={{ marginBottom: 18, fontSize: 14 }}>
              Connect your GitHub account to browse and import repositories.
            </div>
            <button className="btn btn-primary" onClick={() => { window.location.href = connectGitHubUrl(); }}>
              <ICN.Git size={14} /> Connect GitHub
            </button>
          </div>
        ) : (
          <form onSubmit={handleCreate}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label className="label">Repository</label>
                <select className="select" value={selectedRepo} onChange={e => setSelectedRepo(e.target.value)} disabled={loadingRepos} required>
                  <option value="">— Select a repository —</option>
                  {repos.map(r => <option key={r.id} value={r.full_name}>{r.full_name}{r.private ? ' 🔒' : ''}</option>)}
                </select>
                {loadingRepos && <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>Loading repositories…</div>}
              </div>
              <div>
                <label className="label">Branch to deploy</label>
                <select className="select" value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)} disabled={!selectedRepo || loadingBranches}>
                  {branches.length > 0
                    ? branches.map(b => <option key={b.name} value={b.name}>{b.name}</option>)
                    : <option value="main">main</option>}
                </select>
              </div>
              <div>
                <label className="label">Project name</label>
                <input className="input" value={projectName} onChange={e => setProjectName(e.target.value)} required minLength={2} placeholder="my-project" />
              </div>
              <div>
                <label className="label">Framework</label>
                <select className="select" value={framework} onChange={e => setFramework(e.target.value)}>
                  {GD.frameworks.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
            </div>
            {err && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 12 }}>{err}</div>}
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 18, gap: 8 }}>
              <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={!selectedRepo || creating || loadingRepos}>
                {creating ? 'Creating project…' : 'Import project'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── GitHub repo card (project settings) ──────────────────────────────────────
function GitHubCard({ p }) {
  const [status, setStatus] = useStateH(null);
  const [loadingStatus, setLoadingStatus] = useStateH(true);
  const [repos, setRepos] = useStateH([]);
  const [loadingRepos, setLoadingRepos] = useStateH(false);
  const [branches, setBranches] = useStateH([]);
  const [loadingBranches, setLoadingBranches] = useStateH(false);
  const [selectedRepo, setSelectedRepo] = useStateH('');
  const [selectedBranch, setSelectedBranch] = useStateH(p.branch || 'main');
  const [linking, setLinking] = useStateH(false);
  const [linkMsg, setLinkMsg] = useStateH(null);
  const [linkErr, setLinkErr] = useStateH(null);

  const loadRepos = () => {
    setLoadingRepos(true);
    listGitHubRepos()
      .then(r => setRepos(r || []))
      .catch(() => setRepos([]))
      .finally(() => setLoadingRepos(false));
  };

  React.useEffect(() => {
    getGitHubStatus()
      .then(s => { setStatus(s); if (s?.connected) loadRepos(); })
      .catch(() => setStatus({ connected: false }))
      .finally(() => setLoadingStatus(false));
  }, []);

  React.useEffect(() => {
    if (!selectedRepo) { setBranches([]); return; }
    const [owner, repoName] = selectedRepo.split('/');
    setLoadingBranches(true);
    listGitHubBranches(owner, repoName)
      .then(b => { setBranches(b || []); })
      .catch(() => setBranches([]))
      .finally(() => setLoadingBranches(false));
  }, [selectedRepo]);

  const handleLink = async () => {
    if (!selectedRepo) return;
    const [owner, repoName] = selectedRepo.split('/');
    const repoData = repos.find(r => r.full_name === selectedRepo);
    setLinking(true); setLinkMsg(null); setLinkErr(null);
    try {
      await linkProjectRepo(p.id, { owner, repo: repoName, branch: selectedBranch, repoId: repoData?.id });
      setLinkMsg(`Linked to ${selectedRepo} on branch ${selectedBranch}. Push to that branch to trigger an auto-deploy.`);
    } catch (e) { setLinkErr(e.message); }
    finally { setLinking(false); }
  };

  const handleDisconnect = async () => {
    setLinkErr(null);
    try {
      await disconnectGitHub();
      setStatus({ connected: false });
      setRepos([]);
      setSelectedRepo('');
    } catch (e) { setLinkErr(e.message); }
  };

  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>GitHub repository</h2>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            Link a repository to enable auto-deploy on every push to the production branch.
          </div>
        </div>
        {status?.connected && (
          <div className="row" style={{ gap: 8 }}>
            <Badge tone="success" dot={false}>@{status.githubUserId}</Badge>
            <button className="btn btn-sm btn-ghost" onClick={handleDisconnect}>Disconnect</button>
          </div>
        )}
      </div>

      {p.repo && p.repo !== 'No repository' && (
        <div className="kv" style={{ gridTemplateColumns: "130px 1fr", marginBottom: 14 }}>
          <dt>Linked repo</dt><dd className="mono">{p.repo}</dd>
          <dt>Branch</dt><dd className="mono">{p.branch}</dd>
        </div>
      )}

      {loadingStatus ? (
        <div className="muted" style={{ fontSize: 13 }}>Checking GitHub connection…</div>
      ) : !status?.connected ? (
        <button className="btn btn-outline" onClick={() => { window.location.href = connectGitHubUrl(); }}>
          <ICN.Git size={14} /> Connect GitHub
        </button>
      ) : (
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <select className="select" value={selectedRepo} onChange={e => setSelectedRepo(e.target.value)}
            disabled={loadingRepos || linking} style={{ flex: 2, minWidth: 200 }}>
            <option value="">— Select repository —</option>
            {repos.map(r => <option key={r.id} value={r.full_name}>{r.full_name}{r.private ? ' 🔒' : ''}</option>)}
          </select>
          <select className="select" value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}
            disabled={!selectedRepo || loadingBranches || linking} style={{ minWidth: 120 }}>
            {branches.length > 0
              ? branches.map(b => <option key={b.name} value={b.name}>{b.name}</option>)
              : <option value={p.branch || 'main'}>{p.branch || 'main'}</option>}
          </select>
          <button className="btn btn-primary" onClick={handleLink} disabled={!selectedRepo || linking || loadingRepos}>
            {linking ? 'Linking…' : 'Link repo'}
          </button>
        </div>
      )}

      {loadingRepos && <div style={{ marginTop: 10, fontSize: 13, color: "var(--text-muted)" }}>Loading repositories…</div>}
      {linkMsg && <div style={{ marginTop: 10, fontSize: 13, color: "var(--accent)" }}>{linkMsg}</div>}
      {linkErr && <div style={{ marginTop: 10, fontSize: 13, color: "var(--danger)" }}>{linkErr}</div>}
    </div>
  );
}

function projectSettingsFromProject(project) {
  const outputDirectory = project.framework === 'Next.js' ? '.next' : 'dist';

  return {
    name: project.name || '',
    framework: project.framework || 'Static',
    productionBranch: project.branch || 'main',
    rootDirectory: './',
    installCommand: 'npm ci',
    buildCommand: 'npm run build',
    outputDirectory,
  };
}
