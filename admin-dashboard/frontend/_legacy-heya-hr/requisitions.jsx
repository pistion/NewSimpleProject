// Requisitions — two-stage flow:
//   Stage 1 (form):     fill in details, click "Apply"
//   Stage 2 (checklist): work the pre-posting checklist, click "Publish"

function readReqFileAsUpload(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result.split(",")[1] || "";
      resolve({ name: file.name, type: file.type, contentBase64: base64 });
    };
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}
function Requisitions({ positions, activePositionId, setActivePositionId, setView, onSavePosition, onDeletePosition, onEditingChange }) {
  React.useEffect(() => {
    if (onEditingChange) onEditingChange(activePositionId !== null);
  }, [activePositionId, onEditingChange]);

  React.useEffect(() => () => {
    if (onEditingChange) onEditingChange(false);
  }, [onEditingChange]);

  if (activePositionId === null) {
    return <RequisitionsList positions={positions} setActivePositionId={setActivePositionId} onSavePosition={onSavePosition} onDeletePosition={onDeletePosition} />;
  }
  return (
    <RequisitionEdit
      positions={positions}
      activePositionId={activePositionId}
      setActivePositionId={setActivePositionId}
      setView={setView}
      onSavePosition={onSavePosition}
    />
  );
}

// ------------ LIST ------------
function RequisitionsList({ positions, setActivePositionId, onSavePosition, onDeletePosition }) {
  const [filter, setFilter] = React.useState("all");
  const reqs = positions.filter(p => p.status === "draft" || p.status === "ready");
  const filtered = reqs.filter(r => filter === "all" || r.status === filter);

  function checklistPct(p) {
    const items = window.CHECKLIST_ITEMS;
    const done = items.filter(it => p.checklist[it.id]).length;
    return Math.round((done / items.length) * 100);
  }

  function badgeFor(p) {
    if (!p.applied) return { label: "Drafting", cls: "status-draft" };
    if (p.status === "ready") return { label: "Ready", cls: "status-ready" };
    return { label: "In review", cls: "status-review" };
  }

  function duplicate(p) {
    onSavePosition({ ...p, id: null, title: p.title + " (copy)", status: "draft", applied: false, approved: false });
  }
  function remove(id) {
    onDeletePosition(id);
  }

  const filters = [
    { id: "all",   label: "All" },
    { id: "draft", label: "In progress" },
    { id: "ready", label: "Ready" },
  ];

  return (
    <div className="page requisitions-page">
      <div className="page-head">
        <div>
          <div className="mono eyebrow">Requisitions</div>
          <h1 className="page-title" style={{ marginTop: 8 }}>Plan a new <em>opening</em></h1>
          <div className="page-sub">First fill in the role details, then work the pre-posting checklist. Publish to convert it into a live position.</div>
        </div>
        <div className="cluster">
          <button className="btn accent" onClick={() => setActivePositionId("new")}>
            <I.Plus /><span>New requisition</span>
          </button>
        </div>
      </div>

      <div className="filter-row">
        {filters.map(f => (
          <button key={f.id} className={"chip-btn" + (filter === f.id ? " active" : "")} onClick={() => setFilter(f.id)}>
            {f.label}
            <span className="chip-count">{f.id === "all" ? reqs.length : reqs.filter(p => p.status === f.id).length}</span>
          </button>
        ))}
      </div>

      <div className="card flush requisition-card">
        <table className="pos-table">
          <thead>
            <tr>
              <th>Requisition</th>
              <th>Client</th>
              <th>Stage</th>
              <th>Closing</th>
              <th style={{ width: 200 }}>Checklist</th>
              <th style={{ width: 1 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan="6" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
                No requisitions here. Click <b>New requisition</b> to start.
              </td></tr>
            )}
            {filtered.map(p => {
              const pct = checklistPct(p);
              const badge = badgeFor(p);
              return (
                <tr key={p.id} className="pos-row" onClick={() => setActivePositionId(p.id)}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{p.title || <em style={{ color: "var(--muted)" }}>Untitled</em>}</div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{p.department || "—"} · {p.location || "—"}</div>
                  </td>
                  <td>{p.client || "—"}</td>
                  <td><span className={"status-badge " + badge.cls}>{badge.label}</span></td>
                  <td className="num" style={{ fontSize: 12 }}>{p.closingDate || "—"}</td>
                  <td>
                    {p.applied ? (
                      <>
                        <div className="progress-bar"><div className="progress-fill" style={{ width: pct + "%" }} /></div>
                        <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>{pct}% complete</div>
                      </>
                    ) : (
                      <div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>Awaiting apply</div>
                    )}
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <ReqRowActions p={p} onOpen={() => setActivePositionId(p.id)} onDup={() => duplicate(p)} onDel={() => remove(p.id)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReqRowActions({ p, onOpen, onDup, onDel }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="row-actions">
      <button className="btn ghost sm" onClick={() => setOpen(o => !o)}><I.Dots /></button>
      {open && (
        <>
          <div className="menu-scrim" onClick={() => setOpen(false)} />
          <div className="menu">
            <div className="menu-item" onClick={() => { setOpen(false); onOpen(); }}>Open</div>
            <div className="menu-item" onClick={() => { setOpen(false); onDup(); }}>Duplicate</div>
            <div className="menu-item danger" onClick={() => { setOpen(false); onDel(); }}>Delete</div>
          </div>
        </>
      )}
    </div>
  );
}

// ------------ EDIT (two stages) ------------
function RequisitionEdit({ positions, activePositionId, setActivePositionId, setView, onSavePosition }) {
  const isNew = activePositionId === "new";
  const blank = {
    id: "pos-" + Date.now().toString(36),
    title: "", client: "", department: "", location: "",
    employmentType: "Full-time", numHires: 1,
    salaryRange: "", startDate: "", closingDate: "",
    description: "", responsibilities: "", requirements: "",
    contactPerson: "", reasonForHiring: "",
    companyDescription: "", externalApplyUrl: "", externalLinks: [],
    companyLogoFileId: null, coverPhotoFileId: null,
    companyLogoUrl: null, coverPhotoUrl: null,
    status: "draft",
    applied: false,
    checklist: { ...window.BLANK_CHECKLIST },
    createdAt: new Date().toISOString().slice(0, 10),
  };
  const existing = !isNew ? positions.find(p => p.id === activePositionId) : null;
  const [draft, setDraft] = React.useState(existing || blank);
  const [toast, setToast] = React.useState(null);
  const [publishing, setPublishing] = React.useState(false);
  const [logoPreview, setLogoPreview] = React.useState((existing || blank).companyLogoUrl || null);
  const [coverPreview, setCoverPreview] = React.useState((existing || blank).coverPhotoUrl || null);
  const [imgBusy, setImgBusy] = React.useState({ logo: false, cover: false });
  const [imgErr, setImgErr] = React.useState({ logo: "", cover: "" });
  const reqLogoInputRef = React.useRef(null);
  const reqCoverInputRef = React.useRef(null);
  const jdFileRef = React.useRef(null);
  const [jdLoading, setJdLoading] = React.useState(false);
  const [jdError, setJdError] = React.useState("");

  React.useEffect(() => {
    if (existing) setDraft(existing);
  }, [activePositionId]);

  const update = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const toggleCheck = (k) => setDraft(d => ({ ...d, checklist: { ...d.checklist, [k]: !d.checklist[k] } }));

  const items = window.CHECKLIST_ITEMS;
  const checkedCount = items.filter(it => draft.checklist[it.id]).length;
  const allChecked   = checkedCount === items.length;
  const pct          = Math.round((checkedCount / items.length) * 100);

  function flash(m) { setToast(m); setTimeout(() => setToast(null), 2200); }

  async function handleJdImport(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setJdLoading(true);
    setJdError("");
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target.result.split(",")[1] || "");
        reader.onerror = () => reject(new Error("Could not read file."));
        reader.readAsDataURL(file);
      });
      const result = await window.HEYA_API.parseJobDocument({
        fileName: file.name,
        mimeType: file.type,
        contentBase64: base64
      });
      if (!result?.fields) throw new Error("No fields returned from server.");
      const f = result.fields;
      const current = draft;
      const fieldLabels = {
        title: "title", client: "client", department: "department", location: "location",
        employmentType: "type", salaryRange: "salary", closingDate: "closing date",
        description: "description", responsibilities: "responsibilities",
        requirements: "requirements", companyDescription: "company info",
        reasonForHiring: "reason for hiring", contactPerson: "contact person"
      };
      const next = { ...current };
      const filled = [];
      Object.keys(fieldLabels).forEach(k => {
        if (f[k] && !current[k]) { next[k] = f[k]; filled.push(fieldLabels[k]); }
      });
      setDraft(next);
      flash(filled.length > 0
        ? `Auto-filled ${filled.length} field${filled.length === 1 ? "" : "s"}: ${filled.slice(0, 4).join(", ")}${filled.length > 4 ? "…" : ""}`
        : "Document read — all fields already have content, nothing overwritten."
      );
    } catch (err) {
      setJdError(err?.message || "Could not parse the document. Try a PDF, DOCX, or TXT file.");
    } finally {
      setJdLoading(false);
    }
  }

  const hasRealId = draft.id && !String(draft.id).startsWith("pos-");

  async function handleReqImagePick(e, field) {
    const file = e.target.files?.[0];
    if (!file || !hasRealId) return;
    const key = field === "company-logo" ? "logo" : "cover";
    setImgBusy(b => ({ ...b, [key]: true }));
    setImgErr(b => ({ ...b, [key]: "" }));
    try {
      const upload = await readReqFileAsUpload(file);
      const res = await window.HEYA_API.uploadPositionImage(draft.id, field, upload);
      if (res?.fileId) {
        if (field === "company-logo") {
          update("companyLogoFileId", res.fileId);
          setLogoPreview(res.url);
        } else {
          update("coverPhotoFileId", res.fileId);
          setCoverPreview(res.url);
        }
      }
    } catch (err) {
      setImgErr(b => ({ ...b, [key]: err?.message || "Upload failed." }));
    } finally {
      setImgBusy(b => ({ ...b, [key]: false }));
    }
  }

  async function persist(next) {
    const saved = await onSavePosition(next);
    setDraft(saved);
    if (saved?.id) setActivePositionId(saved.id);
    return saved;
  }

  async function saveDraft() {
    await persist(draft);
    flash("Draft saved");
  }

  async function applyForm() {
    if (!draft.title.trim()) { flash("Add a job title before applying"); return; }
    const next = { ...draft, applied: true };
    setDraft(next);
    await persist(next);
    flash("Requisition created — work the pre-posting checklist");
  }

  async function editDetails() {
    const next = { ...draft, applied: false };
    setDraft(next);
    await persist(next);
  }

  async function markReady() {
    const next = { ...draft, status: "ready", approved: true };
    setDraft(next);
    await persist(next);
    flash("Marked ready for publishing");
  }

  function startPublish() { setPublishing(true); }

  async function finishPublish() {
    await persist({ ...draft, status: "published", approved: true });
    setPublishing(false);
    setActivePositionId(null);
    setView("positions");
  }

  // Display badge in header
  const headerBadge = !draft.applied
    ? { label: "Drafting",   cls: "status-draft" }
    : draft.status === "ready"
      ? { label: "Ready",    cls: "status-ready" }
      : { label: "In review", cls: "status-review" };

  return (
    <div className="page requisitions-page requisition-edit-page">
      <div className="page-head">
        <div>
          <button className="btn ghost sm" onClick={() => setActivePositionId(null)} style={{ marginBottom: 10 }}>
            ← Back to requisitions
          </button>
          <div className="cluster">
            <h1 className="page-title" style={{ fontSize: 30, margin: 0 }}>
              {isNew && !draft.applied ? "New requisition" : (draft.title || "Untitled requisition")}
            </h1>
            <span className={"status-badge " + headerBadge.cls}>{headerBadge.label}</span>
          </div>
          <div className="page-sub">
            {draft.applied
              ? <>Step 2 of 2 · Pre-posting checklist</>
              : <>Step 1 of 2 · Fill in the role details</>}
          </div>
        </div>
        <div className="cluster">
          {!draft.applied ? (
            <>
              <button className="btn" onClick={saveDraft}>Save draft</button>
              <button className="btn accent" onClick={applyForm} disabled={!draft.title.trim()}
                title={!draft.title.trim() ? "Add a job title first" : "Lock in details and move to the checklist"}>
                Apply
              </button>
            </>
          ) : (
            <>
              <button className="btn" onClick={editDetails}>Edit details</button>
              <button className="btn" disabled={!allChecked} onClick={markReady}
                title={!allChecked ? "Finish the checklist to enable" : "Mark ready for publishing"}>
                Mark Ready
              </button>
              <button className="btn accent" disabled={!allChecked} onClick={startPublish}
                title={!allChecked ? "Finish the checklist to enable" : "Publish — promote to a live position"}>
                <I.Send /><span>Publish</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="req-stage" key={draft.applied ? "checklist" : "form"}>
        {!draft.applied ? (
          // ----- STAGE 1: FORM -----
          <div className="req-form-wrap">
            {/* JD import banner */}
            <div className="jd-import-banner">
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>📄 Import from document</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                  Upload a job description (PDF, DOCX, or TXT) to auto-fill the form below.
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>PDF · DOCX · TXT</span>
                <button
                  type="button"
                  className={"btn" + (jdLoading ? "" : " accent")}
                  style={{ minWidth: 160 }}
                  disabled={jdLoading}
                  onClick={() => jdFileRef.current && jdFileRef.current.click()}
                >
                  {jdLoading ? <><span className="spinner" style={{ width: 12, height: 12, marginRight: 6 }} />Reading…</> : "Upload & Auto-fill"}
                </button>
                <input
                  ref={jdFileRef}
                  type="file"
                  accept=".pdf,.docx,.doc,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  style={{ display: "none" }}
                  onChange={handleJdImport}
                />
              </div>
              {jdError && (
                <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--danger, #c00)", marginTop: 4 }}>
                  ⚠ {jdError}
                </div>
              )}
            </div>
            <div className="card requisition-answer-sheet">
              <div className="card-title" style={{ marginBottom: 14 }}>Position details</div>
              <div className="form-grid">
                <Field label="Job title*">
                  <input className="ifield" value={draft.title} onChange={e => update("title", e.target.value)} placeholder="e.g. Senior Backend Engineer" />
                </Field>
                <Field label="Client / company">
                  <input className="ifield" value={draft.client} onChange={e => update("client", e.target.value)} placeholder="e.g. PNG Resources Ltd" />
                </Field>
                <Field label="Department">
                  <input className="ifield" value={draft.department} onChange={e => update("department", e.target.value)} placeholder="e.g. Engineering" />
                </Field>
                <Field label="Location">
                  <input className="ifield" value={draft.location} onChange={e => update("location", e.target.value)} placeholder="e.g. Remote · US" />
                </Field>
                <Field label="Employment type">
                  <select className="ifield" value={draft.employmentType} onChange={e => update("employmentType", e.target.value)}>
                    <option>Full-time</option><option>Part-time</option><option>Contract</option><option>Internship</option>
                  </select>
                </Field>
                <Field label="Number of hires">
                  <input className="ifield" type="number" min="1" value={draft.numHires} onChange={e => update("numHires", parseInt(e.target.value || "1"))} />
                </Field>
                <Field label="Salary range">
                  <input className="ifield" value={draft.salaryRange} onChange={e => update("salaryRange", e.target.value)} placeholder="e.g. $120k – $160k" />
                </Field>
                <Field label="Contact person">
                  <input className="ifield" value={draft.contactPerson} onChange={e => update("contactPerson", e.target.value)} placeholder="Hiring manager / point of contact" />
                </Field>
                <Field label="Start date">
                  <input className="ifield" type="date" value={draft.startDate} onChange={e => update("startDate", e.target.value)} />
                </Field>
                <Field label="Closing date">
                  <input className="ifield" type="date" value={draft.closingDate} onChange={e => update("closingDate", e.target.value)} />
                </Field>
              </div>
              <div style={{ marginTop: 14 }}>
                <Field label="Reason for hiring">
                  <input className="ifield" value={draft.reasonForHiring} onChange={e => update("reasonForHiring", e.target.value)} placeholder="e.g. team expansion, replacement, new role" />
                </Field>
              </div>
              <div style={{ marginTop: 14 }}>
                <Field label="About the Role">
                  <textarea className="ifield" rows="5" value={draft.description} onChange={e => update("description", e.target.value)} placeholder="We are seeking an experienced and passionate Head Chef to lead our kitchen operations and deliver high-quality meals and dining experiences for our guests. The successful candidate will oversee kitchen staff, manage food preparation, maintain food safety standards, and contribute innovative menu ideas that reflect both local and international cuisine." />
                </Field>
              </div>
              <div style={{ marginTop: 14 }}>
                <Field label="Key Responsibilities">
                  <textarea className="ifield" rows="5" value={draft.responsibilities} onChange={e => update("responsibilities", e.target.value)} placeholder="Day-to-day responsibilities (one per line)…" />
                </Field>
              </div>
              <div style={{ marginTop: 14 }}>
                <Field label="Qualifications and Experience">
                  <textarea className="ifield" rows="5" value={draft.requirements} onChange={e => update("requirements", e.target.value)} placeholder="Must-haves and nice-to-haves (one per line)…" />
                </Field>
              </div>
              <div style={{ marginTop: 14 }}>
                <Field label="About Us (shown on public listing)">
                  <textarea className="ifield" rows="4" value={draft.companyDescription || ""} onChange={e => update("companyDescription", e.target.value)} placeholder="Who the company is — their sector, size, mission, and values." />
                </Field>
              </div>
              <div style={{ marginTop: 14 }}>
                <Field label="External apply URL (optional)">
                  <input className="ifield" type="url" value={draft.externalApplyUrl || ""} onChange={e => update("externalApplyUrl", e.target.value)} placeholder="https://company.com/careers — leave blank to use Glondiasites form" />
                </Field>
              </div>
              <div style={{ marginTop: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2, #444)" }}>Additional links (social media, website, LinkedIn…)</label>
                  <button type="button" className="btn ghost sm" onClick={() => update("externalLinks", [...(draft.externalLinks || []), { label: "", url: "" }])}>
                    + Add link
                  </button>
                </div>
                {(draft.externalLinks || []).length === 0 && (
                  <p style={{ fontSize: 12, color: "var(--muted)" }}>No links added yet.</p>
                )}
                {(draft.externalLinks || []).map((link, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: 8, marginBottom: 8, alignItems: "center" }}>
                    <input
                      className="ifield"
                      placeholder="Label (e.g. LinkedIn)"
                      value={link.label || ""}
                      onChange={e => {
                        const next = [...(draft.externalLinks || [])];
                        next[i] = { ...next[i], label: e.target.value };
                        update("externalLinks", next);
                      }}
                    />
                    <input
                      className="ifield"
                      type="url"
                      placeholder="https://…"
                      value={link.url || ""}
                      onChange={e => {
                        const next = [...(draft.externalLinks || [])];
                        next[i] = { ...next[i], url: e.target.value };
                        update("externalLinks", next);
                      }}
                    />
                    <button type="button" className="btn ghost sm" style={{ color: "var(--danger, #c00)" }} onClick={() => {
                      const next = (draft.externalLinks || []).filter((_, idx) => idx !== i);
                      update("externalLinks", next);
                    }}>✕</button>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2, #444)", marginBottom: 8 }}>Company branding</div>
                {!hasRealId && (
                  <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Save the draft first to upload logo and cover photo.</p>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <Field label="Company logo (JPG, PNG, WEBP)">
                      <button type="button" className="img-upload-zone"
                        disabled={!hasRealId || imgBusy.logo}
                        onClick={() => hasRealId && reqLogoInputRef.current && reqLogoInputRef.current.click()}
                        style={{ cursor: (!hasRealId || imgBusy.logo) ? "not-allowed" : "pointer", opacity: hasRealId ? 1 : 0.5, width: "100%" }}>
                        {logoPreview
                          ? <img src={logoPreview} alt="Logo preview" style={{ maxHeight: 70, maxWidth: "100%", objectFit: "contain", borderRadius: 4 }} />
                          : <span style={{ fontSize: 12, color: "var(--muted)" }}>{imgBusy.logo ? "Uploading…" : "Click to upload logo"}</span>}
                      </button>
                      <input ref={reqLogoInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                        style={{ display: "none" }} onChange={e => handleReqImagePick(e, "company-logo")} />
                    </Field>
                    {imgErr.logo && <p style={{ fontSize: 11, color: "var(--danger, #c00)", marginTop: 4 }}>{imgErr.logo}</p>}
                  </div>
                  <div>
                    <Field label="Cover photo (JPG, PNG, WEBP)">
                      <button type="button" className="img-upload-zone"
                        disabled={!hasRealId || imgBusy.cover}
                        onClick={() => hasRealId && reqCoverInputRef.current && reqCoverInputRef.current.click()}
                        style={{ cursor: (!hasRealId || imgBusy.cover) ? "not-allowed" : "pointer", opacity: hasRealId ? 1 : 0.5, width: "100%" }}>
                        {coverPreview
                          ? <img src={coverPreview} alt="Cover preview" style={{ maxHeight: 70, maxWidth: "100%", objectFit: "cover", borderRadius: 4 }} />
                          : <span style={{ fontSize: 12, color: "var(--muted)" }}>{imgBusy.cover ? "Uploading…" : "Click to upload cover"}</span>}
                      </button>
                      <input ref={reqCoverInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                        style={{ display: "none" }} onChange={e => handleReqImagePick(e, "cover-photo")} />
                    </Field>
                    {imgErr.cover && <p style={{ fontSize: 11, color: "var(--danger, #c00)", marginTop: 4 }}>{imgErr.cover}</p>}
                  </div>
                </div>
              </div>

              <div className="form-foot">
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  * Job title is required. You can fill the rest later if you need to.
                </div>
                <div className="cluster">
                  <button className="btn" onClick={saveDraft}>Save draft</button>
                  <button className="btn accent" onClick={applyForm} disabled={!draft.title.trim()}>
                    <I.Send /><span>Apply</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // ----- STAGE 2: CHECKLIST -----
          <div className="req-checklist-wrap">
            {/* Summary card */}
            <div className="card summary-card">
              <div className="spread" style={{ marginBottom: 10 }}>
                <div>
                  <div className="mono eyebrow">Position summary</div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 22, lineHeight: 1.1, marginTop: 4 }}>
                    {draft.title || "Untitled position"}
                  </div>
                </div>
                <button className="btn ghost sm" onClick={editDetails}>Edit details</button>
              </div>
              <div className="summary-row">
                <SumKV k="Client" v={draft.client} />
                <SumKV k="Location" v={draft.location} />
                <SumKV k="Type" v={draft.employmentType} />
                <SumKV k="Hires" v={draft.numHires} />
                <SumKV k="Salary" v={draft.salaryRange} />
                <SumKV k="Closing" v={draft.closingDate} />
              </div>
            </div>

            {/* Checklist */}
            <div className="card checklist-card">
              <div className="spread" style={{ marginBottom: 10 }}>
                <div className="card-title">Pre-posting checklist <small>{checkedCount}/{items.length}</small></div>
                <span className="mono" style={{ fontSize: 11, color: allChecked ? "var(--success)" : "var(--muted)" }}>{pct}%</span>
              </div>
              <div className="progress-bar"><div className="progress-fill" style={{ width: pct + "%" }} /></div>
              <div className="check-list stagger-in">
                {items.map((it, i) => (
                  <label key={it.id} className={"check-item" + (draft.checklist[it.id] ? " checked" : "")} onClick={() => toggleCheck(it.id)} style={{ "--idx": i }}>
                    <span className={"check-box" + (draft.checklist[it.id] ? " done" : "")}>
                      {draft.checklist[it.id] && <I.Check />}
                    </span>
                    <span style={{ flex: 1 }}>{it.label}</span>
                  </label>
                ))}
              </div>
              <div className="card-foot" style={{ marginTop: 14 }}>
                <span>{allChecked ? "All set — ready to publish." : "Complete all items to enable Publish."}</span>
                <div className="cluster">
                  <button className="btn" disabled={!allChecked} onClick={markReady}>Mark Ready</button>
                  <button className="btn accent" disabled={!allChecked} onClick={startPublish}>
                    <I.Send /><span>Publish</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
      {publishing && (
        <PublishAnimation items={items} title={draft.title || "Requisition"} onDone={finishPublish} />
      )}
    </div>
  );
}

// ---- Publish animation overlay ----
function PublishAnimation({ items, title, onDone }) {
  const [step, setStep] = React.useState(0);
  React.useEffect(() => {
    if (step < items.length) {
      const t = setTimeout(() => setStep(s => s + 1), 240);
      return () => clearTimeout(t);
    }
    const t = setTimeout(onDone, 1100);
    return () => clearTimeout(t);
  }, [step]);

  const complete = step >= items.length;
  return (
    <div className="publish-scrim">
      <div className="publish-modal">
        <div className="publish-eyebrow">Publishing requisition</div>
        <div className="publish-title">{title}</div>
        <div className="publish-list">
          {items.map((it, i) => (
            <div key={it.id} className={"publish-step" + (i < step ? " done" : i === step ? " active" : "")}>
              <span className={"check-box" + (i < step ? " done" : "")}>
                {i < step && <I.Check />}
                {i === step && <span className="spinner" />}
              </span>
              <span>{it.label}</span>
            </div>
          ))}
        </div>
        <div className={"publish-complete" + (complete ? " show" : "")}>
          <div className="big-check"><I.Check /></div>
          <div>
            <div className="publish-done-title">Position is live</div>
            <div className="publish-done-sub">Now visible under Positions</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block" }}>
      <div className="mono eyebrow" style={{ marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  );
}

function SumKV({ k, v }) {
  return (
    <div className="sum-kv">
      <div className="mono eyebrow" style={{ marginBottom: 2 }}>{k}</div>
      <div style={{ fontSize: 13 }}>{v || <em style={{ color: "var(--muted)", fontStyle: "normal" }}>—</em>}</div>
    </div>
  );
}

window.Requisitions = Requisitions;
