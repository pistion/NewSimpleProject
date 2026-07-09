// Positions — live postings, AI Filtration panel, Push to Screening, edit
function Positions({ positions, applicants, activePositionId, setActivePositionId, setView, setPositions, pushToScreening, onSavePosition, onSetPositionStatus, onDeletePosition, onEditingChange }) {
  const [editingId, setEditingId] = React.useState(null);
  const [toast, setToast] = React.useState(null);

  React.useEffect(() => {
    if (onEditingChange) onEditingChange(Boolean(editingId));
  }, [editingId, onEditingChange]);

  React.useEffect(() => () => {
    if (onEditingChange) onEditingChange(false);
  }, [onEditingChange]);

  function flash(m) { setToast(m); setTimeout(() => setToast(null), 2200); }
  const openEdit  = (id) => setEditingId(id);
  const closeEdit = () => setEditingId(null);

  async function saveEdit(next) {
    await onSavePosition(next);
    setEditingId(null);
    flash("Position updated");
  }

  async function handleDelete(id) {
    const pos = positions.find(p => p.id === id);
    const title = pos ? (pos.title || "this position") : "this position";
    if (!window.confirm("Delete \"" + title + "\"?\n\nThis permanently removes the position from the database. This cannot be undone.")) return;
    try {
      if (onDeletePosition) {
        await onDeletePosition(id);
      } else if (window.HEYA_API && window.HEYA_API.deletePosition) {
        await window.HEYA_API.deletePosition(id);
        flash("Position deleted");
        // Fallback when parent doesn't manage state: reload to refresh the list.
        setTimeout(() => window.location.reload(), 600);
        return;
      } else {
        throw new Error("No delete handler available");
      }
      if (activePositionId === id) setActivePositionId(null);
      flash("Position deleted");
    } catch (err) {
      console.error(err);
      flash("Couldn't delete \u2014 " + (err && err.message ? err.message : "try again"));
    }
  }

  const body = activePositionId === null
    ? <PositionsList positions={positions} applicants={applicants} setActivePositionId={setActivePositionId} setView={setView} onEdit={openEdit} onSetPositionStatus={onSetPositionStatus} onDelete={handleDelete} />
    : <PositionDetail positions={positions} applicants={applicants}
        activePositionId={activePositionId} setActivePositionId={setActivePositionId} setPositions={setPositions} onEdit={openEdit} setView={setView}
        pushToScreening={pushToScreening} flash={flash} onSetPositionStatus={onSetPositionStatus} onDelete={handleDelete} />;

  const editing = editingId ? positions.find(p => p.id === editingId) : null;

  return (
    <>
      {body}
      {editing && <PositionEditModal position={editing} onCancel={closeEdit} onSave={saveEdit} />}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

// ------------ LIST ------------
function PositionsList({ positions, applicants, setActivePositionId, setView, onEdit, onSetPositionStatus, onDelete }) {
  const [filter, setFilter]     = React.useState("all");
  const [search, setSearch]     = React.useState("");
  const [viewMode, setViewMode] = React.useState("list");
  const live = positions.filter(p => p.status === "published" || p.status === "closed");

  const q = search.trim().toLowerCase();
  const filtered = live.filter(p => {
    if (filter !== "all" && p.status !== filter) return false;
    if (q) {
      const hay = [p.title, p.client, p.location, p.department, p.employmentType, p.ref, p.salaryRange]
        .filter(Boolean).join("  ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  function applicantCount(posId) { return applicants.filter(a => String(a.positionId) === String(posId)).length; }
  function closePos(id)   { onSetPositionStatus(id, "closed"); }
  function republish(id)  { onSetPositionStatus(id, "published"); }

  const filters = [
    { id: "all",       label: "All live" },
    { id: "published", label: "Published" },
    { id: "closed",    label: "Closed" },
  ];

  function rowActions(p) {
    return (
      <PosRowActions p={p}
        onView={() => { setActivePositionId(p.id); setView("applicants"); }}
        onEdit={() => onEdit(p.id)}
        onClose={() => closePos(p.id)}
        onRepub={() => republish(p.id)}
        onDelete={() => onDelete && onDelete(p.id)} />
    );
  }

  function posLogo(p, size) {
    return p.companyLogoUrl
      ? <img src={p.companyLogoUrl} alt="" style={{ width: size, height: size, objectFit: "contain", borderRadius: 4, background: "#f4f4f4", flexShrink: 0 }} />
      : <div style={{ width: size, height: size, borderRadius: 4, background: "var(--surface-2, #f0f0f0)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "var(--muted)", flexShrink: 0 }}>
          {(p.client || p.title || "?")[0].toUpperCase()}
        </div>;
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="mono eyebrow">Positions</div>
          <h1 className="page-title" style={{ marginTop: 8 }}>Live <em>postings</em></h1>
          <div className="page-sub">All currently-published job openings and their applicants. Closed positions open into the AI Filtration view.</div>
        </div>
        <div className="cluster">
          <button className="btn" onClick={() => { setActivePositionId("new"); setView("requisitions"); }}>
            <I.Plus /><span>Start a requisition</span>
          </button>
        </div>
      </div>

      {/* Search + view toggle — mirrors the Talent Pool toolbar */}
      <div className="card talent-toolbar talent-toolbar--search" style={{ marginBottom: 16 }}>
        <form className="talent-search" onSubmit={(e) => e.preventDefault()}>
          <div className="talent-search__field">
            <svg className="talent-search__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2"></circle>
              <line x1="15.5" y1="15.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"></line>
            </svg>
            <input
              className="talent-search__input"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, client, location, department..."
              aria-label="Search positions"
            />
          </div>
          <button type="submit" className="talent-search__submit">Search</button>
        </form>
        <div className="talent-toolbar-actions">
          <div className="toolbar-segment" aria-label="View mode">
            <button type="button" className={viewMode === "grid" ? "is-active" : ""} onClick={() => setViewMode("grid")} title="Grid view"><I.Pipeline /></button>
            <button type="button" className={viewMode === "list" ? "is-active" : ""} onClick={() => setViewMode("list")} title="List view"><I.Menu /></button>
          </div>
        </div>
        <div className="talent-filter-row">
          {filters.map(f => (
            <button key={f.id} className={"chip-btn" + (filter === f.id ? " active" : "")} onClick={() => setFilter(f.id)}>
              {f.label}
              <span className="chip-count">{f.id === "all" ? live.length : live.filter(p => p.status === f.id).length}</span>
            </button>
          ))}
          {q && <span className="talent-search__count mono">{filtered.length} result{filtered.length === 1 ? "" : "s"}</span>}
        </div>
      </div>

      {viewMode === "list" ? (
        <div className="card flush">
          <table className="pos-table">
            <thead>
              <tr>
                <th>Position</th><th>Client</th><th>Location</th><th>Status</th>
                <th style={{ textAlign: "right" }}>Applicants</th><th>Closing</th><th style={{ width: 1 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan="7" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
                  {q ? "No positions match your search." : "No live positions yet."}
                </td></tr>
              )}
              {filtered.map(p => {
                const meta = window.STATUS_META[p.status];
                return (
                  <tr key={p.id} className="pos-row" onClick={() => setActivePositionId(p.id)}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {posLogo(p, 32)}
                        <div>
                          <div style={{ fontWeight: 500 }}>{p.title}</div>
                          <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{p.department || "—"} · {p.employmentType}</div>
                        </div>
                      </div>
                    </td>
                    <td>{p.client || "—"}</td>
                    <td>{p.location || "—"}</td>
                    <td><span className={"status-badge " + meta.cls}>{meta.label}</span></td>
                    <td style={{ textAlign: "right" }} className="num">{applicantCount(p.id)}</td>
                    <td className="num" style={{ fontSize: 12 }}>{p.closingDate || "—"}</td>
                    <td onClick={e => e.stopPropagation()}>{rowActions(p)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="pos-grid">
          {filtered.length === 0 && (
            <div className="card" style={{ gridColumn: "1 / -1", textAlign: "center", padding: 40, color: "var(--muted)" }}>
              {q ? "No positions match your search." : "No live positions yet."}
            </div>
          )}
          {filtered.map(p => {
            const meta = window.STATUS_META[p.status];
            return (
              <div key={p.id} className="pos-card" onClick={() => setActivePositionId(p.id)}>
                <div className="pos-card__head">
                  {posLogo(p, 34)}
                  <div className="pos-card__idblock">
                    <div className="pos-card__title" title={p.title}>{p.title}</div>
                    <div className="pos-card__client">{p.client || "—"}</div>
                  </div>
                  <div className="pos-card__kebab" onClick={e => e.stopPropagation()}>{rowActions(p)}</div>
                </div>
                <div className="pos-card__meta mono">{p.department || "—"} · {p.employmentType}</div>
                <div className="pos-card__meta mono">{p.location || "—"}</div>
                <div className="pos-card__foot">
                  <span className={"status-badge " + meta.cls}>{meta.label}</span>
                  <span className="pos-card__apps mono">{applicantCount(p.id)} applicant{applicantCount(p.id) === 1 ? "" : "s"}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Share helpers ── */
function posShortRef(ref) {
  const m = String(ref || "").match(/(\d+)$/);
  return m ? m[1] : String(ref || "");
}
function posShareUrl(ref) {
  const short = posShortRef(ref);
  const origin = window.location.origin || "";
  return origin + "/careers/vacancies?ref=" + encodeURIComponent(short);
}

/* ── Share popup ── */
function SharePopup({ p, onClose }) {
  const [copied, setCopied] = React.useState(false);
  const url = posShareUrl(p.ref);
  const short = posShortRef(p.ref);

  function copy() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
      });
    } else {
      const el = document.getElementById("share-url-input");
      if (el) { el.select(); document.execCommand("copy"); }
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  }

  return (
    <div className="share-popup-scrim" onClick={onClose}>
      <div className="share-popup" onClick={e => e.stopPropagation()}>
        <div className="share-popup__head">
          <div>
            <div className="share-popup__label">Share position</div>
            <div className="share-popup__title">{p.title}</div>
          </div>
          <button className="share-popup__close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="share-popup__ref">Position ID: <strong>#{short}</strong></div>

        <div className="share-popup__url-row">
          <input id="share-url-input" className="share-popup__url" readOnly value={url} onFocus={e => e.target.select()} />
          <button className={"share-popup__copy" + (copied ? " copied" : "")} onClick={copy}>
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>

        <a className="share-popup__open" href={url} target="_blank" rel="noopener noreferrer">
          Open on site ↗
        </a>
      </div>
    </div>
  );
}

function PosRowActions({ p, onView, onEdit, onClose, onRepub, onDelete }) {
  const [open, setOpen]       = React.useState(false);
  const [sharing, setSharing] = React.useState(false);
  const editDisabled = p.status === "closed";
  return (
    <div className="row-actions">
      <button className="btn ghost sm" onClick={() => setOpen(o => !o)}><I.Dots /></button>
      {open && (
        <>
          <div className="menu-scrim" onClick={() => setOpen(false)} />
          <div className="menu">
            <div className="menu-item" onClick={() => { setOpen(false); onView(); }}>{p.status === "closed" ? "Review applicants" : "View applicants"}</div>
            <div className={"menu-item" + (editDisabled ? " disabled" : "")}
              onClick={() => { if (editDisabled) return; setOpen(false); onEdit(); }}
              title={editDisabled ? "Reopen the position to edit it" : ""}>Edit details</div>
            <div className="menu-item" onClick={() => { setOpen(false); setSharing(true); }}>Share position</div>
            {p.status === "published" && <div className="menu-item danger" onClick={() => { setOpen(false); onClose(); }}>Close position</div>}
            {p.status === "closed" && <div className="menu-item" onClick={() => { setOpen(false); onRepub(); }}>Reopen</div>}
            {onDelete && <div className="menu-sep"></div>}
            {onDelete && <div className="menu-item danger" onClick={() => { setOpen(false); onDelete(); }}>Delete position</div>}
          </div>
        </>
      )}
      {sharing && <SharePopup p={p} onClose={() => setSharing(false)} />}
    </div>
  );
}

// ------------ DETAIL (with AI Filtration) ------------
function PositionDetail({ positions, applicants, activePositionId, setActivePositionId, setPositions, onEdit, setView, pushToScreening, flash, onSetPositionStatus, onDelete }) {
  const p = positions.find(x => x.id === activePositionId);
  const [filterTag, setFilterTag] = React.useState("all");
  const [confirmFiltration, setConfirmFiltration] = React.useState(false);
  const [filtrationRunning, setFiltrationRunning] = React.useState(false);
  const [aiFilterError, setAiFilterError] = React.useState("");
  const [pushAlert, setPushAlert] = React.useState(false);
  const [pushBusy, setPushBusy] = React.useState(false);
  const [pushError, setPushError] = React.useState("");
  const [sharing, setSharing] = React.useState(false);

  if (!p) {
    return (
      <div className="page">
        <button className="btn ghost sm" onClick={() => setActivePositionId(null)}>← Back to positions</button>
        <div className="card" style={{ marginTop: 16, padding: 40, textAlign: "center", color: "var(--muted)" }}>Position not found.</div>
      </div>
    );
  }

  const meta = window.STATUS_META[p.status];
  const posApplicants = applicants.filter(a => String(a.positionId) === String(p.id));
  const editDisabled = p.status === "closed";
  const withScores = posApplicants.map((a) => {
    const c = window.applicantCompleteness(a, p);
    const f = evaluateApplicantForFiltration(a, p, c);
    return { a, c, f };
  });
  const filtration = p.filtration;
  const filtered = filtration
    ? filtration.order.map(id => withScores.find(x => x.a.id === id)).filter(Boolean)
    : [...withScores].sort((x, y) => {
      if (y.f.score !== x.f.score) return y.f.score - x.f.score;
      if (y.c.pct !== x.c.pct) return y.c.pct - x.c.pct;
      return new Date(y.a.appliedAt || 0).getTime() - new Date(x.a.appliedAt || 0).getTime();
    });
  const visible = filterTag === "all" ? filtered : filtered.filter(x => x.c.tag === filterTag);

  function closePos() { onSetPositionStatus(p.id, "closed"); }
  function republish() { onSetPositionStatus(p.id, "published"); }
  function deletePos() { if (onDelete) onDelete(p.id); }
  function runFiltration() {
    setConfirmFiltration(false);
    setAiFilterError("");
    setFiltrationRunning(true);
  }

  async function doAiFilter() {
    try {
      const result = await window.HEYA_API.runAiFilter(p.id);
      if (result && result.filtration && setPositions) {
        setPositions((current) => (current || []).map((position) => {
          if (String(position.id) !== String(p.id)) return position;
          return { ...position, filtration: result.filtration };
        }));
      }
    } catch (err) {
      setAiFilterError(err?.message || "AI filter failed. Please try again.");
      throw err;
    }
  }

  function onFiltrationDone() {
    setFiltrationRunning(false);
    flash && flash("AI Filtration complete — applicants ranked by document completeness");
  }

  function resetFilters() { setFilterTag("all"); }
  function viewApplicants() {
    setActivePositionId(p.id);
    setView("applicants");
  }

  async function onPushClick() {
    if (!filtration || filtration.status !== "done") {
      setPushAlert(true);
      return;
    }
    if (!pushToScreening || pushBusy) return;
    setPushError("");
    setPushBusy(true);
    try {
      await pushToScreening(p.id);
      flash && flash("Applicants pushed to screening");
    } catch (error) {
      setPushError(error?.message || "Unable to push applicants to screening right now.");
    } finally {
      setPushBusy(false);
    }
  }

  const filterChips = [
    { id: "all", label: "All" },
    { id: "complete", label: "Complete" },
    { id: "missing-docs", label: "Missing documents" },
    { id: "incomplete-resume", label: "Incomplete resume" },
    { id: "needs-review", label: "Needs review" },
  ];

  const sumByTag = filtered.reduce((acc, x) => { acc[x.c.tag] = (acc[x.c.tag] || 0) + 1; return acc; }, {});

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <button className="btn ghost sm" onClick={() => setActivePositionId(null)} style={{ marginBottom: 10 }}>← Back to positions</button>
          <div className="cluster">
            <h1 className="page-title" style={{ fontSize: 30, margin: 0 }}>{p.title}</h1>
            <span className={"status-badge " + meta.cls}>{meta.label}</span>
            {filtration && filtration.status === "done" && <span className="status-badge tag-complete">Filtration done</span>}
          </div>
          <div className="page-sub">{p.client ? p.client + " · " : ""}{p.location || "—"} · {p.employmentType}{p.salaryRange ? " · " + p.salaryRange : ""}</div>
        </div>
        <div className="cluster">
          <button className="btn primary" onClick={viewApplicants}>
            <I.Users /><span>View Applicants</span>
          </button>
          <button className="btn" onClick={() => onEdit(p.id)} disabled={editDisabled}
            title={editDisabled ? "Reopen the position to edit it" : "Edit position details"}>Edit details</button>
          <button className="btn ghost sm" onClick={() => setSharing(true)}
            title="Share public link for this position">Share</button>
          <button className="btn ghost sm" onClick={() => window.HEYA_API.downloadPositionZip(p.id)}
            title="Download all applications as a ZIP file">Download ZIP</button>
          <button className="btn accent" onClick={onPushClick} disabled={pushBusy}
            title={!filtration ? "Run AI Filtration first" : "Push filtered applicants to Screening"}>
            <I.Send /><span>{pushBusy ? "Pushing..." : "Push to Screening"}</span>
          </button>
          {p.status === "published" && <button className="btn" onClick={closePos}>Close position</button>}
          {p.status === "closed" && <button className="btn" onClick={republish}>Reopen position</button>}
          {onDelete && <button className="btn ghost" onClick={deletePos}>Delete position</button>}
        </div>
      </div>

      {sharing && <SharePopup p={p} onClose={() => setSharing(false)} />}

      <div className="grid cols-4" style={{ marginBottom: 20 }}>
        <SummaryStat label="Applicants" value={posApplicants.length} />
        <SummaryStat label="Complete" value={sumByTag["complete"] || 0} />
        <SummaryStat label="Needs review" value={(sumByTag["needs-review"] || 0) + (sumByTag["incomplete-resume"] || 0)} />
        <SummaryStat label="Missing docs" value={sumByTag["missing-docs"] || 0} />
      </div>

      <div className="grid cols-2" style={{ gap: 18, marginBottom: 18 }}>
        <div className="card posting-role-card">
          <div className="card-title" style={{ marginBottom: 14 }}>About the role</div>
          <RoleSection label="About the Role" content={p.description} mode="paragraph" empty="About the Role has not been added yet." />
          <RoleSection label="Key Responsibilities" content={p.responsibilities} mode="list" empty="Key Responsibilities have not been added yet." />
          <RoleSection label="Qualifications and Experience" content={p.requirements} mode="list" empty="Qualifications and Experience have not been added yet." />
        </div>

        <div className="card posting-role-card">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            {p.companyLogoUrl && (
              <img src={p.companyLogoUrl} alt={p.client + " logo"} style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 6, background: "#f4f4f4", border: "1px solid #eee", padding: 4 }} />
            )}
            <div className="card-title">Posting details</div>
          </div>
          {p.coverPhotoUrl && (
            <div style={{ marginBottom: 14, borderRadius: 8, overflow: "hidden", height: 120 }}>
              <img src={p.coverPhotoUrl} alt="Cover photo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          )}
          <div className="posting-meta-grid">
            <PostingMeta label="Department" value={p.department} />
            <PostingMeta label="Hires" value={p.numHires} />
            <PostingMeta label="Employment type" value={p.employmentType} />
            <PostingMeta label="Level" value={p.level} />
            <PostingMeta label="Location" value={p.location} />
            <PostingMeta label="Salary" value={p.salaryRange} />
            <PostingMeta label="Start date" value={p.startDate} />
            <PostingMeta label="Closing date" value={p.closingDate} />
            <PostingMeta label="Contact person" value={p.contactPerson} />
            <PostingMeta label="Reason for hiring" value={p.reasonForHiring} wide />
            {p.companyDescription && <PostingMeta label="About Us" value={p.companyDescription} wide />}
            <PostingMeta label="Cover letter required" value={p.coverLetterRequired ? "Yes" : "No"} />
            {p.externalApplyUrl && (
              <PostingMeta label="External apply URL" value={<a href={p.externalApplyUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", wordBreak: "break-all" }}>{p.externalApplyUrl}</a>} />
            )}
            {p.externalLinks && p.externalLinks.length > 0 && (
              <PostingMeta label="Additional links" wide value={
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px" }}>
                  {p.externalLinks.map((link, i) => (
                    <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", fontSize: 13 }}>
                      {link.label || link.url}
                    </a>
                  ))}
                </div>
              } />
            )}
            <PostingMeta label="Total applicants" value={posApplicants.length} />
          </div>
        </div>
      </div>

      <div className="card filtration-card">
        <div className="spread" style={{ marginBottom: 8 }}>
          <div className="card-title">AI Filtration</div>
          {filtration && filtration.status === "done" && <span className="status-badge tag-complete">Filtration done</span>}
        </div>
        <div className="ai-disclaimer">
          AI Filtration helps organize applications before human screening. It does not approve, reject, or shortlist candidates.
        </div>

        <div className="filtration-actions">
          <button className="btn accent sm" onClick={() => setConfirmFiltration(true)}>
            {filtration ? "Re-run AI Filtration" : "Run AI Filtration"}
          </button>
          <button className="btn ghost sm" onClick={resetFilters} disabled={filterTag === "all"}>Reset filters</button>
        </div>

        <div className="filter-row" style={{ marginTop: 12, marginBottom: 8 }}>
          {filterChips.map(f => (
            <button key={f.id} className={"chip-btn sm" + (filterTag === f.id ? " active" : "")} onClick={() => setFilterTag(f.id)}>
              {f.label}
              <span className="chip-count">{f.id === "all" ? filtered.length : (sumByTag[f.id] || 0)}</span>
            </button>
          ))}
        </div>

        {!filtration && (
          <div className="hint-box">
            Run AI Filtration to organize applicants by completeness. The list below shows applicants in default order until filtration runs.
          </div>
        )}

        <div className="rank-queue">
          {visible.length === 0 && (
            <div style={{ color: "var(--muted)", fontSize: 13, padding: "16px 0", textAlign: "center" }}>No applicants match this filter.</div>
          )}
          {visible.map((row, i) => {
            const a = row.a; const c = row.c; const f = row.f;
            const tag = window.COMPLETENESS_TAGS[c.tag];
            const aiCard = (filtration && filtration.mode === "ai" && filtration.scorecards)
              ? (filtration.scorecards.find(s => String(s.applicantId) === String(a.id)) || null)
              : null;
            const AI_CRITERIA_LABELS = {
              cv_resume_present: "CV present",
              cv_resume_readable: "CV readable",
              profile_picture_present: "Profile photo",
              cover_letter_or_interest_letter_present: "Cover letter",
              application_form_complete: "Form complete",
              required_id_documents_present: "ID documents",
              tabonetta_or_community_document_present: "Community doc",
              additional_supporting_documents_present: "Additional docs"
            };
            return (
              <div key={a.id} className="rank-row">
                <div className="rank-num">#{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="spread">
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{a.name || <Em>Unnamed</Em>}</div>
                    <span className={"tag-pill " + tag.cls}>{tag.label}</span>
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{a.email || "no email"} · {a.cvName || "no CV"}</div>
                  {aiCard ? (
                    <>
                      <div className="mono" style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-2, #444)", marginTop: 5 }}>
                        AI doc score: {aiCard.score}/{aiCard.maxScore}
                      </div>
                      <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 2, fontStyle: "italic" }}>
                        {aiCard.summary}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 8px", marginTop: 5 }}>
                        {Object.entries(aiCard.criteria || {}).map(([key, val]) => (
                          <span key={key} className="mono" style={{ fontSize: 10, color: val ? "var(--success, #2a7a2a)" : "var(--muted)" }}>
                            {val ? "✓" : "✗"} {AI_CRITERIA_LABELS[key] || key}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="rank-mini">
                        <div className="progress-bar" style={{ flex: 1 }}>
                          <div className="progress-fill" style={{ width: c.pct + "%" }} />
                        </div>
                        <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{c.pct}%</span>
                      </div>
                      <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                        Filtration score: {f.score}/100 · {f.verdict}
                      </div>
                      {(c.missingReq.length > 0 || c.missingOpt.length > 0) && (
                        <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                          Missing: {[...c.missingReq, ...c.missingOpt].join(", ")}
                        </div>
                      )}
                      {f.reasons.length > 0 && (
                        <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                          Why ranked here: {f.reasons.join("; ")}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {confirmFiltration && (
        <ConfirmModal
          title="Run AI Filtration?"
          body="This is not an automated screening decision. This AI-powered tool only organizes applications by completeness and missing information to help make manual screening smoother. Final screening decisions must be made by a human reviewer."
          confirmLabel="Run filtration"
          onCancel={() => setConfirmFiltration(false)}
          onConfirm={runFiltration}
        />
      )}

      {filtrationRunning && (
        <FiltrationAnimation applicants={posApplicants} onRun={doAiFilter} onDone={onFiltrationDone} />
      )}

      {pushAlert && (
        <ConfirmModal
          title="Filtration required"
          body="You need to run AI Filtration before pushing applicants to Screening. Filtration organizes applications by completeness and missing information so the screening process starts in the correct order."
          confirmLabel="Got it"
          singleAction={true}
          onCancel={() => setPushAlert(false)}
          onConfirm={() => setPushAlert(false)}
        />
      )}

      {pushError && (
        <ConfirmModal
          title="Push to screening failed"
          body={pushError}
          confirmLabel="OK"
          singleAction={true}
          onCancel={() => setPushError("")}
          onConfirm={() => setPushError("")}
        />
      )}

      {aiFilterError && (
        <ConfirmModal
          title="AI Filtration failed"
          body={aiFilterError}
          confirmLabel="OK"
          singleAction={true}
          onCancel={() => setAiFilterError("")}
          onConfirm={() => setAiFilterError("")}
        />
      )}
    </div>
  );
}

// ----- Filtration progress animation -----
function FiltrationAnimation({ applicants, onRun, onDone }) {
  const [step, setStep] = React.useState(0);
  const [failed, setFailed] = React.useState(false);
  const steps = [
    "Sending to AI…",
    "Analyzing documents…",
    "Checking document completeness…",
    "Scoring each applicant…",
    "Ranking by completeness…",
  ];

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      // Advance through the first few steps to show progress while the API call runs
      for (let i = 0; i < steps.length - 1; i++) {
        if (cancelled) return;
        await new Promise(resolve => setTimeout(resolve, 600));
        if (cancelled) return;
        setStep(i + 1);
      }
      // Now do the actual API call
      try {
        if (onRun) await onRun();
      } catch {
        if (!cancelled) { setFailed(true); return; }
      }
      if (cancelled) return;
      // Final step done
      setStep(steps.length);
      await new Promise(resolve => setTimeout(resolve, 700));
      if (!cancelled) onDone();
    }
    run();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="publish-scrim">
      <div className="publish-modal">
        <div className="publish-eyebrow">AI Filtration</div>
        <div className="publish-title">Analyzing {applicants.length} applicant{applicants.length === 1 ? "" : "s"}</div>
        {failed ? (
          <div style={{ color: "var(--error, #c00)", fontSize: 13, marginTop: 12 }}>
            AI filter failed. Please close this dialog and try again.
          </div>
        ) : (
          <div className="publish-list">
            {steps.map((s, i) => (
              <div key={s} className={"publish-step" + (i < step ? " done" : i === step ? " active" : "")}>
                <span className={"check-box" + (i < step ? " done" : "")}>
                  {i < step && <I.Check />}
                  {i === step && <span className="spinner" />}
                </span>
                <span>{s}</span>
              </div>
            ))}
          </div>
        )}
        <div className="ai-disclaimer" style={{ marginTop: 16 }}>
          Document check only. This does not approve, reject, or shortlist any applicant.
        </div>
      </div>
    </div>
  );
}

// ----- Reusable Confirm Modal -----
function ConfirmModal({ title, body, confirmLabel, cancelLabel, onCancel, onConfirm, singleAction, accent }) {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div className="publish-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="confirm-modal">
        <div className="publish-eyebrow">Heads up</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 22, marginTop: 4, marginBottom: 12 }}>{title}</div>
        <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55 }}>{body}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          {!singleAction && <button className="btn" onClick={onCancel}>{cancelLabel || "Cancel"}</button>}
          <button className={"btn " + (accent === false ? "primary" : "accent")} onClick={onConfirm}>{confirmLabel || "Confirm"}</button>
        </div>
      </div>
    </div>
  );
}

function readFileAsUpload(file) {
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

// ------------ EDIT MODAL ------------
function PositionEditModal({ position, onCancel, onSave }) {
  const [draft, setDraft] = React.useState(position);
  const [logoPreview, setLogoPreview] = React.useState(position.companyLogoUrl || null);
  const [coverPreview, setCoverPreview] = React.useState(position.coverPhotoUrl || null);
  const [imgBusy, setImgBusy] = React.useState({ logo: false, cover: false });
  const [imgErr, setImgErr] = React.useState({ logo: "", cover: "" });
  const logoInputRef = React.useRef(null);
  const coverInputRef = React.useRef(null);

  React.useEffect(() => {
    setDraft(position);
    setLogoPreview(position.companyLogoUrl || null);
    setCoverPreview(position.coverPhotoUrl || null);
  }, [position.id]);

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const update = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  async function handleImagePick(e, field) {
    const file = e.target.files?.[0];
    if (!file) return;
    const key = field === "company-logo" ? "logo" : "cover";
    setImgBusy(b => ({ ...b, [key]: true }));
    setImgErr(b => ({ ...b, [key]: "" }));
    try {
      const upload = await readFileAsUpload(file);
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

  function save() { if (!draft.title.trim()) return; onSave(draft); }
  return (
    <div className="publish-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="edit-modal">
        <div className="edit-modal-head">
          <div>
            <div className="mono eyebrow">Editing position</div>
            <div className="edit-modal-title">{draft.title || "Untitled position"}</div>
          </div>
          <button className="icon-btn" onClick={onCancel} title="Close">✕</button>
        </div>
        <div className="edit-modal-body">
          <div className="form-grid">
            <Field label="Job title*"><input className="ifield" value={draft.title} onChange={e => update("title", e.target.value)} /></Field>
            <Field label="Client / company"><input className="ifield" value={draft.client} onChange={e => update("client", e.target.value)} /></Field>
            <Field label="Department"><input className="ifield" value={draft.department} onChange={e => update("department", e.target.value)} /></Field>
            <Field label="Location"><input className="ifield" value={draft.location} onChange={e => update("location", e.target.value)} /></Field>
            <Field label="Employment type">
              <select className="ifield" value={draft.employmentType} onChange={e => update("employmentType", e.target.value)}>
                <option>Full-time</option><option>Part-time</option><option>Contract</option><option>Internship</option>
              </select>
            </Field>
            <Field label="Number of hires"><input className="ifield" type="number" min="1" value={draft.numHires} onChange={e => update("numHires", parseInt(e.target.value || "1"))} /></Field>
            <Field label="Salary range"><input className="ifield" value={draft.salaryRange} onChange={e => update("salaryRange", e.target.value)} /></Field>
            <Field label="Contact person"><input className="ifield" value={draft.contactPerson} onChange={e => update("contactPerson", e.target.value)} /></Field>
            <Field label="Start date"><input className="ifield" type="date" value={draft.startDate} onChange={e => update("startDate", e.target.value)} /></Field>
            <Field label="Closing date"><input className="ifield" type="date" value={draft.closingDate} onChange={e => update("closingDate", e.target.value)} /></Field>
          </div>
          <div style={{ marginTop: 14 }}><Field label="Reason for hiring"><input className="ifield" value={draft.reasonForHiring} onChange={e => update("reasonForHiring", e.target.value)} /></Field></div>
          <div style={{ marginTop: 14 }}>
            <Field label="External apply URL (optional)">
              <input
                className="ifield"
                type="url"
                placeholder="https://company.com/careers/apply — leave blank to use Glondiasites application form"
                value={draft.externalApplyUrl || ""}
                onChange={e => update("externalApplyUrl", e.target.value)}
              />
            </Field>
            {draft.externalApplyUrl && (
              <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                ⚠ When set, the public "Apply Now" button will redirect candidates to this URL instead of the Glondiasites application form.
              </p>
            )}
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
          <div style={{ marginTop: 14 }}><Field label="About Us (shown on public listing)"><textarea className="ifield" rows="4" placeholder="Who the company is — their sector, size, mission, and values." value={draft.companyDescription || ""} onChange={e => update("companyDescription", e.target.value)} /></Field></div>

          <div style={{ marginTop: 14 }}>
            <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <Field label="Company logo (JPG, PNG, WEBP)">
                  <button type="button" className="img-upload-zone" disabled={imgBusy.logo}
                    onClick={() => logoInputRef.current && logoInputRef.current.click()}
                    style={{ cursor: imgBusy.logo ? "wait" : "pointer", width: "100%" }}>
                    {logoPreview
                      ? <img src={logoPreview} alt="Company logo preview" style={{ maxHeight: 80, maxWidth: "100%", objectFit: "contain", borderRadius: 4 }} />
                      : <span style={{ fontSize: 12, color: "var(--muted)" }}>{imgBusy.logo ? "Uploading…" : "Click to upload logo"}</span>}
                  </button>
                  <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                    style={{ display: "none" }} onChange={e => handleImagePick(e, "company-logo")} />
                </Field>
                {imgErr.logo && <p style={{ fontSize: 11, color: "var(--danger, #c00)", marginTop: 4 }}>{imgErr.logo}</p>}
              </div>
              <div>
                <Field label="Cover photo (JPG, PNG, WEBP)">
                  <button type="button" className="img-upload-zone" disabled={imgBusy.cover}
                    onClick={() => coverInputRef.current && coverInputRef.current.click()}
                    style={{ cursor: imgBusy.cover ? "wait" : "pointer", width: "100%" }}>
                    {coverPreview
                      ? <img src={coverPreview} alt="Cover photo preview" style={{ maxHeight: 80, maxWidth: "100%", objectFit: "cover", borderRadius: 4 }} />
                      : <span style={{ fontSize: 12, color: "var(--muted)" }}>{imgBusy.cover ? "Uploading…" : "Click to upload cover photo"}</span>}
                  </button>
                  <input ref={coverInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                    style={{ display: "none" }} onChange={e => handleImagePick(e, "cover-photo")} />
                </Field>
                {imgErr.cover && <p style={{ fontSize: 11, color: "var(--danger, #c00)", marginTop: 4 }}>{imgErr.cover}</p>}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}><Field label="About the Role"><textarea className="ifield" rows="5" value={draft.description} onChange={e => update("description", e.target.value)} /></Field></div>
          <div style={{ marginTop: 14 }}><Field label="Key Responsibilities"><textarea className="ifield" rows="5" value={draft.responsibilities} onChange={e => update("responsibilities", e.target.value)} /></Field></div>
          <div style={{ marginTop: 14 }}><Field label="Qualifications and Experience"><textarea className="ifield" rows="5" value={draft.requirements} onChange={e => update("requirements", e.target.value)} /></Field></div>
        </div>
        <div className="edit-modal-foot">
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Changes apply only to this position.</span>
          <div className="cluster">
            <button className="btn" onClick={onCancel}>Cancel</button>
            <button className="btn primary" onClick={save} disabled={!draft.title.trim()}>Save changes</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryStat({ label, value }) {
  return (
    <div className="card stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}
function Info({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="mono eyebrow" style={{ marginBottom: 6 }}>{label}</div>
      <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}
function KV({ k, v }) {
  return (
    <div>
      <div className="mono eyebrow" style={{ marginBottom: 2 }}>{k}</div>
      <div style={{ fontSize: 13 }}>{v != null && v !== "" ? v : <Em>—</Em>}</div>
    </div>
  );
}
function Em({ children }) { return <em style={{ color: "var(--muted)", fontStyle: "normal" }}>{children}</em>; }

function RoleSection({ label, content, mode = "paragraph", empty }) {
  const items = splitRoleContent(content);

  return (
    <div className="posting-role-section">
      <div className="posting-role-label">{label}</div>
      {!items.length ? (
        <div className="posting-role-empty">{empty || "Not specified."}</div>
      ) : mode === "list" ? (
        <ul className="posting-role-list">
          {items.map((item, index) => <li key={label + "-" + index}>{item}</li>)}
        </ul>
      ) : (
        <div className="posting-role-copy">
          {items.map((item, index) => <p key={label + "-" + index}>{item}</p>)}
        </div>
      )}
    </div>
  );
}

function PostingMeta({ label, value, wide }) {
  return (
    <div className={"posting-meta-card" + (wide ? " wide" : "")}>
      <div className="posting-meta-label">{label}</div>
      <div className="posting-meta-value">{value != null && value !== "" ? value : "—"}</div>
    </div>
  );
}

function splitRoleContent(content) {
  const source = String(content || "").trim();
  if (!source) return [];

  const byLine = source
    .split(/\r?\n+/)
    .map((item) => item.replace(/^[•\-*\d.)\s]+/, "").trim())
    .filter(Boolean);

  if (byLine.length > 1) return byLine;

  const bySentence = source
    .split(/(?:;\s+)|(?:\.\s+)/)
    .map((item) => item.replace(/^[•\-*\d.)\s]+/, "").trim())
    .filter(Boolean);

  return bySentence.length > 1 ? bySentence : [source];
}

function parseYears(value) {
  const text = String(value || "");
  const match = text.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4);
}

function buildPositionKeywordSet(position) {
  const combined = [
    position?.title,
    position?.department,
    position?.industry,
    position?.requirements,
    position?.responsibilities,
    position?.description
  ].join(" ");
  const stopwords = new Set(["with", "from", "that", "this", "have", "will", "your", "years", "role", "team", "work", "full", "time"]);
  const words = tokenize(combined).filter((word) => !stopwords.has(word));
  return [...new Set(words)].slice(0, 30);
}

function evaluateApplicantForFiltration(applicant, position, completeness) {
  let score = 0;
  const reasons = [];

  const hasCv = Boolean(applicant.cvName || applicant.cvFile?.downloadUrl);
  const hasCover = Boolean(applicant.coverLetterName || applicant.coverLetterFile?.downloadUrl || applicant.coverLetterText);
  const hasEmail = Boolean(String(applicant.email || "").trim());
  const hasPhone = Boolean(String(applicant.phone || "").trim());

  const completenessPct = Number(completeness?.pct || 0);
  score += Math.round(completenessPct * 0.45);
  reasons.push(`completeness ${completenessPct}%`);

  if (hasCv) { score += 16; reasons.push("CV provided"); }
  if (hasCover) { score += 8; reasons.push("cover letter/data provided"); }
  if (hasEmail && hasPhone) { score += 8; reasons.push("full contact details"); }
  else if (hasEmail || hasPhone) { score += 4; reasons.push("partial contact details"); }

  const requiredYears = parseYears(position?.requirements);
  const candidateYears = parseYears(applicant?.yearsExperience);
  if (requiredYears != null && candidateYears != null) {
    if (candidateYears >= requiredYears) {
      score += 12;
      reasons.push(`experience ${candidateYears}y meets ${requiredYears}y+`);
    } else {
      const ratio = Math.max(0, candidateYears / requiredYears);
      score += Math.round(12 * ratio);
      reasons.push(`experience ${candidateYears}y below ${requiredYears}y+`);
    }
  } else if (candidateYears != null) {
    score += 6;
    reasons.push(`experience provided (${candidateYears}y)`);
  }

  const positionKeywords = buildPositionKeywordSet(position);
  const applicantText = [
    applicant?.coverLetterText,
    applicant?.cvName,
    applicant?.coverLetterName,
    applicant?.yearsExperience,
    applicant?.currentLocation
  ].join(" ").toLowerCase();
  const matchedKeywords = positionKeywords.filter((keyword) => applicantText.includes(keyword));
  score += Math.min(12, matchedKeywords.length * 2);
  if (matchedKeywords.length) {
    reasons.push(`matched keywords: ${matchedKeywords.slice(0, 4).join(", ")}`);
  }

  const roleLocation = String(position?.location || "").toLowerCase();
  const applicantLocation = String(applicant?.currentLocation || "").toLowerCase();
  if (roleLocation && applicantLocation && (roleLocation.includes(applicantLocation) || applicantLocation.includes(roleLocation.split(" ")[0]))) {
    score += 4;
    reasons.push("location appears aligned");
  }

  if ((completeness?.missingReq || []).length > 0) {
    score -= 12;
    reasons.push("missing required items");
  }

  score = Math.max(0, Math.min(100, score));
  const verdict = score >= 75 ? "high_priority" : score >= 55 ? "review" : "needs_info";
  return { score, verdict, reasons, matchedKeywords: matchedKeywords.slice(0, 8) };
}

window.Positions = Positions;
window.ConfirmModal = ConfirmModal;
