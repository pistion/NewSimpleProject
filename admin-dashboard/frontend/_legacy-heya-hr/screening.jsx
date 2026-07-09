// Screening — positions in screening, criteria builder, per-applicant scoring workspace
function emptyScreeningState() {
  return { status: "not-started", scores: {}, ai: null, report: { content: "", recommendation: "" }, savedAt: null };
}

function normalizeScreeningForSnapshot(screening) {
  const current = screening || emptyScreeningState();
  const normalizedScores = Object.keys(current.scores || {}).sort().reduce((acc, key) => {
    const item = current.scores[key] || {};
    acc[key] = {
      score: item.score === "" || item.score === undefined ? null : item.score,
      mark: item.mark || "",
      notes: item.notes || ""
    };
    return acc;
  }, {});
  return JSON.stringify({
    status: current.status || "not-started",
    scores: normalizedScores,
    report: {
      content: current.report?.content || "",
      recommendation: current.report?.recommendation || ""
    }
  });
}

function Screening({ positions, setPositions, applicants, setApplicants, activePositionId, setActivePositionId, onSavePositionKpiCriteria, onSaveApplicantScreening, onUpdateApplicantStatus, onEditingChange, onDeletePosition, onReloadDashboard }) {
  const [subView, setSubView] = React.useState("list");
  const [activeApplicantId, setActiveApplicantId] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const [needCriteriaAlert, setNeedCriteriaAlert] = React.useState(false);
  function flash(message) {
    const next = typeof message === "string" ? { tone: "success", message } : { tone: "success", ...(message || {}) };
    setToast(next);
    setTimeout(() => setToast(null), next.tone === "error" ? 3600 : 2400);
  }

  React.useEffect(() => {
    if (activePositionId) setSubView("position");
    else { setSubView("list"); setActiveApplicantId(null); }
  }, [activePositionId]);

  React.useEffect(() => {
    if (!onEditingChange) return undefined;
    const editing = subView !== "list";
    onEditingChange(editing);
    return () => onEditingChange(false);
  }, [subView, onEditingChange]);

  function openPosition(id) { setActivePositionId(id); setSubView("position"); }
  function backToList()     { setActivePositionId(null); setActiveApplicantId(null); setSubView("list"); }
  function openCriteria()   { setSubView("criteria"); }
  function backToPosition() { setActiveApplicantId(null); setSubView("position"); }
  function tryOpenApplicant(aid, position) {
    const hasCriteria = position && position.screening && position.screening.criteria && position.screening.criteria.length > 0;
    if (!hasCriteria) { setNeedCriteriaAlert(true); return; }
    setActiveApplicantId(aid);
    setSubView("applicant");
  }

  const p = activePositionId ? positions.find(x => x.id === activePositionId) : null;
  const a = activeApplicantId ? applicants.find(x => x.id === activeApplicantId) : null;

  let body;
  if (subView === "list")           body = <ScreeningList positions={positions} applicants={applicants} openPosition={openPosition} onDeletePosition={onDeletePosition} flash={flash} />;
  else if (subView === "position" && p)  body = <AdvancedScreeningPosition p={p} applicants={applicants} backToList={backToList} openCriteria={openCriteria} openApplicant={(aid) => tryOpenApplicant(aid, p)} flash={flash} onReloadDashboard={onReloadDashboard} />;
  else if (subView === "criteria" && p)  body = <CriteriaBuilder p={p} setPositions={setPositions} onDone={backToPosition} flash={flash} onSaveKpiCriteria={onSavePositionKpiCriteria} />;
  else if (subView === "applicant" && p && a) body = <ApplicantScreening p={p} a={a} applicants={applicants} setApplicants={setApplicants} backToPosition={backToPosition} flash={flash} onSaveApplicantScreening={onSaveApplicantScreening}
            pushToShortlist={async () => {
              const criteriaResponse = await window.HEYA_API.getPositionShortlistingCriteria(p.id);
              const criteria = Array.isArray(criteriaResponse?.criteria) ? criteriaResponse.criteria : [];
              const selectedCriteria = criteria[0];
              if (!selectedCriteria) {
                throw new Error("Create shortlisting criteria for this position before pushing applicants.");
              }
              const confirmed = window.confirm(
                `Push Applicants to Shortlist\n\nPosition: ${p.title}\n\nThe following applicant will be moved to Shortlisted:\n- ${a.name || "Applicant"}`
              );
              if (!confirmed) return;
              await window.HEYA_API.pushToShortlist(p.id, {
                positionId: p.id,
                shortlistingCriteriaId: selectedCriteria.id,
                applicationIds: [a.id],
                action: "push_to_shortlist"
              });
              await onUpdateApplicantStatus(a.id, "shortlisted");
              flash("Applicant pushed to Shortlisted.");
            }} />;
  else body = <ScreeningList positions={positions} applicants={applicants} openPosition={openPosition} onDeletePosition={onDeletePosition} flash={flash} />;

  return <>
    {body}
    {toast && <div className={"toast " + (toast.tone === "error" ? "is-error" : "is-success")}>{toast.message}</div>}
    {needCriteriaAlert && (
      <ConfirmModal
        title="Create criteria first"
        body="Please create screening criteria before screening applicants. Criteria are used as the checklist / KPI sheet for measuring each applicant fairly."
        confirmLabel="Create criteria now"
        cancelLabel="Not now"
        onCancel={() => setNeedCriteriaAlert(false)}
        onConfirm={() => { setNeedCriteriaAlert(false); openCriteria(); }}
      />
    )}
  </>;
}

// ============ LIST of in-screening positions ============
function ScreeningList({ positions, applicants, openPosition, onDeletePosition, flash }) {
  const inScreening = positions.filter(p => p.status === "screening");
  const [deletingPositionId, setDeletingPositionId] = React.useState(null);

  function counts(p) {
    const ids = (p.screening && p.screening.rankings) || [];
    const pool = ids.length
      ? applicants.filter(a => ids.includes(a.id))
      : applicants.filter(a => String(a.positionId) === String(p.id) && a.status === "screening");
    return {
      total:    pool.length,
      notStarted: pool.filter(a => !a.screening || a.screening.status === "not-started").length,
      inReview:   pool.filter(a => a.screening?.status === "in-review").length,
      screened:   pool.filter(a => a.screening?.status === "screened").length,
      recommended:pool.filter(a => a.screening?.status === "recommended-shortlist").length,
    };
  }
  function statusBadge(p) {
    const hasCriteria = p.screening && (p.screening.criteria || []).length > 0;
    if (!hasCriteria) return { label: "Not started", cls: "status-draft" };
    const c = counts(p);
    if (c.screened + c.recommended === c.total) return { label: "Complete", cls: "status-published" };
    if (c.screened + c.recommended > 0 || c.inReview > 0) return { label: "In progress", cls: "status-review" };
    return { label: "Ready to screen", cls: "status-ready" };
  }
  function progress(p) {
    const c = counts(p);
    const done = c.screened + c.recommended;
    return { pct: c.total ? Math.round((done / c.total) * 100) : 0, done, total: c.total };
  }

  async function deletePosition(position, event) {
    event.stopPropagation();
    if (!onDeletePosition) return;
    const confirmed = window.confirm(`Delete "${position.title}"?\n\nThis removes the position and associated applications.`);
    if (!confirmed) return;
    setDeletingPositionId(String(position.id));
    try {
      await onDeletePosition(position.id);
      if (flash) flash("Position deleted.");
    } catch (error) {
      if (flash) flash(error.message || "Unable to delete position right now.");
    } finally {
      setDeletingPositionId(null);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="mono eyebrow">Screening</div>
          <h1 className="page-title" style={{ marginTop: 8 }}>Positions in <em>screening</em></h1>
          <div className="page-sub">Closed positions that have been pushed to screening. Open one to define criteria and score each applicant.</div>
        </div>
      </div>

      <div className="card flush">
        <table className="pos-table" style={{ tableLayout: "fixed", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ width: "12%" }}>Position</th><th style={{ width: "10%" }}>Client</th><th style={{ width: "10%" }}>Location</th>
              <th style={{ width: "9%" }}>Department</th><th style={{ width: "7%" }}>Type</th>
              <th style={{ width: "9%", textAlign: "right" }}>Applicants</th>
              <th style={{ width: "9%" }}>Status</th><th style={{ width: "8%" }}>Pushed</th><th style={{ width: "9%" }}>Progress</th>
              <th style={{ width: "17%" }}></th>
            </tr>
          </thead>
          <tbody>
            {inScreening.length === 0 && (
              <tr><td colSpan="10" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
                No positions in screening yet. From a closed position, run AI Filtration and click <b>Push to Screening</b>.
              </td></tr>
            )}
            {inScreening.map(p => {
              const prog = progress(p);
              const badge = statusBadge(p);
              return (
                <tr key={p.id} className="pos-row" onClick={() => openPosition(p.id)}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{p.title}</div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{p.salaryRange || ""}</div>
                  </td>
                  <td>{p.client || "—"}</td>
                  <td>{p.location || "—"}</td>
                  <td>{p.department || "—"}</td>
                  <td className="mono" style={{ fontSize: 11 }}>{p.employmentType}</td>
                  <td className="num" style={{ textAlign: "right" }}>{prog.total}</td>
                  <td><span className={"status-badge " + badge.cls}>{badge.label}</span></td>
                  <td className="num" style={{ fontSize: 12 }}>{p.screening?.pushedAt ? new Date(p.screening.pushedAt).toLocaleDateString("en-PG", { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                  <td>
                    <div className="progress-bar"><div className="progress-fill" style={{ width: prog.pct + "%" }} /></div>
                    <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>{prog.done}/{prog.total} screened</div>
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <div className="cluster" style={{ justifyContent: "flex-end", gap: 8 }}>
                      <button className="btn sm" onClick={() => openPosition(p.id)}>Open Screening</button>
                      <button
                        className="btn ghost sm"
                        onClick={(event) => deletePosition(p, event)}
                        disabled={String(deletingPositionId) === String(p.id)}
                        title="Delete position"
                      >
                        {String(deletingPositionId) === String(p.id) ? "Deleting..." : "Delete"}
                      </button>
                    </div>
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

// ============ POSITION screening view ============
function ScreeningPosition({ p, applicants, backToList, openCriteria, openApplicant, flash }) {
  const screening = p.screening || {};
  const criteria = screening.criteria || [];
  const hasCriteria = criteria.length > 0;
  const order = screening.rankings || [];
  const ranked = order.length
    ? order.map(id => applicants.find(a => a.id === id)).filter(Boolean)
    : applicants.filter(a => String(a.positionId) === String(p.id) && a.status === "screening");

  // Score helpers
  function weightedTotal(a) {
    let total = 0; let max = 0;
    criteria.forEach(c => {
      const s = (a.screening && a.screening.scores || {})[c.id];
      if (s && typeof s.score === "number") total += s.score * c.weight;
      max += c.maxPoints * c.weight;
    });
    return { total, max, pct: max ? Math.round((total / max) * 100) : 0 };
  }
  function rec(pct) {
    if (pct >= 80) return { label: "Strong match",   cls: "rec-strong" };
    if (pct >= 60) return { label: "Potential match", cls: "rec-potential" };
    if (pct >= 40) return { label: "Needs review",    cls: "rec-review" };
    return { label: "Not enough information",         cls: "rec-low" };
  }

  // Position-level progress stats
  const stats = (() => {
    const s = { total: ranked.length, notStarted: 0, inReview: 0, screened: 0, recommended: 0, needsInfo: 0, avg: 0 };
    let sumPct = 0; let scoredCount = 0;
    ranked.forEach(a => {
      const status = (a.screening && a.screening.status) || "not-started";
      if (status === "not-started") s.notStarted++;
      if (status === "in-review")   s.inReview++;
      if (status === "screened")    s.screened++;
      if (status === "recommended-shortlist") s.recommended++;
      if (status === "needs-more-info") s.needsInfo++;
      const wt = weightedTotal(a);
      if (wt.max > 0 && wt.total > 0) { sumPct += wt.pct; scoredCount++; }
    });
    s.avg = scoredCount ? Math.round(sumPct / scoredCount) : 0;
    return s;
  })();

  function statusBadge(a) {
    const sid = (a.screening && a.screening.status) || "not-started";
    const meta = window.SCREENING_STATUSES.find(x => x.id === sid);
    return { label: meta ? meta.label : sid, cls: "status-pill " + (meta?.cls || "stage-new") };
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <button className="btn ghost sm" onClick={backToList} style={{ marginBottom: 10 }}>← Back to screening</button>
          <div className="cluster">
            <h1 className="page-title" style={{ fontSize: 30, margin: 0 }}>{p.title}</h1>
            <span className="status-badge status-screening">Screening</span>
            {hasCriteria && <span className="status-badge tag-complete">{criteria.length} criteria defined</span>}
          </div>
          <div className="page-sub">{p.client ? p.client + " · " : ""}{p.location || "—"} · {p.employmentType} · pushed {screening.pushedAt ? new Date(screening.pushedAt).toLocaleDateString("en-PG", { day: "numeric", month: "short", year: "numeric" }) : "—"}</div>
        </div>
        <div className="cluster">
          <button className="btn accent" onClick={openCriteria}>
            <I.Plus /><span>{hasCriteria ? "Edit Criteria" : "Create Criteria"}</span>
          </button>
        </div>
      </div>

      <div className="ai-disclaimer" style={{ marginBottom: 16 }}>
        Two screening methods are available: <b>AI-assisted screening</b> (helps suggest scores) and <b>manual screening</b>. AI does not approve, reject, or shortlist candidates — final decisions stay with you.
      </div>

      {/* Progress stats */}
      <div className="grid cols-4" style={{ marginBottom: 14 }}>
        <SummaryStat2 label="Total applicants" value={stats.total} sub="in queue" />
        <SummaryStat2 label="Not started"      value={stats.notStarted} sub="awaiting review" />
        <SummaryStat2 label="In review"        value={stats.inReview} sub="screening underway" />
        <SummaryStat2 label="Average score"    value={stats.avg ? stats.avg + "%" : "—"} sub={stats.avg ? "across screened" : "no scores yet"} />
      </div>
      <div className="grid cols-3" style={{ marginBottom: 20 }}>
        <SummaryStat2 label="Screened"                value={stats.screened} sub="ready for next step" />
        <SummaryStat2 label="Recommended for shortlist" value={stats.recommended} sub="ready to push" />
        <SummaryStat2 label="Needs more info"         value={stats.needsInfo} sub="follow-up required" />
      </div>

      {!hasCriteria ? (
        <div className="card hint-box" style={{ padding: 28 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22, marginBottom: 6 }}>Set up your screening criteria first</div>
          <div style={{ color: "var(--muted)", marginBottom: 14 }}>
            Before scoring applicants, define the criteria you'll measure them against — work experience, qualifications, communication, etc. Each criterion becomes a row on the KPI scoring sheet.
          </div>
          <button className="btn accent" onClick={openCriteria}>
            <I.Plus /><span>Create Criteria</span>
          </button>
        </div>
      ) : (
        <div className="pos-grid">
          {/* Applicants table */}
      <div className="card flush">
            <div style={{ padding: "14px 18px 4px" }}>
              <div className="spread">
                <div className="card-title">Applicants <small>{ranked.length}</small></div>
                <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>order preserved from AI Filtration</div>
              </div>
            </div>
            <table className="pos-table">
              <thead>
                <tr>
                  <th className="screening-col-index">#</th><th className="screening-col-applicant">Applicant</th><th className="screening-col-contact">Contact</th>
                  <th>Position · Client · Location</th>
                  <th>Completeness</th>
                  <th>Screening</th>
                  <th style={{ textAlign: "right" }}>Score</th>
                  <th style={{ width: 1 }}></th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((a, i) => {
                  const b = statusBadge(a);
                  const c = window.applicantCompleteness(a, p);
                  const ctag = window.COMPLETENESS_TAGS[c.tag];
                  const wt = weightedTotal(a);
                  const r = wt.max > 0 && wt.total > 0 ? rec(wt.pct) : null;
                  return (
                    <tr key={a.id} className="pos-row" onClick={() => openApplicant(a.id)}>
                      <td className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>#{i + 1}</td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{a.name || "—"}</div>
                        <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>applied {a.appliedAt ? new Date(a.appliedAt).toLocaleDateString("en-PG", { day: "numeric", month: "short", year: "numeric" }) : "—"}</div>
                      </td>
                      <td>
                        <div style={{ fontSize: 12 }}>{a.email || <em style={{ color: "var(--muted)" }}>no email</em>}</div>
                        <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{a.phone || "—"}</div>
                      </td>
                      <td>
                        <div style={{ fontSize: 12 }}>{p.title}</div>
                        <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{p.client || "—"} · {p.location || "—"}</div>
                      </td>
                      <td>
                        <div className="cluster" style={{ gap: 6 }}>
                          <span className="num" style={{ fontSize: 12 }}>{c.pct}%</span>
                          <span className={"tag-pill " + ctag.cls}>{ctag.label}</span>
                        </div>
                      </td>
                      <td><span className={b.cls}>{b.label}</span></td>
                      <td style={{ textAlign: "right" }}>
                        {wt.total > 0 ? (
                          <div>
                            <div className="num" style={{ fontSize: 13, fontWeight: 500 }}>{wt.total}/{wt.max}</div>
                            <div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{wt.pct}%</div>
                            {r && <div className={"rec-pill " + r.cls} style={{ marginTop: 4 }}>{r.label}</div>}
                          </div>
                        ) : <span style={{ color: "var(--muted)", fontSize: 12 }}>—</span>}
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <button className="btn accent sm" onClick={() => openApplicant(a.id)}>Screen Applicant</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Criteria summary panel */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 10 }}>Screening criteria <small>{criteria.length}</small></div>
            <div className="stack" style={{ gap: 8 }}>
              {criteria.map(c => (
                <div key={c.id} className="crit-row-mini">
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{c.name}</div>
                    {c.description && <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{c.description}</div>}
                  </div>
                  <div className="cluster" style={{ gap: 6 }}>
                    {c.required && <span className="tag-pill tag-needs-review">required</span>}
                    <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>max {c.maxPoints} · wt {c.weight}</span>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn ghost sm" onClick={openCriteria} style={{ marginTop: 12 }}>Edit criteria</button>
          </div>
        </div>
      )}
    </div>
  );
}

function calculatePositionScore(a, criteria) {
  let total = 0; let max = 0; let scored = 0;
  criteria.forEach(c => {
    const raw = (a.screening && a.screening.scores || {})[c.id]?.score;
    max += c.maxPoints * c.weight;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      total += raw * c.weight;
      scored += 1;
    }
  });
  return { total, max, pct: max ? Math.round((total / max) * 1000) / 10 : 0, complete: criteria.length > 0 && scored === criteria.length, scoredCount: scored };
}

function buildScreeningWorkspaceFromProps(position, applicants) {
  const screening = position.screening || {};
  const criteria = screening.criteria || [];
  const tieBreakerCriteria = screening.tieBreakerCriteria || [];
  const activeStatuses = new Set(["screening", "screened", "shortlist_eligible", "applied", "new"]);
  const pool = applicants.filter(a => String(a.positionId) === String(position.id) && activeStatuses.has((a.status || "").toLowerCase()));
  const order = screening.rankings || [];
  const ordered = order.length
    ? order.map(id => pool.find(a => a.id === id)).filter(Boolean).concat(pool.filter(a => !order.includes(a.id)))
    : pool;
  const items = ordered.map((a) => {
    const metrics = calculatePositionScore(a, criteria);
    const screeningScore = Number.isFinite(Number(a.screening?.screeningScore)) ? Number(a.screening.screeningScore) : metrics.pct;
    const tieBreakerPoints = Number(a.screening?.tieBreakerPoints || 0);
    const finalScore = Number.isFinite(Number(a.screening?.finalScore)) ? Number(a.screening.finalScore) : Math.round((screeningScore + tieBreakerPoints) * 100) / 100;
    return {
      ...a,
      screening: {
        ...(a.screening || {}),
        screeningScore,
        tieBreakerCriteriaId: a.screening?.tieBreakerCriteriaId || "",
        tieBreakerPoints,
        finalScore,
        tieBreakerReviewed: Boolean(a.screening?.tieBreakerReviewed),
        completeness: { complete: metrics.complete, scoredCount: metrics.scoredCount, criteriaCount: criteria.length }
      }
    };
  });
  const scoreGroups = items.reduce((acc, item) => {
    if (!Number.isFinite(Number(item.screening?.screeningScore))) return acc;
    const key = Number(item.screening.screeningScore).toFixed(1);
    acc[key] = acc[key] || [];
    acc[key].push(item.id);
    return acc;
  }, {});
  const tieGroups = Object.entries(scoreGroups)
    .filter(([, ids]) => ids.length > 1)
    .map(([score, ids]) => ({ id: `tie-${score.replace(".", "-")}`, screeningScore: Number(score), scoreRange: 0, reason: "exact", applicationIds: ids, reviewed: ids.every(id => Boolean(items.find(item => item.id === id)?.screening?.tieBreakerReviewed)) }));
  const nearTieGroups = [];
  const sortedByScore = [...items].sort((left, right) => Number(right.screening?.screeningScore || 0) - Number(left.screening?.screeningScore || 0));
  for (let index = 0; index < sortedByScore.length - 1; index += 1) {
    const current = sortedByScore[index];
    const next = sortedByScore[index + 1];
    const delta = Math.round(Math.abs(Number(current.screening?.screeningScore || 0) - Number(next.screening?.screeningScore || 0)) * 100) / 100;
    if (delta === 0 || delta > 0.5) continue;
    const ids = [current.id, next.id];
    if (tieGroups.some(group => group.applicationIds.every(id => ids.includes(id)))) continue;
    if (nearTieGroups.some(group => group.applicationIds.every(id => ids.includes(id)))) continue;
    nearTieGroups.push({ id: `near-${ids.join("-")}`, screeningScore: Number(current.screening?.screeningScore || 0), scoreRange: delta, reason: "near", applicationIds: ids, reviewed: ids.every(id => Boolean(items.find(item => item.id === id)?.screening?.tieBreakerReviewed)) });
  }
  const candidateGroups = [...tieGroups, ...nearTieGroups];
  return {
    position,
    screening: { ...screening, lastSortDirection: screening.lastSortDirection || "asc", tieBreakerCriteria },
    applicants: items.map((item) => ({ ...item, screening: { ...(item.screening || {}), isTie: candidateGroups.some(group => group.applicationIds.includes(item.id)), tieGroupId: candidateGroups.find(group => group.applicationIds.includes(item.id))?.id || "", tieStatus: candidateGroups.find(group => group.applicationIds.includes(item.id))?.reason || "" } })),
    tieGroups,
    nearTieGroups,
    tieBreakerCriteria,
    activeTieBreakerCriteria: tieBreakerCriteria[0] || null,
    unresolvedTieGroups: candidateGroups.filter(group => !group.reviewed),
    summary: {
      hasTiedScores: tieGroups.length > 0,
      hasNearTies: nearTieGroups.length > 0,
      tieBreakerAvailable: Boolean(screening.lastSortedAt && candidateGroups.length > 0)
    }
  };
}

function defaultShortlistSelection(workspace, count) {
  const preferred = (workspace?.applicants || []).filter(item => item.screening?.shortlistDecision === "shortlisted").map(item => item.id);
  if (preferred.length) return preferred;
  return [...(workspace?.applicants || [])]
    .filter(item => item.screening?.completeness?.complete)
    .sort((left, right) => Number(right.screening?.finalScore || 0) - Number(left.screening?.finalScore || 0))
    .slice(0, Math.max(Number(count) || 0, 0))
    .map(item => item.id);
}

function AdvancedScreeningPosition({ p, applicants, backToList, openCriteria, openApplicant, flash, onReloadDashboard }) {
  const initialCount = Math.max(Number(p.numHires) || 1, 1);
  const [workspace, setWorkspace] = React.useState(() => buildScreeningWorkspaceFromProps(p, applicants));
  const [loadingWorkspace, setLoadingWorkspace] = React.useState(false);
  const [sortBusy, setSortBusy] = React.useState(false);
  const [pushBusy, setPushBusy] = React.useState(false);
  const [tieDrafts, setTieDrafts] = React.useState({});
  const [tieEditorOpen, setTieEditorOpen] = React.useState(false);
  const [tieApplyBusy, setTieApplyBusy] = React.useState(false);
  const [tieCriteriaBusy, setTieCriteriaBusy] = React.useState(false);
  const [selectedTieCriteriaId, setSelectedTieCriteriaId] = React.useState("");
  const [tieCriteriaDraft, setTieCriteriaDraft] = React.useState({ name: "", description: "", maxPoints: "1.0" });
  const [sortDirection, setSortDirection] = React.useState((p.screening && p.screening.lastSortDirection) || "asc");
  const [shortlistCount, setShortlistCount] = React.useState(initialCount);
  const [selectedIds, setSelectedIds] = React.useState(() => defaultShortlistSelection(buildScreeningWorkspaceFromProps(p, applicants), initialCount));
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [nonShortlistedAction, setNonShortlistedAction] = React.useState("talent_pool");
  const [panelError, setPanelError] = React.useState("");

  React.useEffect(() => {
    setWorkspace(buildScreeningWorkspaceFromProps(p, applicants));
  }, [p, applicants]);

  React.useEffect(() => {
    let cancelled = false;
    setLoadingWorkspace(true);
    window.HEYA_API.getScreenings(p.id)
      .then((response) => {
        if (cancelled) return;
        if (response?.position) {
          setWorkspace(response);
          setSortDirection(response?.screening?.lastSortDirection || "asc");
          setSelectedIds((current) => {
            const filtered = current.filter((id) => response.applicants.some((item) => item.id === id));
            return filtered.length ? filtered : defaultShortlistSelection(response, shortlistCount);
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingWorkspace(false);
      });
    return () => { cancelled = true; };
  }, [p.id, shortlistCount]);

  const screening = workspace?.screening || {};
  const criteria = screening.criteria || [];
  const rows = workspace?.applicants || [];
  const tieBreakerCriteria = workspace?.tieBreakerCriteria || screening.tieBreakerCriteria || [];
  const tieBreakerCandidates = rows.filter(item => item.screening?.isTie);
  const tieBreakerAvailable = Boolean(screening.lastSortedAt && tieBreakerCandidates.length);
  const hasCriteria = criteria.length > 0;
  const incompleteCount = rows.filter(item => !item.screening?.completeness?.complete).length;
  const unresolvedTieCount = (workspace?.unresolvedTieGroups || []).length;
  const shortlistedApplicants = rows.filter(item => selectedIds.includes(item.id));
  const nonShortlistedApplicants = rows.filter(item => !selectedIds.includes(item.id));
  const averageScore = rows.length ? Math.round((rows.reduce((sum, item) => sum + Number(item.screening?.screeningScore || 0), 0) / rows.length) * 10) / 10 : 0;
  const canPush = Boolean(screening.lastSortedAt && !screening.rankingNeedsRefresh && rows.length && selectedIds.length && incompleteCount === 0 && unresolvedTieCount === 0 && nonShortlistedAction);

  React.useEffect(() => {
    setSelectedIds((current) => {
      const filtered = current.filter((id) => rows.some((item) => item.id === id));
      return filtered.length ? filtered : defaultShortlistSelection(workspace, shortlistCount);
    });
  }, [rows, workspace, shortlistCount]);

  React.useEffect(() => {
    if (selectedTieCriteriaId || !tieBreakerCriteria.length) return;
    const currentCriteria = workspace?.activeTieBreakerCriteria || tieBreakerCriteria[0] || null;
    if (!currentCriteria) return;
    setSelectedTieCriteriaId(currentCriteria.id);
  }, [workspace?.activeTieBreakerCriteria, tieBreakerCriteria, selectedTieCriteriaId]);

  React.useEffect(() => {
    if (!selectedTieCriteriaId) return;
    const currentCriteria = tieBreakerCriteria.find(item => item.id === selectedTieCriteriaId) || null;
    if (!currentCriteria) return;
    setTieCriteriaDraft({
      name: currentCriteria.name || "",
      description: currentCriteria.description || "",
      maxPoints: String(currentCriteria.maxPoints ?? "1.0")
    });
  }, [selectedTieCriteriaId, tieBreakerCriteria]);

  function rowStatusBadge(a) {
    const sid = (a.screening && a.screening.status) || "not-started";
    const meta = window.SCREENING_STATUSES.find(x => x.id === sid);
    return { label: meta ? meta.label : sid, cls: "status-pill " + (meta?.cls || "stage-new") };
  }

  function toggleSelection(applicationId) {
    setSelectedIds((current) => current.includes(applicationId) ? current.filter((id) => id !== applicationId) : [...current, applicationId]);
  }

  function autoSelectTopApplicants() {
    setSelectedIds(
      [...rows]
        .filter(item => item.screening?.completeness?.complete)
        .sort((left, right) => Number(right.screening?.finalScore || 0) - Number(left.screening?.finalScore || 0))
        .slice(0, Math.max(Number(shortlistCount) || 0, 0))
        .map(item => item.id)
    );
  }

  async function handleSort() {
    setSortBusy(true);
    setPanelError("");
    try {
      const result = await window.HEYA_API.sortScreenings({ positionId: p.id, direction: sortDirection });
      setWorkspace(result);
      setSelectedIds(defaultShortlistSelection(result, shortlistCount));
      flash({ tone: "success", message: `Applicants sorted ${sortDirection === "desc" ? "highest-to-lowest" : "lowest-to-highest"}.` });
    } catch (error) {
      setPanelError(error.message || "Unable to sort applicants right now.");
      flash({ tone: "error", message: error.message || "Unable to sort applicants right now." });
    } finally {
      setSortBusy(false);
    }
  }

  async function saveTieBreakerCriteria() {
    setTieCriteriaBusy(true);
    setPanelError("");
    try {
      if (!screening.lastSortedAt) {
        throw new Error("Sort applicants by screening score before creating a tie-breaker.");
      }
      const payload = {
        positionId: p.id,
        name: tieCriteriaDraft.name,
        description: tieCriteriaDraft.description,
        maxPoints: tieCriteriaDraft.maxPoints,
        screeningRunId: screening.id || p.id
      };
      const response = selectedTieCriteriaId
        ? await window.HEYA_API.updateScreeningTieBreakerCriteria(selectedTieCriteriaId, payload)
        : await window.HEYA_API.createScreeningTieBreaker(payload);
      const criteriaId = response?.criteria?.id || selectedTieCriteriaId;
      const refresh = await window.HEYA_API.getScreenings(p.id);
      setWorkspace(refresh);
      setSelectedTieCriteriaId(criteriaId || "");
      flash({ tone: "success", message: selectedTieCriteriaId ? "Tie-breaker criteria updated." : "Tie-breaker criteria created." });
    } catch (error) {
      setPanelError(error.message || "Unable to save tie-breaker criteria.");
      flash({ tone: "error", message: error.message || "Unable to save tie-breaker criteria." });
    } finally {
      setTieCriteriaBusy(false);
    }
  }

  async function applyTieBreaker() {
    setTieApplyBusy(true);
    setPanelError("");
    try {
      if (!screening.lastSortedAt) {
        throw new Error("Sort applicants by screening score before applying a tie-breaker.");
      }
      if (!selectedTieCriteriaId) {
        throw new Error("Create or select a tie-breaker criteria first.");
      }
      const result = await window.HEYA_API.sortScreeningsWithTieBreaker({
        positionId: p.id,
        direction: sortDirection,
        tieBreakerCriteriaId: selectedTieCriteriaId,
        tieBreakers: tieBreakerCandidates.map(item => ({
          applicationId: item.id,
          tieBreakerCriteriaId: selectedTieCriteriaId,
          tieBreakerPoints: tieDrafts[item.id] ?? item.screening?.tieBreakerPoints ?? 0
        }))
      });
      setWorkspace(result);
      setSelectedIds(defaultShortlistSelection(result, shortlistCount));
      setTieEditorOpen(false);
      flash({ tone: "success", message: "Tie-breaker applied and applicants re-sorted by final score." });
    } catch (error) {
      setPanelError(error.message || "Unable to apply the tie-breaker right now.");
      flash({ tone: "error", message: error.message || "Unable to apply the tie-breaker right now." });
    } finally {
      setTieApplyBusy(false);
    }
  }

  async function confirmPush() {
    setPushBusy(true);
    setPanelError("");
    try {
      const result = await window.HEYA_API.pushScreeningsToShortlist({
        positionId: p.id,
        shortlistedApplicationIds: selectedIds,
        nonShortlistedAction,
        tieBreakers: rows.filter(item => item.screening?.isTie).map(item => ({ applicationId: item.id, tieBreakerPoints: tieDrafts[item.id] ?? item.screening?.tieBreakerPoints ?? 0 }))
      });
      setConfirmOpen(false);
      setWorkspace(result.workspace || workspace);
      if (onReloadDashboard) await onReloadDashboard();
      flash({ tone: "success", message: result.message || "Shortlist updated successfully." });
    } catch (error) {
      setPanelError(error.message || "Shortlist update failed. Please check unresolved scores or try again.");
      flash({ tone: "error", message: error.message || "Shortlist update failed. Please check unresolved scores or try again." });
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <button className="btn ghost sm" onClick={backToList} style={{ marginBottom: 10 }}>Back to screening</button>
          <div className="cluster">
            <h1 className="page-title" style={{ fontSize: 30, margin: 0 }}>{p.title}</h1>
            <span className="status-badge status-screening">Screening</span>
            {hasCriteria && <span className="status-badge tag-complete">{criteria.length} criteria defined</span>}
            {screening.lastSortedAt && <span className="status-badge status-ready">Sorted</span>}
          </div>
          <div className="page-sub">{p.client ? p.client + " · " : ""}{p.location || "—"} · {p.employmentType} · pushed {screening.pushedAt ? new Date(screening.pushedAt).toLocaleDateString("en-PG", { day: "numeric", month: "short", year: "numeric" }) : "—"}</div>
        </div>
        <div className="cluster">
          <button className="btn accent" onClick={openCriteria}>
            <I.Plus /><span>{hasCriteria ? "Edit Criteria" : "Create Criteria"}</span>
          </button>
        </div>
      </div>

      <div className="ai-disclaimer" style={{ marginBottom: 16 }}>
        Manual scoring stays per applicant, and this shortlist workspace helps the hiring team sort by score, resolve tie scores, and confirm who moves forward.
      </div>

      <div className="grid cols-5" style={{ marginBottom: 14 }}>
        <SummaryStat2 label="Applicants" value={rows.length} sub="active in screening" />
        <SummaryStat2 label="Incomplete scores" value={incompleteCount} sub="must be scored first" />
        <SummaryStat2 label="Tie groups" value={workspace?.tieGroups?.length || 0} sub="same screening score" />
        <SummaryStat2 label="Near ties" value={workspace?.nearTieGroups?.length || 0} sub="within 0.5 points" />
        <SummaryStat2 label="Average score" value={averageScore ? `${averageScore}%` : "—"} sub={averageScore ? "screening score" : "no scores yet"} />
      </div>

      {!hasCriteria ? (
        <div className="card hint-box" style={{ padding: 28 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22, marginBottom: 6 }}>Set up your screening criteria first</div>
          <div style={{ color: "var(--muted)", marginBottom: 14 }}>
            Before sorting or shortlisting, define the criteria you'll use to score each applicant fairly.
          </div>
          <button className="btn accent" onClick={openCriteria}>
            <I.Plus /><span>Create Criteria</span>
          </button>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="spread" style={{ gap: 12, flexWrap: "wrap" }}>
              <div>
                <div className="card-title">Sort and shortlist workflow</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                  {loadingWorkspace ? "Loading screening workspace..." : screening.lastSortedAt ? `Last sorted ${new Date(screening.lastSortedAt).toLocaleString("en-PG")}` : "Applicants have not been sorted yet."}
                </div>
              </div>
              <div className="cluster" style={{ gap: 8, flexWrap: "wrap" }}>
                <select className="ifield" style={{ width: 190 }} value={sortDirection} onChange={(e) => setSortDirection(e.target.value)} disabled={sortBusy || pushBusy}>
                  <option value="asc">Lowest to highest</option>
                  <option value="desc">Highest to lowest</option>
                </select>
                <button className="btn accent" onClick={handleSort} disabled={sortBusy || pushBusy || rows.length === 0}>
                  <span>{sortBusy ? "Sorting applicants by score..." : "Sort Applicants by Score"}</span>
                </button>
                <button className="btn ghost" onClick={() => setTieEditorOpen((current) => !current)} disabled={!tieBreakerAvailable || sortBusy || pushBusy || tieApplyBusy}>
                  <span>{tieEditorOpen ? "Hide Tie Breaker" : "Tie Breaker"}</span>
                </button>
                <input className="ifield" type="number" min="1" value={shortlistCount} onChange={(e) => setShortlistCount(Math.max(Number(e.target.value) || 1, 1))} style={{ width: 90 }} />
                <button className="btn ghost" onClick={autoSelectTopApplicants} disabled={!rows.length || pushBusy}>Select top N</button>
                <button className="btn" onClick={() => setConfirmOpen(true)} disabled={!canPush || pushBusy}>
                  <I.Send /><span>{pushBusy ? "Preparing shortlist..." : "Push to Shortlist"}</span>
                </button>
              </div>
            </div>
            {(sortBusy || panelError || unresolvedTieCount > 0 || incompleteCount > 0 || screening.rankingNeedsRefresh || (screening.lastSortedAt && !tieBreakerAvailable)) && (
              <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                {sortBusy && <div className="ai-disclaimer"><span className="spinner" style={{ marginRight: 8, display: "inline-block" }} />Sorting applicants by score...</div>}
                {incompleteCount > 0 && <div className="ai-disclaimer">Applicants with incomplete scores cannot be pushed to shortlist yet.</div>}
                {unresolvedTieCount > 0 && <div className="ai-disclaimer">Tie scores still need human review or tie-breaker confirmation before shortlisting.</div>}
                {screening.rankingNeedsRefresh && <div className="ai-disclaimer">Scores changed after ranking. Re-sort applicants before pushing to shortlist.</div>}
                {screening.lastSortedAt && !tieBreakerAvailable && <div className="ai-disclaimer">No tied or near-tied applicants were found, so the tie-breaker remains disabled.</div>}
                {panelError && <div className="ai-disclaimer" style={{ color: "var(--danger)" }}>{panelError}</div>}
              </div>
            )}
          </div>

          {tieEditorOpen && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="spread" style={{ gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                <div>
                  <div className="card-title">Tie Breaker</div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                    Create or select one tie-breaker criteria, assign scores from 0.0 to 1.0, then re-sort by final score.
                  </div>
                </div>
                <button className="btn accent" onClick={applyTieBreaker} disabled={!tieBreakerAvailable || tieApplyBusy || pushBusy || !selectedTieCriteriaId}>
                  <span>{tieApplyBusy ? "Applying tie-breaker..." : "Apply and Re-sort"}</span>
                </button>
              </div>
              <div className="grid cols-2" style={{ gap: 16, alignItems: "start" }}>
                <div className="card" style={{ padding: 16 }}>
                  <div className="card-title" style={{ marginBottom: 10 }}>Tie-breaker criteria</div>
                  <label style={{ display: "block", marginBottom: 10 }}>
                    <div className="mono eyebrow" style={{ marginBottom: 6 }}>Saved criteria</div>
                    <select className="ifield" value={selectedTieCriteriaId || "__new__"} onChange={(e) => {
                      if (e.target.value === "__new__") {
                        setSelectedTieCriteriaId("");
                        setTieCriteriaDraft({ name: "", description: "", maxPoints: "1.0" });
                        return;
                      }
                      setSelectedTieCriteriaId(e.target.value);
                    }}>
                      <option value="__new__">Create new tie-breaker criteria</option>
                      {tieBreakerCriteria.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: "block", marginBottom: 10 }}>
                    <div className="mono eyebrow" style={{ marginBottom: 6 }}>Criteria name</div>
                    <input className="ifield" value={tieCriteriaDraft.name} onChange={(e) => setTieCriteriaDraft((current) => ({ ...current, name: e.target.value }))} placeholder="Leadership Experience" />
                  </label>
                  <label style={{ display: "block", marginBottom: 10 }}>
                    <div className="mono eyebrow" style={{ marginBottom: 6 }}>Description</div>
                    <textarea className="ifield" rows="4" value={tieCriteriaDraft.description} onChange={(e) => setTieCriteriaDraft((current) => ({ ...current, description: e.target.value }))} placeholder="Extra scoring for experience that differentiates tied applicants." />
                  </label>
                  <label style={{ display: "block", marginBottom: 12 }}>
                    <div className="mono eyebrow" style={{ marginBottom: 6 }}>Max score (0.0 to 1.0)</div>
                    <input className="ifield" type="number" min="0" max="1" step="0.01" value={tieCriteriaDraft.maxPoints} onChange={(e) => setTieCriteriaDraft((current) => ({ ...current, maxPoints: e.target.value }))} />
                  </label>
                  <button className="btn ghost" onClick={saveTieBreakerCriteria} disabled={tieCriteriaBusy || pushBusy}>
                    <span>{tieCriteriaBusy ? "Saving criteria..." : (selectedTieCriteriaId ? "Update Criteria" : "Create Criteria")}</span>
                  </button>
                </div>
                <div className="card" style={{ padding: 16 }}>
                  <div className="card-title" style={{ marginBottom: 10 }}>Applicants requiring review</div>
                  <div className="stack" style={{ gap: 10 }}>
                    {tieBreakerCandidates.length === 0 && <div style={{ color: "var(--muted)" }}>No tied or near-tied applicants need a tie-breaker.</div>}
                    {tieBreakerCandidates.map((item) => (
                      <div key={item.id} style={{ border: "1px solid var(--line-2)", borderRadius: 12, padding: 12 }}>
                        <div className="spread" style={{ gap: 12, alignItems: "start" }}>
                          <div>
                            <div style={{ fontWeight: 600 }}>{item.name || "Unnamed applicant"}</div>
                            <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                              Score {Number(item.screening?.screeningScore || 0).toFixed(1)} · {item.screening?.tieStatus === "near" ? "Near tie" : "Tie"} · Final {Number(item.screening?.finalScore || 0).toFixed(2)}
                            </div>
                          </div>
                          <input className="ifield" type="number" min="0" max="1" step="0.01" value={tieDrafts[item.id] ?? item.screening?.tieBreakerPoints ?? 0} onChange={(e) => setTieDrafts((current) => ({ ...current, [item.id]: e.target.value }))} style={{ width: 100 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="card flush" style={{ overflowX: "auto" }}>
            <table className="pos-table">
              <thead>
                <tr>
                  <th>Decision</th>
                  <th>Applicant</th>
                  <th>Position</th>
                  <th>Screening Score</th>
                  <th>Tie-breaker</th>
                  <th>Final Score</th>
                  <th>Tie Status</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan="9" style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>No applicants available in this screening queue.</td></tr>}
                {rows.map((a, index) => {
                  const status = rowStatusBadge(a);
                  const incomplete = !a.screening?.completeness?.complete;
                  return (
                    <tr key={a.id} className={a.screening?.isTie ? "screening-tie-row" : ""}>
                      <td>
                        <label className="cluster" style={{ gap: 8 }}>
                          <input type="checkbox" checked={selectedIds.includes(a.id)} onChange={() => toggleSelection(a.id)} disabled={incomplete || pushBusy} />
                          <span className={selectedIds.includes(a.id) ? "tag-pill tag-complete" : "mono"} style={{ fontSize: 11 }}>{selectedIds.includes(a.id) ? "Shortlist" : "Hold"}</span>
                        </label>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{index + 1}. {a.name || "—"}</div>
                        <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{a.email || "no email"} · {a.phone || "—"}</div>
                      </td>
                      <td>
                        <div style={{ fontSize: 12 }}>{p.title}</div>
                        <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{p.client || "—"} · {p.location || "—"}</div>
                      </td>
                      <td>{Number.isFinite(Number(a.screening?.screeningScore)) ? <div className="num" style={{ fontSize: 13 }}>{a.screening.screeningScore}</div> : <span className="tag-pill tag-needs-review">Incomplete</span>}</td>
                      <td>
                        {a.screening?.isTie ? (
                          <div className="cluster" style={{ gap: 6, flexWrap: "wrap" }}>
                            <div className="num" style={{ fontSize: 13 }}>{Number(a.screening?.tieBreakerPoints || 0).toFixed(2)}</div>
                          </div>
                        ) : <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>—</span>}
                      </td>
                      <td><div className="num" style={{ fontSize: 13 }}>{Number(a.screening?.finalScore || 0).toFixed(2)}</div></td>
                      <td>{a.screening?.isTie ? <div className="stack" style={{ gap: 6 }}><span className="tag-pill tag-needs-review">{a.screening?.tieStatus === "near" ? "Near tie" : "Tie score"}</span><span className={a.screening?.tieBreakerReviewed ? "tag-pill tag-complete" : "tag-pill tag-needs-review"}>{a.screening?.tieBreakerReviewed ? "Reviewed" : "Needs review"}</span></div> : <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>Clear</span>}</td>
                      <td>{incomplete ? <span className="tag-pill tag-needs-review">Incomplete</span> : <span className={status.cls}>{status.label}</span>}</td>
                      <td><button className="btn accent sm" onClick={() => openApplicant(a.id)}>Screen Applicant</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {confirmOpen && <ScreeningShortlistConfirmModal position={p} shortlistedApplicants={shortlistedApplicants} nonShortlistedApplicants={nonShortlistedApplicants} nonShortlistedAction={nonShortlistedAction} setNonShortlistedAction={setNonShortlistedAction} onCancel={() => setConfirmOpen(false)} onConfirm={confirmPush} confirmDisabled={!canPush || pushBusy} pushBusy={pushBusy} unresolvedTieCount={unresolvedTieCount} />}
    </div>
  );
}

function ScreeningShortlistConfirmModal({ position, shortlistedApplicants, nonShortlistedApplicants, nonShortlistedAction, setNonShortlistedAction, onCancel, onConfirm, confirmDisabled, pushBusy, unresolvedTieCount }) {
  return (
    <div className="publish-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget && !pushBusy) onCancel(); }}>
      <div className="edit-modal" style={{ maxWidth: 980 }}>
        <div className="edit-modal-head">
          <div>
            <div className="mono eyebrow">Confirm Shortlist Action</div>
            <div className="edit-modal-title">Confirm Shortlist Action</div>
            <div className="page-sub" style={{ marginTop: 6 }}>{position.title} · {position.client || "Confidential client"}</div>
          </div>
          <button className="btn ghost sm" onClick={onCancel} disabled={pushBusy}>Close</button>
        </div>
        <div className="edit-modal-body">
          <div className="ai-disclaimer" style={{ marginBottom: 16 }}>
            You are about to push the selected top candidates to Shortlist. The remaining applicants can be moved to Talent Pool, marked as Not Shortlisted, or removed according to your selected action.
          </div>
          {unresolvedTieCount > 0 && <div className="ai-disclaimer" style={{ color: "var(--danger)", marginBottom: 16 }}>Resolve all tie scores before confirming this action.</div>}
          <div className="grid cols-2" style={{ gap: 16 }}>
            <div className="card" style={{ padding: 16 }}>
              <div className="card-title" style={{ marginBottom: 10 }}>Applicants to be shortlisted</div>
              <div className="stack" style={{ gap: 10 }}>
                {shortlistedApplicants.length === 0 && <div style={{ color: "var(--muted)" }}>No applicants selected yet.</div>}
                {shortlistedApplicants.map((applicant) => (
                  <div key={applicant.id} style={{ border: "1px solid var(--line-2)", borderRadius: 12, padding: 12 }}>
                    <div style={{ fontWeight: 600 }}>{applicant.name}</div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                      Score {Number(applicant.screening?.screeningScore || 0).toFixed(1)}
                      {applicant.screening?.isTie ? ` · Tie-breaker ${Number(applicant.screening?.tieBreakerPoints || 0).toFixed(2)}` : ""}
                      {` · Final ${Number(applicant.screening?.finalScore || 0).toFixed(2)}`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div className="card-title" style={{ marginBottom: 10 }}>Applicants not shortlisted</div>
              <label style={{ display: "block", marginBottom: 12 }}>
                <div className="mono eyebrow" style={{ marginBottom: 6 }}>Non-shortlisted action</div>
                <select className="ifield" value={nonShortlistedAction} onChange={(e) => setNonShortlistedAction(e.target.value)} disabled={pushBusy}>
                  <option value="talent_pool">Move to Talent Pool</option>
                  <option value="not_shortlisted">Mark as Not Shortlisted</option>
                  <option value="rejected">Mark as Rejected</option>
                  <option value="deleted">Soft delete / remove from active records</option>
                </select>
              </label>
              <div className="stack" style={{ gap: 10 }}>
                {nonShortlistedApplicants.length === 0 && <div style={{ color: "var(--muted)" }}>No remaining applicants.</div>}
                {nonShortlistedApplicants.map((applicant) => (
                  <div key={applicant.id} style={{ border: "1px solid var(--line-2)", borderRadius: 12, padding: 12 }}>
                    <div style={{ fontWeight: 600 }}>{applicant.name}</div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                      Score {Number(applicant.screening?.screeningScore || 0).toFixed(1)}
                      {applicant.screening?.isTie ? ` · Tie-breaker ${Number(applicant.screening?.tieBreakerPoints || 0).toFixed(2)}` : ""}
                      {` · Final ${Number(applicant.screening?.finalScore || 0).toFixed(2)}`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {nonShortlistedAction === "deleted" && <div className="ai-disclaimer" style={{ marginTop: 16, color: "var(--danger)" }}>Delete is treated as a soft-delete style status update here so applicants are removed from the active workflow without silent permanent deletion.</div>}
        </div>
        <div className="edit-modal-foot">
          <button className="btn ghost" onClick={onCancel} disabled={pushBusy}>Cancel</button>
          <button className="btn accent" onClick={onConfirm} disabled={confirmDisabled}>{pushBusy ? "Preparing shortlist..." : "Confirm Push to Shortlist"}</button>
        </div>
      </div>
    </div>
  );
}

// ============ CRITERIA builder ============
function CriteriaBuilder({ p, setPositions, onDone, flash, onSaveKpiCriteria }) {
  const existing = (p.screening && p.screening.criteria) || [];
  const [criteria, setCriteria] = React.useState(
    existing.length > 0 ? existing : window.DEFAULT_CRITERIA.slice(0, 4).map(c => ({ ...c }))
  );
  const [confirmReset, setConfirmReset] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const hasExistingCriteria = existing.length > 0;

  function update(i, k, v)   { setCriteria(arr => arr.map((c, idx) => idx === i ? { ...c, [k]: v } : c)); }
  function add()             { setCriteria(arr => [...arr, { id: "crit-" + Date.now().toString(36) + "-" + arr.length, name: "", description: "", maxPoints: 10, weight: 1, required: false, notes: "" }]); }
  function remove(i)         { setCriteria(arr => arr.filter((_, idx) => idx !== i)); }
  function preset(c)         { setCriteria(arr => [...arr, { ...c, id: c.id + "-" + Date.now().toString(36) }]); }
  function reset()           { setCriteria([]); setConfirmReset(false); flash("Criteria reset — add new criteria or save empty to clear them"); }

  async function save() {
    const cleaned = criteria.filter(c => c.name.trim());
    setSaving(true);
    try {
      if (onSaveKpiCriteria) {
        await onSaveKpiCriteria(p.id, { criteria: cleaned, rankings: p.screening?.rankings || [] });
      } else {
        setPositions(prev => prev.map(x => x.id === p.id ? {
          ...x,
          screening: { ...(x.screening || {}), criteria: cleaned }
        } : x));
      }
      flash(cleaned.length === 0 ? "Criteria cleared" : "Screening criteria saved");
      onDone();
    } catch (error) {
      flash(error.message || "Unable to save screening criteria right now.");
    } finally {
      setSaving(false);
    }
  }

  const usedNames = new Set(criteria.map(c => c.name));
  const presets = window.DEFAULT_CRITERIA.filter(d => !usedNames.has(d.name));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <button className="btn ghost sm" onClick={onDone} style={{ marginBottom: 10 }}>← Back to position</button>
          <h1 className="page-title" style={{ fontSize: 30, margin: 0 }}>Create screening criteria</h1>
          <div className="page-sub">Define what you'll evaluate each applicant against for <b>{p.title}</b>. Each criterion is a row on the KPI scoring sheet you'll use during screening.</div>
        </div>
        <div className="cluster">
          <button className="btn ghost" onClick={() => setConfirmReset(true)} disabled={criteria.length === 0 || saving}>Reset</button>
          <button className="btn" onClick={onDone} disabled={saving}>Cancel</button>
          <button className="btn accent" onClick={save} disabled={(criteria.filter(c => c.name.trim()).length === 0 && !hasExistingCriteria) || saving}>
            <I.Check /><span>Save Criteria</span>
          </button>
        </div>
      </div>

      <div className="ai-disclaimer" style={{ marginBottom: 16 }}>
        These criteria guide both manual and AI-assisted screening. AI-assisted screening only suggests scores against your criteria — it does not make hiring decisions.
      </div>

      <div className="stack" style={{ gap: 12, marginBottom: 16 }}>
        {criteria.length === 0 && (
          <div className="card hint-box" style={{ padding: 24, textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 20, marginBottom: 6 }}>No criteria yet</div>
            <div style={{ color: "var(--muted)", marginBottom: 14, fontSize: 13 }}>Add criteria below, or pick from the suggested set.</div>
            <button className="btn accent" onClick={add}><I.Plus /><span>Add first criterion</span></button>
          </div>
        )}
        {criteria.map((c, i) => (
          <div key={c.id} className="card crit-card">
            <div className="spread" style={{ marginBottom: 10 }}>
              <div className="card-title">Criterion #{i + 1}</div>
              <button className="btn ghost sm" onClick={() => remove(i)}>Delete</button>
            </div>
            <div className="form-grid">
              <Field2 label="Name*"><input className="ifield" value={c.name} onChange={e => update(i, "name", e.target.value)} placeholder="e.g. Relevant work experience" /></Field2>
              <Field2 label="Score range (max points)">
                <select className="ifield" value={c.maxPoints} onChange={e => update(i, "maxPoints", parseInt(e.target.value))}>
                  <option value="5">1 – 5</option>
                  <option value="10">1 – 10</option>
                  <option value="20">1 – 20</option>
                </select>
              </Field2>
              <Field2 label="Weight"><input className="ifield" type="number" min="1" max="5" value={c.weight} onChange={e => update(i, "weight", parseInt(e.target.value || "1"))} /></Field2>
              <Field2 label="Required / optional">
                <select className="ifield" value={c.required ? "yes" : "no"} onChange={e => update(i, "required", e.target.value === "yes")}>
                  <option value="yes">Required</option>
                  <option value="no">Optional</option>
                </select>
              </Field2>
            </div>
            <div style={{ marginTop: 12 }}>
              <Field2 label="Description"><input className="ifield" value={c.description} onChange={e => update(i, "description", e.target.value)} placeholder="What this measures" /></Field2>
            </div>
            <div style={{ marginTop: 12 }}>
              <Field2 label="Reviewer guidance / notes"><textarea className="ifield" rows="2" value={c.notes} onChange={e => update(i, "notes", e.target.value)} placeholder="What 'good' looks like, examples, etc." /></Field2>
            </div>
          </div>
        ))}
      </div>

      <div className="cluster" style={{ marginBottom: 18 }}>
        <button className="btn" onClick={add}><I.Plus /><span>Add another criterion</span></button>
      </div>

      {presets.length > 0 && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 10 }}>Suggested criteria</div>
          <div className="cluster" style={{ flexWrap: "wrap", gap: 8 }}>
            {presets.map(d => (
              <button key={d.id} className="chip-btn sm" onClick={() => preset(d)}>
                <I.Plus /><span>{d.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {confirmReset && (
        <ConfirmModal
          title="Reset all criteria?"
          body="This clears every criterion you've added. You can rebuild from scratch or pick from the suggested set. Saved criteria on the position aren't affected until you save."
          confirmLabel="Reset"
          onCancel={() => setConfirmReset(false)}
          onConfirm={reset}
        />
      )}
    </div>
  );
}

// ============ APPLICANT screening workspace ============
function ApplicantScreening({ p, a, applicants, setApplicants, backToPosition, flash, pushToShortlist, onSaveApplicantScreening }) {
  const criteria = (p.screening && p.screening.criteria) || [];
  const completeness = window.applicantCompleteness(a, p);
  const screening = a.screening || emptyScreeningState();

  const [confirmAI, setConfirmAI] = React.useState(false);
  const [aiRunning, setAiRunning] = React.useState(false);
  const [reportConfirm, setReportConfirm] = React.useState(null);
  const [saveBusy, setSaveBusy] = React.useState(false);
  const [pushBusy, setPushBusy] = React.useState(false);
  const [lastSavedSnapshot, setLastSavedSnapshot] = React.useState(() => screening.savedAt ? normalizeScreeningForSnapshot(screening) : "");

  React.useEffect(() => {
    setLastSavedSnapshot(screening.savedAt ? normalizeScreeningForSnapshot(screening) : "");
  }, [a.id]);

  function updateApplicant(patch) {
    setApplicants(prev => prev.map(x => x.id === a.id
      ? { ...x, screening: { ...(x.screening || emptyScreeningState()), ...patch } }
      : x));
  }
  function updateScore(critId, field, value) {
    setApplicants(prev => prev.map(x => {
      if (x.id !== a.id) return x;
      const cur = x.screening || emptyScreeningState();
      const scores = { ...(cur.scores || {}), [critId]: { ...(cur.scores?.[critId] || {}), [field]: value } };
      return { ...x, screening: { ...cur, scores, status: cur.status === "not-started" ? "in-review" : cur.status } };
    }));
  }
  function setStatus(s) { updateApplicant({ status: s }); }

  function runAI() { setConfirmAI(false); setAiRunning(true); }
  function onAIDone() {
    const ai = mockAIScreening(a, p, criteria);
    updateApplicant({ ai });
    setAiRunning(false);
    flash("AI-assisted scoring complete — review and edit");
  }
  function applyAIScore(critId) {
    if (!screening.ai) return;
    const sug = screening.ai.perCriterion[critId];
    if (sug) updateScore(critId, "score", sug.score);
  }
  function applyAllAI() {
    if (!screening.ai) return;
    setApplicants(prev => prev.map(x => {
      if (x.id !== a.id) return x;
      const cur = x.screening || emptyScreeningState();
      const scores = { ...(cur.scores || {}) };
      criteria.forEach(c => {
        const sug = screening.ai.perCriterion[c.id];
        if (sug) scores[c.id] = { ...(scores[c.id] || {}), score: sug.score, notes: (scores[c.id]?.notes || "") || sug.notes };
      });
      return { ...x, screening: { ...cur, scores, status: cur.status === "not-started" ? "in-review" : cur.status } };
    }));
    flash("AI scores applied — edit any you'd like to adjust");
  }

  function weightedTotal() {
    let total = 0; let max = 0; let raw = 0; let rawMax = 0;
    criteria.forEach(c => {
      const scoreValue = Number((screening.scores || {})[c.id]?.score);
      if (Number.isFinite(scoreValue)) { total += scoreValue * c.weight; raw += scoreValue; }
      max += c.maxPoints * c.weight;
      rawMax += c.maxPoints;
    });
    return { total, max, pct: max ? Math.round((total / max) * 100) : 0, raw, rawMax };
  }
  const wt = weightedTotal();

  function recommendationFromPct(pct) {
    if (pct >= 80) return { id: "strong-match",   label: "Strong match",          cls: "rec-strong" };
    if (pct >= 60) return { id: "potential-match",label: "Potential match",       cls: "rec-potential" };
    if (pct >= 40) return { id: "needs-review",   label: "Needs review",          cls: "rec-review" };
    return                  { id: "not-enough-info",label: "Not enough information", cls: "rec-low" };
  }
  const liveRec = wt.total > 0 ? recommendationFromPct(wt.pct) : null;

  function generateReport() {
    setReportConfirm(null);
    const r = mockReport(a, p, criteria, screening.scores || {}, screening.ai);
    updateApplicant({ report: { ...screening.report, content: r.content, recommendation: r.recommendation } });
    flash("Draft report generated — review and edit");
  }
  function polishReport() {
    setReportConfirm(null);
    updateApplicant({ report: { ...screening.report, content: mockPolish(screening.report.content || "") } });
    flash("Report polished");
  }
  function updateReport(k, v) { updateApplicant({ report: { ...(screening.report || {}), [k]: v } }); }

  const statusMeta = window.SCREENING_STATUSES.find(s => s.id === screening.status) || window.SCREENING_STATUSES[0];
  const snapshot = normalizeScreeningForSnapshot(screening);
  const hasSavedRecord = Boolean(screening.savedAt);
  const hasUnsavedChanges = hasSavedRecord ? snapshot !== lastSavedSnapshot : Boolean(
    Object.keys(screening.scores || {}).length
    || screening.report?.content
    || screening.report?.recommendation
    || screening.ai
  );
  const scoreBars = criteria.map(c => {
    const scoreValue = Number((screening.scores || {})[c.id]?.score);
    const pct = Number.isFinite(scoreValue) && c.maxPoints ? Math.round((scoreValue / c.maxPoints) * 100) : 0;
    return { id: c.id, label: c.name, score: Number.isFinite(scoreValue) ? scoreValue : null, max: c.maxPoints, pct };
  });
  const markCounts = Object.values(screening.scores || {}).reduce((acc, item) => {
    const key = item?.mark || "unmarked";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, { pass: 0, "needs-review": 0, fail: 0, unmarked: 0 });
  const nextSavedStatus = ["not-started", "in-review"].includes(screening.status) && (wt.total > 0 || screening.report?.content || screening.report?.recommendation)
    ? "screened"
    : screening.status;

  async function saveRecord() {
    if (!onSaveApplicantScreening) return;
    setSaveBusy(true);
    try {
      const updated = await onSaveApplicantScreening(a.id, {
        status: nextSavedStatus,
        scores: screening.scores || {},
        ai: screening.ai || null,
        report: screening.report || { content: "", recommendation: "" }
      });
      setLastSavedSnapshot(normalizeScreeningForSnapshot(updated?.screening || screening));
      flash("Screening record saved");
    } catch (error) {
      flash(error.message || "Unable to save screening record right now.");
    } finally {
      setSaveBusy(false);
    }
  }

  async function handlePushToShortlist() {
    setPushBusy(true);
    try {
      await pushToShortlist();
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <button className="btn ghost sm" onClick={backToPosition} style={{ marginBottom: 10 }}>← Back to {p.title}</button>
          <div className="cluster">
            <h1 className="page-title" style={{ fontSize: 30, margin: 0 }}>{a.name}</h1>
            <span className={"status-pill " + statusMeta.cls}>{statusMeta.label}</span>
            {liveRec && <span className={"rec-pill " + liveRec.cls}>{liveRec.label}</span>}
            {hasSavedRecord && <span className="tag-pill tag-complete">Saved {new Date(screening.savedAt).toLocaleString("en-PG")}</span>}
            {hasUnsavedChanges && <span className="tag-pill tag-needs-review">Unsaved changes</span>}
          </div>
          <div className="page-sub">{a.email || "no email"}{a.phone ? " · " + a.phone : ""} · applied {a.appliedAt ? new Date(a.appliedAt).toLocaleDateString("en-PG", { day: "numeric", month: "short", year: "numeric" }) : "—"} for <b>{p.title}</b> at <b>{p.client}</b></div>
        </div>
        <div className="cluster" style={{ alignItems: "stretch" }}>
          <select className="ifield" style={{ width: 220 }} value={screening.status} onChange={e => setStatus(e.target.value)} disabled={saveBusy || pushBusy}>
            {window.SCREENING_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button className="btn" onClick={saveRecord} disabled={saveBusy || pushBusy}>
            <I.Check /><span>{saveBusy ? "Saving..." : "Save Screening Record"}</span>
          </button>
          <button className="btn accent" disabled={!hasSavedRecord || hasUnsavedChanges || saveBusy || pushBusy} onClick={handlePushToShortlist}
            title={!hasSavedRecord ? "Save the screening record first" : hasUnsavedChanges ? "Save changes before pushing to shortlist" : "Push this applicant to Shortlist"}>
            <I.Send /><span>{pushBusy ? "Pushing..." : "Push to Shortlist"}</span>
          </button>
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 20 }}>
        <SummaryStat2 label="Raw score"        value={wt.raw + " / " + wt.rawMax} sub="sum of scores" />
        <SummaryStat2 label="Weighted score"   value={wt.total + " / " + wt.max} sub="includes weights" />
        <SummaryStat2 label="Percentage"       value={wt.pct + "%"} sub={liveRec ? liveRec.label : "score to see match"} />
        <SummaryStat2 label="Completeness"     value={completeness.pct + "%"} sub={window.COMPLETENESS_TAGS[completeness.tag].label} />
      </div>

      <div className="pos-grid">
        <div className="stack" style={{ gap: 16 }}>
          <div className="card">
            <div className="spread" style={{ marginBottom: 12, alignItems: "flex-start" }}>
              <div>
                <div className="card-title">Saved screening summary</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                  {hasSavedRecord ? `Last saved ${new Date(screening.savedAt).toLocaleString("en-PG")}` : "Save this KPI and criteria record to keep the applicant out of the shortlist until you decide later."}
                </div>
              </div>
              <span className={"rec-pill " + (liveRec?.cls || "rec-review")}>{liveRec?.label || "Awaiting score"}</span>
            </div>
            <div className="stack" style={{ gap: 10 }}>
              {scoreBars.map(item => (
                <div key={item.id}>
                  <div className="spread" style={{ marginBottom: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{item.label}</div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{item.score === null ? "â€”" : `${item.score} / ${item.max}`}</div>
                  </div>
                  <div style={{ height: 9, borderRadius: 999, background: "rgba(15, 23, 42, 0.08)", overflow: "hidden" }}>
                    <div style={{ width: `${item.pct}%`, height: "100%", borderRadius: 999, background: item.pct >= 80 ? "var(--success)" : item.pct >= 50 ? "var(--accent-2)" : "#C98A12" }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="grid cols-4" style={{ marginTop: 14, gap: 10 }}>
              <KV2 k="Pass marks" v={markCounts.pass || 0} />
              <KV2 k="Needs review" v={markCounts["needs-review"] || 0} />
              <KV2 k="Fail marks" v={markCounts.fail || 0} />
              <KV2 k="Unmarked" v={markCounts.unmarked || 0} />
            </div>
          </div>

          {/* Profile + documents */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 10 }}>Profile</div>
            <div className="grid cols-2" style={{ gap: 10 }}>
              <KV2 k="Name" v={a.name} />
              <KV2 k="Email" v={a.email} />
              <KV2 k="Phone" v={a.phone} />
              <KV2 k="Applied" v={a.appliedAt ? new Date(a.appliedAt).toLocaleDateString("en-PG", { day: "numeric", month: "short", year: "numeric" }) : "—"} />
              <KV2 k="Position" v={p.title} />
              <KV2 k="Client / company" v={p.client} />
              <KV2 k="Location" v={p.location} />
              <KV2 k="Application notes" v={a.notes} />
            </div>
            <div style={{ marginTop: 14 }}>
              <div className="mono eyebrow" style={{ marginBottom: 6 }}>Document checklist</div>
              <div className="stack" style={{ gap: 4 }}>
                {completeness.checks.map(c => (
                  <div key={c.id} className="doc-check">
                    <span className={"check-box small" + (c.ok ? " done" : "")}>{c.ok && <I.Check />}</span>
                    <span style={{ flex: 1 }}>{c.label}</span>
                    {!c.required && <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>optional</span>}
                    {!c.ok && c.required && <span className="mono" style={{ fontSize: 10, color: "var(--danger)" }}>missing</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Criteria scoring (KPI sheet) */}
          <div className="card">
            <div className="spread" style={{ marginBottom: 10 }}>
              <div className="card-title">Criteria / KPI scoring sheet <small>{criteria.length}</small></div>
              <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>weighted total {wt.total} / {wt.max} · {wt.pct}%</div>
            </div>
            <div className="stack" style={{ gap: 12 }}>
              {criteria.map(c => {
                const s = (screening.scores || {})[c.id] || {};
                const ai = screening.ai && screening.ai.perCriterion[c.id];
                return (
                  <div key={c.id} className="crit-score">
                    <div className="spread" style={{ marginBottom: 6 }}>
                      <div>
                        <div style={{ fontWeight: 500 }}>
                          {c.name}
                          {c.required && <span className="tag-pill tag-needs-review" style={{ marginLeft: 6 }}>required</span>}
                        </div>
                        {c.description && <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{c.description}</div>}
                        {c.notes && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, fontStyle: "italic" }}>Guidance: {c.notes}</div>}
                      </div>
                      <div className="mono" style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>max {c.maxPoints} · wt {c.weight}</div>
                    </div>
                    <div className="crit-score-row">
                      <div>
                        <div className="mono eyebrow" style={{ marginBottom: 4 }}>Score (0 – {c.maxPoints})</div>
                        <input className="ifield" type="number" min="0" max={c.maxPoints} value={s.score ?? ""} onChange={e => updateScore(c.id, "score", e.target.value === "" ? "" : parseInt(e.target.value, 10))} />
                      </div>
                      <div>
                        <div className="mono eyebrow" style={{ marginBottom: 4 }}>Mark</div>
                        <select className="ifield" value={s.mark || ""} onChange={e => updateScore(c.id, "mark", e.target.value)}>
                          <option value="">—</option>
                          <option value="pass">Pass</option>
                          <option value="needs-review">Needs review</option>
                          <option value="fail">Fail</option>
                        </select>
                      </div>
                      <div className="weighted-box">
                        <div className="mono eyebrow" style={{ marginBottom: 4 }}>Weighted</div>
                        <div className="num" style={{ fontSize: 18 }}>
                          {Number.isFinite(Number(s.score)) ? Number(s.score) * c.weight : "—"}
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <div className="mono eyebrow" style={{ marginBottom: 4 }}>Reviewer notes</div>
                      <textarea className="ifield" rows="2" value={s.notes || ""} onChange={e => updateScore(c.id, "notes", e.target.value)} placeholder="Why this score?" />
                    </div>
                    {ai && (
                      <div className="ai-suggest">
                        <div className="mono eyebrow" style={{ marginBottom: 4 }}>AI suggestion · {ai.score} / {c.maxPoints}</div>
                        <div style={{ fontSize: 12, color: "var(--ink-2)" }}>{ai.notes}</div>
                        <button className="btn ghost sm" onClick={() => applyAIScore(c.id)} style={{ marginTop: 6 }}>Use AI score</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Reviewer report */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 10 }}>Reviewer report</div>
            <textarea className="ifield" rows="5" value={screening.report.content || ""} onChange={e => updateReport("content", e.target.value)} placeholder="Write your screening notes here, or generate / polish them with AI below." />
            <div className="cluster" style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => setReportConfirm("generate")}>Generate AI-assisted report</button>
              <button className="btn ghost" disabled={!screening.report.content?.trim()} onClick={() => setReportConfirm("polish")}>Polish with AI</button>
            </div>
            <div style={{ marginTop: 14 }}>
              <div className="mono eyebrow" style={{ marginBottom: 6 }}>Overall recommendation</div>
              <select className="ifield" value={screening.report.recommendation || ""} onChange={e => updateReport("recommendation", e.target.value)}>
                <option value="">— select a label —</option>
                <option value="strong-match">Strong match</option>
                <option value="potential-match">Potential match</option>
                <option value="needs-review">Needs review</option>
                <option value="not-enough-info">Not enough information</option>
              </select>
              <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                These labels are informational. Final hiring decisions stay with a human reviewer.
              </div>
            </div>
          </div>
        </div>

        {/* AI-assisted scoring panel */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 6 }}>AI-Assisted Score</div>
          <div className="ai-disclaimer">
            AI-assisted scoring is a support tool only. It does not approve, reject, or make hiring decisions. Final screening decisions must be made by a human reviewer.
          </div>
          <div className="cluster" style={{ marginTop: 12 }}>
            <button className="btn accent sm" onClick={() => setConfirmAI(true)}>
              {screening.ai ? "Re-run AI-Assisted Score" : "AI-Assisted Score"}
            </button>
            {screening.ai && <button className="btn ghost sm" onClick={applyAllAI}>Apply all AI scores</button>}
          </div>

          {screening.ai ? (
            <div style={{ marginTop: 14 }}>
              <AIBlock label="Strengths"   items={screening.ai.strengths} />
              <AIBlock label="Concerns"    items={screening.ai.concerns} />
              <AIBlock label="Missing information" items={screening.ai.missing} />
              <div style={{ marginTop: 12 }}>
                <div className="mono eyebrow" style={{ marginBottom: 4 }}>Suggested reviewer notes</div>
                <div style={{ fontSize: 13, color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>{screening.ai.suggestedNotes}</div>
              </div>
              <div style={{ marginTop: 12 }}>
                <div className="mono eyebrow" style={{ marginBottom: 4 }}>Overall screening summary</div>
                <div style={{ fontSize: 13, color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>{screening.ai.summary}</div>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>
              No AI-assisted output yet. You can also screen this applicant entirely manually using the KPI sheet on the left.
            </div>
          )}
        </div>
      </div>

      {confirmAI && (
        <ConfirmModal
          title="Run AI-Assisted Score?"
          body="This AI-assisted scoring tool helps compare applicant information against your selected criteria. It does not approve, reject, or make hiring decisions. Final screening decisions must be made by a human reviewer."
          confirmLabel="Run scoring"
          onCancel={() => setConfirmAI(false)}
          onConfirm={runAI}
        />
      )}
      {aiRunning && <AIScreeningAnimation onDone={onAIDone} a={a} />}
      {reportConfirm && (
        <ConfirmModal
          title={reportConfirm === "generate" ? "Generate AI-assisted report?" : "Polish report with AI?"}
          body={reportConfirm === "generate"
            ? "The AI assistant will draft a report based on your criteria, scores, and AI suggestions. You can edit it afterward. AI does not make hiring decisions."
            : "The AI assistant will rewrite your notes for clarity and structure without changing the meaning. You can edit the result."}
          confirmLabel={reportConfirm === "generate" ? "Generate" : "Polish"}
          onCancel={() => setReportConfirm(null)}
          onConfirm={reportConfirm === "generate" ? generateReport : polishReport}
        />
      )}
    </div>
  );
}

function AIScreeningAnimation({ onDone, a }) {
  const [step, setStep] = React.useState(0);
  const steps = ["Reading application…", "Comparing against criteria…", "Drafting suggested scores…", "Summarizing strengths & concerns…"];
  React.useEffect(() => {
    if (step < steps.length) { const t = setTimeout(() => setStep(s => s + 1), 380); return () => clearTimeout(t); }
    const t = setTimeout(onDone, 700); return () => clearTimeout(t);
  }, [step]);
  return (
    <div className="publish-scrim">
      <div className="publish-modal">
        <div className="publish-eyebrow">AI-Assisted Scoring</div>
        <div className="publish-title">Reviewing {a.name}</div>
        <div className="publish-list">
          {steps.map((s, i) => (
            <div key={s} className={"publish-step" + (i < step ? " done" : i === step ? " active" : "")}>
              <span className={"check-box" + (i < step ? " done" : "")}>{i < step && <I.Check />}{i === step && <span className="spinner" />}</span>
              <span>{s}</span>
            </div>
          ))}
        </div>
        <div className="ai-disclaimer" style={{ marginTop: 16 }}>Suggestions only — final decisions stay with you.</div>
      </div>
    </div>
  );
}

function AIBlock({ label, items }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div className="mono eyebrow" style={{ marginBottom: 4 }}>{label}</div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55 }}>
        {items.map((x, i) => <li key={i}>{x}</li>)}
      </ul>
    </div>
  );
}

function Field2({ label, children }) {
  return (
    <label style={{ display: "block" }}>
      <div className="mono eyebrow" style={{ marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  );
}
function SummaryStat2({ label, value, sub }) {
  return (
    <div className="card stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>{sub}</div>}
    </div>
  );
}
function KV2({ k, v }) {
  return (
    <div>
      <div className="mono eyebrow" style={{ marginBottom: 2 }}>{k}</div>
      <div style={{ fontSize: 13 }}>{v || <em style={{ color: "var(--muted)", fontStyle: "normal" }}>—</em>}</div>
    </div>
  );
}

// --- Mock AI logic (frontend simulation only) ---
function mockAIScreening(a, p, criteria) {
  const comp = window.applicantCompleteness(a, p);
  const base = comp.pct / 100;
  const perCriterion = {};
  criteria.forEach(c => {
    let factor = 0.55 + base * 0.4;
    const lname = (c.name || "").toLowerCase();
    if (lname.includes("resume"))      factor = comp.pct / 100;
    else if (lname.includes("communic")) factor = a.coverLetterName ? 0.85 : 0.5;
    else if (lname.includes("qualif"))   factor = a.cvName ? 0.8 : 0.4;
    else if (lname.includes("location")) factor = (a.location || (p.location && a.email && a.email.includes(""))) ? 0.7 : 0.7;
    const score = Math.max(0, Math.min(c.maxPoints, Math.round(c.maxPoints * factor)));
    perCriterion[c.id] = {
      score,
      notes: score >= c.maxPoints * 0.75
        ? "Application materials suggest a solid fit on this criterion."
        : score >= c.maxPoints * 0.5
          ? "Some evidence visible; reviewer should verify."
          : "Limited evidence in submitted materials — flag for follow-up."
    };
  });
  const strengths = [], concerns = [];
  const missing = [...comp.missingReq, ...comp.missingOpt].slice(0, 4);
  if (a.cvName) strengths.push("Resume submitted (" + a.cvName + ")");
  if (a.coverLetterName) strengths.push("Cover letter included");
  if (a.email) strengths.push("Contact details on file");
  if (comp.pct === 100) strengths.push("Application is complete");
  if (a.cvName && a.cvComplete === false) concerns.push("Resume appears incomplete");
  if (!a.email) concerns.push("No email on file");
  if (!a.phone) concerns.push("No phone on file");
  if (!a.cvName) concerns.push("No CV uploaded");
  if (p.coverLetterRequired && !a.coverLetterName) concerns.push("Cover letter required but missing");
  return {
    perCriterion,
    strengths: strengths.length ? strengths : ["No specific strengths surfaced from materials"],
    concerns:  concerns.length  ? concerns  : ["No major concerns from completeness check"],
    missing:   missing.length   ? missing   : [],
    suggestedNotes: "Applicant submitted " + (a.cvName ? "a resume" : "no resume") + (a.coverLetterName ? " and a cover letter" : "") + ". Reviewer should verify experience and qualifications against the role's requirements during the next stage.",
    summary: "Based on the materials provided, this applicant scores approximately " + Math.round(base * 100) + "% on completeness. AI suggests a careful manual review on " + (criteria.find(c => c.required)?.name || "the required criteria") + " before any forward action."
  };
}

function mockReport(a, p, criteria, scores, ai) {
  const lines = [];
  lines.push("Applicant: " + a.name);
  lines.push("Position: " + p.title + " — " + (p.client || ""));
  lines.push("");
  lines.push("Criteria & scores:");
  criteria.forEach(c => {
    const s = scores[c.id] || (ai ? ai.perCriterion[c.id] : null);
    const score = s && typeof s.score === "number" ? s.score : "—";
    lines.push(" • " + c.name + ": " + score + " / " + c.maxPoints + " (weight " + c.weight + ")");
    if (s && s.notes) lines.push("    — " + s.notes);
  });
  if (ai) {
    lines.push("");
    lines.push("Strengths: " + (ai.strengths || []).join("; "));
    lines.push("Concerns: "  + (ai.concerns  || []).join("; "));
    if ((ai.missing || []).length > 0) lines.push("Missing: " + ai.missing.join("; "));
    lines.push("");
    lines.push("Summary: " + ai.summary);
  }
  const comp = window.applicantCompleteness(a, p);
  let rec = "needs-review";
  if (comp.pct >= 90) rec = "potential-match";
  if (comp.pct === 100) rec = "strong-match";
  if (comp.pct < 60) rec = "not-enough-info";
  return { content: lines.join("\n"), recommendation: rec };
}

function mockPolish(text) {
  if (!text.trim()) return text;
  const tidied = text.split("\n").map(l => l.trim()).filter(l => l.length > 0).join("\n");
  return tidied + "\n\nReviewer note: report polished for clarity. Final decisions remain with the human reviewer.";
}

window.Screening = Screening;
