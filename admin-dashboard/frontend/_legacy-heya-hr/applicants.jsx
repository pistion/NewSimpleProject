/* Only modify the Shortlisted Applicants frontend workflow and related checklist state handling. Do not rewrite unrelated dashboard sections or backend logic unless required to preserve checklist save/load behavior. */
// Applicants list across positions with position-scoped review, AI filtration backup, and screening handoff.

/* ─── AddApplicantModal ──────────────────────────────────────────────────── */
function AddApplicantModal({ positions, defaultPositionId, onClose, onCreated }) {
  const [form, setForm] = React.useState({
    fullName: "", email: "", phone: "", positionId: defaultPositionId || "",
    currentLocation: "", yearsExperience: "", notes: ""
  });
  const [busy, setBusy]   = React.useState(false);
  const [error, setError] = React.useState("");

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.fullName.trim()) { setError("Full name is required."); return; }
    if (!form.email.trim())    { setError("Email is required."); return; }
    if (!form.positionId)      { setError("Please select a position."); return; }
    setBusy(true); setError("");
    try {
      const data = await window.HEYA_API.createManualApplicant({
        fullName:        form.fullName.trim(),
        email:           form.email.trim(),
        phone:           form.phone.trim(),
        positionId:      form.positionId,
        currentLocation: form.currentLocation.trim(),
        yearsExperience: form.yearsExperience.trim(),
        notes:           form.notes.trim()
      });
      onCreated(data.application);
    } catch (err) {
      setError(err.message || "Could not create applicant.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="publish-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="edit-modal" style={{ maxWidth: 560 }}>
        <div className="edit-modal-head">
          <div>
            <div className="mono eyebrow">Applicants</div>
            <div className="edit-modal-title">Add applicant manually</div>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close">✕</button>
        </div>
        <form className="edit-modal-body" onSubmit={handleSubmit} autoComplete="off">
          <div className="grid cols-2" style={{ gap: 14 }}>
            <div className="field-group" style={{ gridColumn: "1/-1" }}>
              <label className="field-label">Full name *</label>
              <input className="ifield" type="text" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} placeholder="e.g. Maria Kave" autoFocus />
            </div>
            <div className="field-group">
              <label className="field-label">Email address *</label>
              <input className="ifield" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="candidate@email.com" />
            </div>
            <div className="field-group">
              <label className="field-label">Phone number</label>
              <input className="ifield" type="text" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+675 7XXX XXXX" />
            </div>
            <div className="field-group" style={{ gridColumn: "1/-1" }}>
              <label className="field-label">Position *</label>
              <select className="ifield" value={form.positionId} onChange={(e) => set("positionId", e.target.value)}>
                <option value="">— Select a position —</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}{p.company || p.client ? ` — ${p.company || p.client}` : ""}</option>
                ))}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Current location</label>
              <input className="ifield" type="text" value={form.currentLocation} onChange={(e) => set("currentLocation", e.target.value)} placeholder="e.g. Port Moresby, PNG" />
            </div>
            <div className="field-group">
              <label className="field-label">Years of experience</label>
              <input className="ifield" type="text" value={form.yearsExperience} onChange={(e) => set("yearsExperience", e.target.value)} placeholder="e.g. 5 years" />
            </div>
            <div className="field-group" style={{ gridColumn: "1/-1" }}>
              <label className="field-label">Notes / cover letter</label>
              <textarea className="ifield" rows={4} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Any relevant notes about this candidate…" style={{ resize: "vertical" }} />
            </div>
          </div>

          {error && <div className="settings-test-note is-error" style={{ marginTop: 14 }}>{error}</div>}

          <div className="edit-modal-actions" style={{ marginTop: 20 }}>
            <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? "Adding…" : "Add Applicant"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── PipedriveDeleteModal ───────────────────────────────────────────────── */
/* Shown on delete only when the Pipedrive CRM toggle is ON in Settings.
   Lets the admin choose: Dashboard only vs Dashboard + Pipedrive.        */
function PipedriveDeleteModal({ applicantName, onCancel, onDashboardOnly, onWithPipedrive, busy }) {
  return (
    <div className="publish-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div className="edit-modal" style={{ maxWidth: 460 }}>
        <div className="edit-modal-head">
          <div>
            <div className="mono eyebrow">Action required</div>
            <div className="edit-modal-title">Remove applicant</div>
          </div>
          <button className="icon-btn" onClick={onCancel} disabled={busy} title="Cancel">✕</button>
        </div>
        <div className="edit-modal-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ margin: "0 0 6px", color: "var(--muted)", fontSize: 14, lineHeight: 1.55 }}>
            You are about to remove <strong>{applicantName || "this applicant"}</strong>.
            Pipedrive CRM is connected — choose how far this action should reach.
          </p>

          <button
            className="btn pd-delete-option"
            onClick={onDashboardOnly}
            disabled={busy}
          >
            <div>
              <div style={{ fontWeight: 700 }}>Dashboard only</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                Remove from dashboard. Contact and deal in Pipedrive are kept.
              </div>
            </div>
          </button>

          <button
            className="btn accent pd-delete-option"
            onClick={onWithPipedrive}
            disabled={busy}
          >
            <div>
              <div style={{ fontWeight: 700 }}>Dashboard + Pipedrive</div>
              <div className="mono" style={{ fontSize: 11, marginTop: 3, opacity: 0.85 }}>
                Remove from dashboard AND delete the linked contact and deal in Pipedrive.
              </div>
            </div>
          </button>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 4 }}>
            <button className="btn ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── CSV parser helper ──────────────────────────────────────────────────── */
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const result = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = "", inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        cells.push(cur.trim()); cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    result.push(cells);
  }
  return result;
}

const CSV_FIELD_MAP = {
  fullName:        ["fullname","full name","name","candidate","candidate name"],
  email:           ["email","email address","e-mail","mail"],
  phone:           ["phone","phone number","mobile","contact","cell"],
  currentLocation: ["location","city","current location","address","region"],
  yearsExperience: ["experience","years","years experience","years of experience","exp"],
  notes:           ["notes","note","comments","cover letter","coverletter","message"]
};

function autoMapHeaders(headers) {
  const mapping = {};
  headers.forEach((h, idx) => {
    const norm = h.toLowerCase().trim();
    for (const [field, aliases] of Object.entries(CSV_FIELD_MAP)) {
      if (aliases.includes(norm) && !(field in mapping)) {
        mapping[field] = idx;
      }
    }
  });
  return mapping;
}

/* ─── ImportCSVModal ─────────────────────────────────────────────────────── */
function ImportCSVModal({ positions, defaultPositionId, onClose, onImported }) {
  const [step, setStep]             = React.useState("upload"); // upload | preview | result
  const [headers, setHeaders]       = React.useState([]);
  const [rows, setRows]             = React.useState([]);
  const [mapping, setMapping]       = React.useState({});
  const [positionId, setPositionId] = React.useState(defaultPositionId || "");
  const [busy, setBusy]             = React.useState(false);
  const [error, setError]           = React.useState("");
  const [result, setResult]         = React.useState(null);

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = parseCSV(ev.target.result);
        if (parsed.length < 2) { setError("CSV must have a header row and at least one data row."); return; }
        const hdrs = parsed[0];
        const dataRows = parsed.slice(1).filter((r) => r.some((c) => c));
        setHeaders(hdrs);
        setRows(dataRows);
        setMapping(autoMapHeaders(hdrs));
        setError("");
        setStep("preview");
      } catch {
        setError("Could not parse this CSV file. Please check the format.");
      }
    };
    reader.readAsText(file);
  }

  function getMapped(row, field) {
    const idx = mapping[field];
    return idx != null ? (row[idx] || "") : "";
  }

  async function handleImport() {
    if (!positionId) { setError("Please select a position."); return; }
    setBusy(true); setError("");
    const payload = rows.map((row) => ({
      fullName:        getMapped(row, "fullName"),
      email:           getMapped(row, "email"),
      phone:           getMapped(row, "phone"),
      currentLocation: getMapped(row, "currentLocation"),
      yearsExperience: getMapped(row, "yearsExperience"),
      notes:           getMapped(row, "notes"),
      positionId
    }));
    try {
      const res = await window.HEYA_API.bulkImportApplicants(payload);
      setResult(res);
      setStep("result");
      // Refresh the list
      const fresh = await window.HEYA_API.getDashboardData({ applicationsLimit: 0 }).catch(() => null);
      if (fresh?.applicants && onImported) onImported(fresh.applicants);
    } catch (err) {
      setError(err.message || "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  const fieldLabels = { fullName: "Full Name", email: "Email", phone: "Phone", currentLocation: "Location", yearsExperience: "Experience", notes: "Notes" };

  return (
    <div className="publish-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="edit-modal" style={{ maxWidth: 780 }}>
        <div className="edit-modal-head">
          <div>
            <div className="mono eyebrow">Applicants</div>
            <div className="edit-modal-title">{step === "result" ? "Import complete" : "Import applicants from CSV"}</div>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close">✕</button>
        </div>

        <div className="edit-modal-body">
          {/* ── Step 1: Upload ── */}
          {step === "upload" && (
            <div>
              <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
                Upload a <strong>.csv</strong> file with applicant data. The first row must be column headers.<br />
                Supported columns: <span className="mono" style={{ fontSize: 12 }}>Name, Email, Phone, Location, Experience, Notes</span>
              </div>
              <a
                href="data:text/csv;charset=utf-8,Full%20Name%2CEmail%2CPhone%2CLocation%2CExperience%2CNotes%0AMaria%20Kave%2Cmaria.kave%40example.com%2C%2B675%207001%201234%2CPort%20Moresby%2C5%20years%2C"
                download="heya_applicants_template.csv"
                className="btn ghost sm"
                style={{ marginBottom: 16, display: "inline-flex", gap: 6, alignItems: "center" }}
              >
                ↓ Download template CSV
              </a>
              <div className="field-group">
                <label className="field-label">Select CSV file</label>
                <input type="file" accept=".csv,text/csv" className="ifield" onChange={handleFileChange} style={{ padding: "6px 10px" }} />
              </div>
              {error && <div className="settings-test-note is-error" style={{ marginTop: 12 }}>{error}</div>}
            </div>
          )}

          {/* ── Step 2: Preview + column mapping ── */}
          {step === "preview" && (
            <div>
              <div className="grid cols-2" style={{ gap: 14, marginBottom: 18 }}>
                <div className="field-group" style={{ gridColumn: "1/-1" }}>
                  <label className="field-label">Assign all rows to position *</label>
                  <select className="ifield" value={positionId} onChange={(e) => setPositionId(e.target.value)}>
                    <option value="">— Select a position —</option>
                    {positions.map((p) => (
                      <option key={p.id} value={p.id}>{p.title}{p.company || p.client ? ` — ${p.company || p.client}` : ""}</option>
                    ))}
                  </select>
                </div>
                {Object.keys(fieldLabels).map((field) => (
                  <div className="field-group" key={field}>
                    <label className="field-label" style={{ fontSize: 12 }}>
                      {fieldLabels[field]}{["fullName","email"].includes(field) ? " *" : ""}
                    </label>
                    <select className="ifield" style={{ fontSize: 13 }}
                      value={mapping[field] != null ? String(mapping[field]) : ""}
                      onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value !== "" ? Number(e.target.value) : undefined }))}>
                      <option value="">— skip —</option>
                      {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              <div className="mono eyebrow" style={{ marginBottom: 8 }}>Preview — first {Math.min(rows.length, 5)} of {rows.length} rows</div>
              <div style={{ overflowX: "auto", maxHeight: 220, overflowY: "auto" }}>
                <table className="pos-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Name</th><th>Email</th><th>Phone</th><th>Location</th><th>Experience</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((row, i) => (
                      <tr key={i}>
                        <td>{getMapped(row, "fullName") || <span style={{ color: "var(--muted)" }}>—</span>}</td>
                        <td className="mono" style={{ fontSize: 11 }}>{getMapped(row, "email") || <span style={{ color: "var(--muted)" }}>—</span>}</td>
                        <td>{getMapped(row, "phone") || <span style={{ color: "var(--muted)" }}>—</span>}</td>
                        <td>{getMapped(row, "currentLocation") || <span style={{ color: "var(--muted)" }}>—</span>}</td>
                        <td>{getMapped(row, "yearsExperience") || <span style={{ color: "var(--muted)" }}>—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {error && <div className="settings-test-note is-error" style={{ marginTop: 12 }}>{error}</div>}
            </div>
          )}

          {/* ── Step 3: Result ── */}
          {step === "result" && result && (
            <div>
              <div className={"settings-test-note " + (result.failed > 0 ? "is-error" : "is-success")} style={{ marginBottom: 14 }}>
                {result.message}
              </div>
              <div className="grid cols-3" style={{ gap: 12 }}>
                {[["Created", result.created, "status-published"], ["Skipped", result.skipped, "status-screening"], ["Failed", result.failed, "status-rejected"]].map(([label, val, cls]) => (
                  <div key={label} className="card" style={{ padding: 14, textAlign: "center" }}>
                    <div style={{ fontSize: 28, fontWeight: 700 }}>{val}</div>
                    <div className="mono eyebrow" style={{ marginTop: 4 }}>{label}</div>
                  </div>
                ))}
              </div>
              {result.errors?.length > 0 && (
                <details style={{ marginTop: 14, fontSize: 12 }}>
                  <summary style={{ cursor: "pointer", fontWeight: 600 }}>Show {result.errors.length} error{result.errors.length !== 1 ? "s" : ""}</summary>
                  <ul style={{ margin: "8px 0 0 16px" }}>
                    {result.errors.map((e, i) => <li key={i}>{e.row}: {e.reason}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>

        <div className="edit-modal-actions">
          {step === "upload"   && <button className="btn ghost" onClick={onClose}>Cancel</button>}
          {step === "preview"  && (
            <>
              <button className="btn ghost" onClick={() => setStep("upload")} disabled={busy}>Back</button>
              <button className="btn primary" onClick={handleImport} disabled={busy || !positionId}>
                {busy ? `Importing ${rows.length} rows…` : `Import ${rows.length} applicant${rows.length !== 1 ? "s" : ""}`}
              </button>
            </>
          )}
          {step === "result" && <button className="btn primary" onClick={onClose}>Done</button>}
        </div>
      </div>
    </div>
  );
}

function Applicants({
  positions,
  applicants,
  activePositionId,
  setActivePositionId,
  setView,
  setPositions,
  setApplicants,
  onPushApplicantsToScreening,
  onUpdateApplicantStatus,
  onSaveShortlistReview,
  onDeleteApplication,
  statusFilter,
  title,
  subtitle,
  onEditingChange,
  pendingRefreshCount = 0,
  onApplyPendingRefresh
}) {
  const [posFilter, setPosFilter] = React.useState("all");
  const [stageFilter, setStageFilter] = React.useState(statusFilter || "all");
  const [selectedId, setSelectedId] = React.useState(null);
  const [shortlistViewMode, setShortlistViewMode] = React.useState("applicants");
  const [shortlistSelectedId, setShortlistSelectedId] = React.useState(null);
  const [openActionMenuId, setOpenActionMenuId] = React.useState(null);
  const [rejectionPendingId, setRejectionPendingId] = React.useState(null);
  const [deleting, setDeleting] = React.useState(false);
  const [notice, setNotice] = React.useState(null);
  const [filtrationRunning, setFiltrationRunning] = React.useState(false);
  const [downloadBusy, setDownloadBusy] = React.useState(false);
  const [downloadingApplicantId, setDownloadingApplicantId] = React.useState(null);
  const [emptyDownloadApplicantId, setEmptyDownloadApplicantId] = React.useState(null);
  const [pushBusy, setPushBusy] = React.useState(false);
  const [showAddModal, setShowAddModal]         = React.useState(false);
  const [showImportModal, setShowImportModal]   = React.useState(false);
  const [deletePendingRow, setDeletePendingRow] = React.useState(null);
  const isShortlistView = String(statusFilter || "").toLowerCase() === "shortlisted";
  const useSimplifiedStages = !statusFilter;
  const isPositionChildView = useSimplifiedStages || title === "Interviews";

  const simplifiedApplicantStageOptions = [
    { id: "new", label: "New" },
    { id: "screening", label: "Screening" },
    { id: "rejected", label: "Rejected" }
  ];

  const applicantStageOptions = useSimplifiedStages ? simplifiedApplicantStageOptions : window.APPLICANT_STATUSES;
  const posMap = React.useMemo(
    () => Object.fromEntries((positions || []).map((position) => [String(position.id), position])),
    [positions]
  );

  const screeningApplicantIds = React.useMemo(() => {
    const ids = new Set();
    (positions || []).forEach((position) => {
      if (position.status !== "screening") return;
      const rankings = Array.isArray(position.screening?.rankings) ? position.screening.rankings : [];
      if (rankings.length) {
        rankings.forEach((id) => ids.add(String(id)));
        return;
      }
      (applicants || []).forEach((applicant) => {
        if (resolveApplicantPositionId(applicant, positions, posMap) === String(position.id) && normalizeApplicantStage(applicant.status) === "screening") {
          ids.add(String(applicant.id));
        }
      });
    });
    return ids;
  }, [positions, applicants, posMap]);

  React.useEffect(() => {
    const nextPositionId = activePositionId == null ? "" : String(activePositionId);
    if (!nextPositionId || !posMap[nextPositionId]) {
      setPosFilter("all");
      return;
    }
    setPosFilter(nextPositionId);
  }, [activePositionId, posMap]);

  React.useEffect(() => {
    if (onEditingChange) onEditingChange(Boolean(selectedId) || filtrationRunning || downloadBusy || Boolean(downloadingApplicantId) || Boolean(emptyDownloadApplicantId) || pushBusy);
  }, [selectedId, filtrationRunning, downloadBusy, downloadingApplicantId, emptyDownloadApplicantId, pushBusy, onEditingChange]);

  React.useEffect(() => () => {
    if (onEditingChange) onEditingChange(false);
  }, [onEditingChange]);

  function handlePositionFilterChange(nextValue) {
    setPosFilter(nextValue);
    if (setActivePositionId) {
      setActivePositionId(nextValue === "all" ? null : nextValue);
    }
  }

  /* emails that appear on more than one application — computed once */
  const duplicateEmailSet = React.useMemo(() => {
    const counts = new Map();
    (applicants || []).forEach((a) => {
      const e = String(a.normalizedEmail || a.email || "").toLowerCase().trim();
      if (e) counts.set(e, (counts.get(e) || 0) + 1);
    });
    const dupes = new Set();
    counts.forEach((count, email) => { if (count > 1) dupes.add(email); });
    return dupes;
  }, [applicants]);

  const applicantsWithContext = React.useMemo(() => {
    return (applicants || []).map((applicant) => {
      const resolvedPositionId = resolveApplicantPositionId(applicant, positions, posMap);
      const position = resolvedPositionId ? posMap[resolvedPositionId] : null;
      const normalizedStage = useSimplifiedStages ? normalizeApplicantStage(applicant.status) : applicant.status;
      const completeness = window.applicantCompleteness
        ? window.applicantCompleteness(applicant, position)
        : { pct: 0, tag: "needs-review", missingReq: [], missingOpt: [] };
      const inScreeningQueue = screeningApplicantIds.has(String(applicant.id))
        || (position?.status === "screening" && normalizedStage === "screening");
      const normalizedEmail = String(applicant.normalizedEmail || applicant.email || "").toLowerCase().trim();
      const isDuplicate = normalizedEmail ? duplicateEmailSet.has(normalizedEmail) : false;
      return {
        applicant,
        position,
        positionId: resolvedPositionId,
        stage: normalizedStage,
        completeness,
        inScreeningQueue,
        isDuplicate
      };
    });
  }, [applicants, positions, posMap, screeningApplicantIds, useSimplifiedStages, duplicateEmailSet]);

  const scopedApplicants = React.useMemo(() => {
    const rows = applicantsWithContext.filter((row) => {
      if (useSimplifiedStages && row.inScreeningQueue) return false;
      if (posFilter !== "all" && row.positionId !== posFilter) return false;
      return true;
    });

    if (posFilter !== "all") {
      return sortApplicantsForReview(rows, posMap[posFilter]);
    }

    return [...rows].sort((left, right) => {
      const leftTime = new Date(left.applicant.appliedAt || 0).getTime();
      const rightTime = new Date(right.applicant.appliedAt || 0).getTime();
      return rightTime - leftTime;
    });
  }, [applicantsWithContext, posFilter, posMap, useSimplifiedStages]);

  const filtered = React.useMemo(() => {
    return scopedApplicants.filter((row) => {
      if (stageFilter !== "all" && row.stage !== stageFilter) return false;
      return true;
    });
  }, [scopedApplicants, stageFilter]);

  const shortlistedGroups = React.useMemo(() => {
    if (!isShortlistView) return [];
    const groups = new Map();

    filtered.forEach((row) => {
      const key = row.positionId || `unlinked:${row.position?.title || row.applicant.positionTitle || row.applicant.id}`;
      const existing = groups.get(key) || {
        key,
        positionId: row.positionId || null,
        position: row.position || null,
        title: row.position?.title || row.applicant.positionTitle || "Unassigned position",
        rows: []
      };
      existing.rows.push(row);
      groups.set(key, existing);
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        rows: sortApplicantsForReview(group.rows, group.position)
      }))
      .sort((left, right) => left.title.localeCompare(right.title));
  }, [filtered, isShortlistView]);

  const selected = applicantsWithContext.find((row) => String(row.applicant.id) === String(selectedId)) || null;
  const selectedPosition = posFilter !== "all" ? posMap[posFilter] || null : null;
  const selectedPositionApplicants = scopedApplicants.filter((row) => String(row.positionId) === String(posFilter));
  const shortlistSelectedRow = filtered.find((row) => String(row.applicant.id) === String(shortlistSelectedId)) || null;

  React.useEffect(() => {
    if (selectedId && !applicantsWithContext.some((row) => String(row.applicant.id) === String(selectedId))) {
      setSelectedId(null);
    }
  }, [selectedId, applicantsWithContext]);

  React.useEffect(() => {
    if (shortlistSelectedId && !filtered.some((row) => String(row.applicant.id) === String(shortlistSelectedId))) {
      setShortlistSelectedId(null);
    }
  }, [shortlistSelectedId, filtered]);

  React.useEffect(() => {
    if (!openActionMenuId) return;
    if (!filtered.some((row) => String(row.applicant.id) === String(openActionMenuId))) {
      setOpenActionMenuId(null);
    }
  }, [openActionMenuId, filtered]);

  React.useEffect(() => {
    if (!openActionMenuId) return undefined;
    const closeMenu = () => setOpenActionMenuId(null);
    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeMenu();
    };
    document.addEventListener("click", closeMenu);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("click", closeMenu);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openActionMenuId]);

  function setStageDirectly(id, status) {
    onUpdateApplicantStatus(id, status);
  }

  function setStage(id, status) {
    if (status === "rejected") {
      setRejectionPendingId(String(id));
    } else {
      setStageDirectly(id, status);
    }
  }

  async function handleDelete(row) {
    if (!row || !onDeleteApplication) return;
    // When Pipedrive CRM is enabled show the choice modal; otherwise use a plain confirm
    if (window.HEYA_PD_ENABLED) {
      setDeletePendingRow(row);
      return;
    }
    if (!window.confirm("Delete application for \"" + (row.applicant.name || "this applicant") + "\"?\n\nThis removes only this application and its uploaded files. The related position will remain.")) {
      return;
    }
    setDeleting(true);
    try {
      await onDeleteApplication(row.applicant.id);
      setSelectedId(null);
    } finally {
      setDeleting(false);
    }
  }

  async function executeDelete(row, includePipedrive) {
    if (!row || !onDeleteApplication) return;
    setDeleting(true);
    try {
      await onDeleteApplication(row.applicant.id, { includePipedrive });
      setSelectedId(null);
      setShortlistSelectedId(null);
    } finally {
      setDeleting(false);
    }
  }

  async function handlePhoneUpdate(applicantId, phone) {
    const data = await window.HEYA_API.updateApplicantPhone(applicantId, phone);
    if (data?.application && setApplicants) {
      setApplicants((prev) => prev.map((a) => String(a.id) === String(applicantId) ? data.application : a));
    }
    return data;
  }

  function openGuardedNotice(message, titleText) {
    setNotice({
      title: titleText || "Heads up",
      body: message
    });
  }

  function startAiFilter() {
    if (posFilter === "all" || !selectedPosition) {
      openGuardedNotice("Please select a specific position before running AI Filter.", "Position required");
      return;
    }

    if (selectedPositionApplicants.length === 0) {
      openGuardedNotice("No applicants are available for the selected position.", "Nothing to filter");
      return;
    }

    setFiltrationRunning(true);
  }

  function finishAiFilter() {
    if (!selectedPosition || !setPositions) {
      setFiltrationRunning(false);
      return;
    }

    const orderedIds = sortApplicantsForReview(selectedPositionApplicants, selectedPosition).map((row) => row.applicant.id);
    const runAt = new Date().toISOString().slice(0, 10);

    setPositions((current) => (current || []).map((position) => {
      if (String(position.id) !== String(selectedPosition.id)) return position;
      return {
        ...position,
        filtration: {
          ...(position.filtration || {}),
          status: "done",
          order: orderedIds,
          runAt
        }
      };
    }));

    setFiltrationRunning(false);
    openGuardedNotice("AI Filter completed for the selected position. Applicants were reorganized using the position-based review logic.", "AI Filter complete");
  }

  async function pushToScreening() {
    if (posFilter === "all" || !selectedPosition) {
      openGuardedNotice("Please select a specific position before pushing applicants to screening.", "Position required");
      return;
    }

    const eligibleRows = sortApplicantsForReview(
      scopedApplicants.filter((row) => String(row.positionId) === String(posFilter) && row.stage === "new"),
      selectedPosition
    );

    if (!eligibleRows.length) {
      openGuardedNotice("No new applicants are available to push into screening for the selected position.", "Nothing to push");
      return;
    }

    const orderedIds = eligibleRows.map((row) => row.applicant.id);

    setPushBusy(true);
    try {
      if (onPushApplicantsToScreening) {
        await onPushApplicantsToScreening(selectedPosition.id, orderedIds);
      } else {
        await window.HEYA_API.pushPositionToScreening(selectedPosition.id, orderedIds);
      }

      openGuardedNotice("Applicants for the selected position were pushed to screening and removed from the main Applicants review list.", "Pushed to screening");
    } catch (error) {
      openGuardedNotice(error.message || "Unable to push applicants to screening right now.", "Screening push failed");
    } finally {
      setPushBusy(false);
    }
  }

  function downloadPositionDataZip() {
    if (posFilter === "all" || !selectedPosition) {
      openGuardedNotice("Please select a specific position before downloading CV / Data.", "Position required");
      return;
    }

    if (!selectedPositionApplicants.length) {
      openGuardedNotice("No applicants are available for the selected position.", "Nothing to download");
      return;
    }

    setDownloadBusy(true);
    try {
      window.HEYA_API.downloadPositionZip(selectedPosition.id);
    } catch (error) {
      openGuardedNotice(error.message || "Unable to prepare the CV / Data ZIP right now.", "Download failed");
    } finally {
      setDownloadBusy(false);
    }
  }

  function downloadApplicantDataZip(row) {
    if (!row) return;
    if (!hasApplicantFiles(row.applicant)) {
      setEmptyDownloadApplicantId(String(row.applicant.id));
      window.setTimeout(() => {
        setEmptyDownloadApplicantId((current) => current === String(row.applicant.id) ? null : current);
      }, 900);
      return;
    }

    setDownloadingApplicantId(String(row.applicant.id));
    try {
      window.HEYA_API.downloadApplicationZip(row.applicant.id);
    } catch (error) {
      openGuardedNotice(error.message || "Unable to prepare the applicant CV / Data ZIP right now.", "Download failed");
    } finally {
      setDownloadingApplicantId(null);
    }
  }

  function handleOpenShortlistedApplicant(row) {
    setOpenActionMenuId(null);
    setShortlistSelectedId(String(row.applicant.id));
    setSelectedId(String(row.applicant.id));
  }

  function handleSelectShortlistedApplicant(row) {
    setOpenActionMenuId(null);
    setShortlistSelectedId((current) => String(current) === String(row.applicant.id) ? null : String(row.applicant.id));
  }

  function handleViewSelectedApplicant() {
    if (!shortlistSelectedRow) return;
    handleOpenShortlistedApplicant(shortlistSelectedRow);
  }

  return (
    <div className="page applicants-page">
      <div className="page-head">
        <div>
          <div className="mono eyebrow">{title || "Applicants"}</div>
          <h1 className="page-title" style={{ marginTop: 8 }}>{title || "Applicants"}</h1>
          <div className="page-sub">{subtitle || "Direct applicant review sheet under Positions. Filter by posting, update stages, export files, and correct applicant flow on a clean screen."}</div>
          {isPositionChildView && (
            <div className="cluster" style={{ marginTop: 10, gap: 8 }}>
              <span className="status-badge status-ready">Under Positions</span>
              <button className="btn ghost sm" onClick={() => {
                if (setActivePositionId) setActivePositionId(selectedPosition?.id || null);
                if (setView) setView("positions");
              }}>
                Back to Positions
              </button>
            </div>
          )}
        </div>
        {pendingRefreshCount > 0 && (
          <button className="btn ghost sm" onClick={onApplyPendingRefresh}>
            New items available ({pendingRefreshCount})
          </button>
        )}
      </div>

      {isShortlistView && selected ? (
        <ShortlistedApplicantWorkspace
          row={selected}
          onSaveShortlistReview={onSaveShortlistReview}
          onBack={() => {
            setOpenActionMenuId(null);
            setSelectedId(null);
          }}
          onDelete={onDeleteApplication ? () => handleDelete(selected) : null}
          deleting={deleting}
          onUpdatePhone={handlePhoneUpdate}
        />
      ) : (
        <>
          {isShortlistView ? (
            <>
              <div className="filter-row shortlist-filter-row">
                <select className="ifield" style={{ width: 240 }} value={posFilter} onChange={(event) => handlePositionFilterChange(event.target.value)}>
                  <option value="all">All positions</option>
                  {positions.map((position) => <option key={position.id} value={position.id}>{position.title}</option>)}
                </select>
                <div className="shortlist-top-actions" role="group" aria-label="Shortlisted applicant view controls">
                  <button
                    type="button"
                    className={"btn sm shortlist-view-toggle" + (shortlistViewMode === "applicants" ? " is-active" : "")}
                    onClick={() => setShortlistViewMode("applicants")}
                    aria-pressed={shortlistViewMode === "applicants"}
                  >
                    Applicants View
                  </button>
                  <button
                    type="button"
                    className={"btn sm shortlist-view-toggle" + (shortlistViewMode === "positions" ? " is-active" : "")}
                    onClick={() => setShortlistViewMode("positions")}
                    aria-pressed={shortlistViewMode === "positions"}
                  >
                    Positions View
                  </button>
                  <button
                    type="button"
                    className="btn primary sm shortlist-view-selected-btn"
                    onClick={handleViewSelectedApplicant}
                    disabled={!shortlistSelectedRow}
                  >
                    View Selected
                  </button>
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="card shortlist-empty-state">
                  <div className="card-title">No shortlisted applicants yet</div>
                  <div className="page-sub" style={{ marginTop: 8, maxWidth: "none" }}>
                    Shortlisted applicants will appear here once candidates are moved forward from screening.
                  </div>
                </div>
              ) : (
                <ShortlistedApplicantsList
                  rows={filtered}
                  groups={shortlistedGroups}
                  viewMode={shortlistViewMode}
                  selectedApplicantId={shortlistSelectedId}
                  openMenuApplicantId={openActionMenuId}
                  onSelectApplicant={handleSelectShortlistedApplicant}
                  onOpenApplicant={handleOpenShortlistedApplicant}
                  onToggleMenu={(applicantId) => setOpenActionMenuId((current) => String(current) === String(applicantId) ? null : String(applicantId))}
                  onCloseMenu={() => setOpenActionMenuId(null)}
                  onDelete={onDeleteApplication ? handleDelete : null}
                  onDownloadApplicantDataZip={downloadApplicantDataZip}
                  onDownloadApplicantDataFile={downloadApplicantDataFile}
                  downloadingApplicantId={downloadingApplicantId}
                  deleting={deleting}
                  pushBusy={pushBusy}
                  filtrationRunning={filtrationRunning}
                  downloadBusy={downloadBusy}
                  onUpdateApplicantStatus={setStage}
                />
              )}
            </>
          ) : (
            <>
              <div className="filter-row applicants-toolbar" style={{ alignItems: "center", flexWrap: "wrap" }}>
                <select className="ifield" style={{ width: 240 }} value={posFilter} onChange={(event) => handlePositionFilterChange(event.target.value)}>
                  <option value="all">All positions</option>
                  {positions.map((position) => <option key={position.id} value={position.id}>{position.title}</option>)}
                </select>
                {!statusFilter && (
                  <select className="ifield" style={{ width: 180 }} value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
                    <option value="all">All stages</option>
                    {applicantStageOptions.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
                  </select>
                )}
                {useSimplifiedStages && (
                  <>
                    <button className="btn accent sm" onClick={startAiFilter} disabled={filtrationRunning || pushBusy}>
                      <I.Spark />
                      <span>{filtrationRunning ? "Running AI Filter..." : "AI Filter"}</span>
                    </button>
                    <button className="btn sm" onClick={pushToScreening} disabled={pushBusy || filtrationRunning || downloadBusy}>
                      <I.Send />
                      <span>{pushBusy ? "Pushing..." : "Push to Screening"}</span>
                    </button>
                  </>
                )}
                <div className="applicants-toolbar-actions">
                  <button className="btn sm" onClick={() => setShowImportModal(true)} title="Import applicants from a CSV file">
                    <I.Upload />
                    <span>Import CSV</span>
                  </button>
                  <button className="btn primary sm" onClick={() => setShowAddModal(true)} title="Manually add a single applicant">
                    <I.Plus />
                    <span>Add Applicant</span>
                  </button>
                </div>
              </div>

              {showAddModal && (
                <AddApplicantModal
                  positions={positions}
                  defaultPositionId={posFilter !== "all" ? posFilter : ""}
                  onClose={() => setShowAddModal(false)}
                  onCreated={(newApp) => {
                    if (setApplicants) setApplicants((prev) => [newApp, ...(prev || [])]);
                    setShowAddModal(false);
                  }}
                />
              )}
              {showImportModal && (
                <ImportCSVModal
                  positions={positions}
                  defaultPositionId={posFilter !== "all" ? posFilter : ""}
                  onClose={() => setShowImportModal(false)}
                  onImported={(newApps) => {
                    if (setApplicants) setApplicants((prev) => [...(newApps || []), ...(prev || [])]);
                    setShowImportModal(false);
                  }}
                />
              )}

              <div className="card flush applicants-table-card">
                <div className="applicants-table-scroll">
                <table className="pos-table applicants-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Position</th>
                      <th>Stage</th>
                      <th>Applied</th>
                      <th style={{ minWidth: isShortlistView ? 320 : 140 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <span>{isShortlistView ? "Actions" : "CV / Data"}</span>
                          {useSimplifiedStages && (
                            <button
                              className="icon-btn"
                              onClick={downloadPositionDataZip}
                              title="Download position CV / Data ZIP"
                              disabled={downloadBusy}
                              style={{ width: 26, height: 26 }}
                            >
                              <I.Download />
                            </button>
                          )}
                        </span>
                      </th>
                      <th style={{ width: 1 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <tr><td colSpan="7" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>No applicants match this view.</td></tr>
                    )}
                    {filtered.map((row) => {
                      const applicantBusy = downloadBusy || pushBusy || filtrationRunning || downloadingApplicantId === String(row.applicant.id);
                      return (
                        <tr key={row.applicant.id}>
                          <td>
                            <div style={{ fontWeight: 500 }}>{row.applicant.name}</div>
                            {row.isDuplicate && (
                              <span className="duplicate-badge" title="This email appears on multiple applications">⚠ Repeat</span>
                            )}
                          </td>
                          <td className="mono" style={{ fontSize: 12 }}>{row.applicant.email || "-"}</td>
                          <td>{row.position?.title || row.applicant.positionTitle || "-"}</td>
                          <td>
                            <select className="stage-select" value={row.stage} onChange={(event) => setStage(row.applicant.id, event.target.value)}>
                              {applicantStageOptions.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
                            </select>
                          </td>
                          <td className="num" style={{ fontSize: 12 }}>{row.applicant.appliedAt ? new Date(row.applicant.appliedAt).toLocaleDateString("en-PG", { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                          <td>
                            {isShortlistView ? (
                              <div className="applicant-inline-actions">
                                <button
                                  className="btn ghost sm"
                                  onClick={() => openApplicantCv(row.applicant)}
                                  disabled={!hasApplicantCv(row.applicant) || applicantBusy}
                                  title={hasApplicantCv(row.applicant) ? "Open CV" : "No CV uploaded"}
                                >
                                  CV
                                </button>
                                <button
                                  className="btn ghost sm"
                                  onClick={() => openApplicantCoverLetterOrData(row)}
                                  disabled={!hasApplicantCoverLetterOrData(row) || applicantBusy}
                                  title={hasApplicantCoverLetterOrData(row) ? "Open supporting document or application data" : "No cover letter or extra data available"}
                                >
                                  {getApplicantSupportActionLabel(row)}
                                </button>
                                <button className="btn sm" onClick={() => setSelectedId(row.applicant.id)} disabled={applicantBusy}>
                                  Open
                                </button>
                              </div>
                            ) : (
                              <div className="applicant-doc-summary" title={hasApplicantFiles(row.applicant) ? describeDocumentCell(row.applicant) : "No files"}>
                                {emptyDownloadApplicantId === String(row.applicant.id)
                                  ? <span className="mono applicant-no-files-message">No files</span>
                                  : <span className="mono">{hasApplicantFiles(row.applicant) ? describeDocumentCell(row.applicant) : "No files"}</span>}
                              </div>
                            )}
                          </td>
                          <td>
                            <ApplicantRowActions
                              applicantName={row.applicant.name}
                              isOpen={String(openActionMenuId) === String(row.applicant.id)}
                              onToggle={() => setOpenActionMenuId((current) => String(current) === String(row.applicant.id) ? null : String(row.applicant.id))}
                              onClose={() => setOpenActionMenuId(null)}
                              onOpen={() => setSelectedId(row.applicant.id)}
                              onDownload={() => downloadApplicantDataZip(row)}
                              onDownloadData={() => downloadApplicantDataFile(row)}
                              onDelete={String(row.stage || row.applicant.status || "").toLowerCase() === "shortlisted" && onDeleteApplication ? () => handleDelete(row) : null}
                              downloadBusy={applicantBusy}
                              downloading={downloadingApplicantId === String(row.applicant.id)}
                              deleting={deleting}
                              includeOpenAction={!isShortlistView}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            </>
          )}

          {selected && (
            <ApplicantDetailModal
              row={selected}
              onSaveShortlistReview={onSaveShortlistReview}
              onClose={() => setSelectedId(null)}
              onDelete={onDeleteApplication ? () => handleDelete(selected) : null}
              onUpdatePhone={handlePhoneUpdate}
              deleting={deleting}
            />
          )}

          {deletePendingRow && (
            <PipedriveDeleteModal
              applicantName={deletePendingRow.applicant.name}
              busy={deleting}
              onCancel={() => setDeletePendingRow(null)}
              onDashboardOnly={async () => {
                const row = deletePendingRow;
                setDeletePendingRow(null);
                await executeDelete(row, false);
              }}
              onWithPipedrive={async () => {
                const row = deletePendingRow;
                setDeletePendingRow(null);
                await executeDelete(row, true);
              }}
            />
          )}
        </>
      )}

      {filtrationRunning && (
        <ApplicantFilterAnimation
          applicants={selectedPositionApplicants.map((row) => row.applicant)}
          onDone={finishAiFilter}
        />
      )}

      {notice && (
        <ApplicantsNoticeModal
          title={notice.title}
          body={notice.body}
          onClose={() => setNotice(null)}
        />
      )}

      {rejectionPendingId && (
        <RejectionReasonModal
          applicantName={(() => {
            const row = applicantsWithContext.find((r) => String(r.applicant.id) === rejectionPendingId);
            return row?.applicant?.name || "this applicant";
          })()}
          onConfirm={async ({ rejectionReasonId, rejectionNotes }) => {
            setStageDirectly(rejectionPendingId, "rejected");
            if (rejectionReasonId || rejectionNotes) {
              try {
                await window.HEYA_API.setApplicationRejectionReason(rejectionPendingId, { rejectionReasonId, rejectionNotes });
              } catch {}
            }
            setRejectionPendingId(null);
          }}
          onCancel={() => setRejectionPendingId(null)}
        />
      )}
    </div>
  );
}

function ApplicantRowActions({
  applicantName,
  isOpen,
  onToggle,
  onClose,
  onOpen,
  onDownload,
  onDownloadData,
  onDelete,
  downloadBusy,
  downloading,
  deleting,
  includeOpenAction = true
}) {
  return (
    <div className="row-actions applicant-row-actions" onClick={(event) => event.stopPropagation()}>
      <div className="applicant-row-action-box">
        <button
          className="btn ghost sm applicant-menu-trigger"
          type="button"
          onClick={onToggle}
          title="Applicant actions"
          aria-label={`More actions for ${applicantName || "this applicant"}`}
          aria-haspopup="menu"
          aria-expanded={Boolean(isOpen)}
        >
          <I.Dots />
        </button>
      </div>
      {isOpen && (
        <>
          <div className="menu">
            {includeOpenAction && <button className="menu-item applicant-menu-item" onClick={() => { onClose(); onOpen(); }}>Open</button>}
            <button
              className={"menu-item applicant-menu-item" + (downloadBusy ? " disabled" : "")}
              onClick={() => {
                if (downloadBusy) return;
                onClose();
                onDownload();
              }}
            >
              {downloading ? "Preparing download..." : "Download CV / Data"}
            </button>
            {onDownloadData && (
              <button
                className={"menu-item applicant-menu-item" + (downloadBusy ? " disabled" : "")}
                onClick={() => {
                  if (downloadBusy) return;
                  onClose();
                  onDownloadData();
                }}
              >
                Download data
              </button>
            )}
            {onDelete && <div className="menu-sep"></div>}
            {onDelete && (
              <button
                className={"menu-item applicant-menu-item danger" + (deleting ? " disabled" : "")}
                onClick={() => {
                  if (deleting) return;
                  onClose();
                  onDelete();
                }}
              >
                Delete applicant
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ShortlistedApplicantsList({
  rows,
  groups,
  viewMode,
  selectedApplicantId,
  openMenuApplicantId,
  onSelectApplicant,
  onOpenApplicant,
  onToggleMenu,
  onCloseMenu,
  onDelete,
  onDownloadApplicantDataZip,
  onDownloadApplicantDataFile,
  downloadingApplicantId,
  deleting,
  pushBusy,
  filtrationRunning,
  downloadBusy,
  onUpdateApplicantStatus
}) {
  if (viewMode === "positions") {
    return (
      <div className="shortlist-position-groups">
        {groups.map((group) => (
          <div key={group.key} className="card shortlist-position-group">
            <div className="shortlist-position-group__header">
              <div>
                <div className="card-title">{group.title}</div>
                <div className="mono shortlist-position-group__meta">
                  {group.rows.length} shortlisted applicant{group.rows.length === 1 ? "" : "s"}
                </div>
              </div>
            </div>
            <div className="shortlist-cards">
              {group.rows.map((row) => (
                <ShortlistedApplicantCard
                  key={row.applicant.id}
                  row={row}
                  selectedApplicantId={selectedApplicantId}
                  menuOpen={String(openMenuApplicantId) === String(row.applicant.id)}
                  onSelectApplicant={onSelectApplicant}
                  onOpenApplicant={onOpenApplicant}
                  onToggleMenu={onToggleMenu}
                  onCloseMenu={onCloseMenu}
                  onDelete={onDelete}
                  onDownloadApplicantDataZip={onDownloadApplicantDataZip}
                  onDownloadApplicantDataFile={onDownloadApplicantDataFile}
                  downloadingApplicantId={downloadingApplicantId}
                  deleting={deleting}
                  pushBusy={pushBusy}
                  filtrationRunning={filtrationRunning}
                  downloadBusy={downloadBusy}
                  onUpdateApplicantStatus={onUpdateApplicantStatus}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="shortlist-cards">
      {rows.map((row) => (
        <ShortlistedApplicantCard
          key={row.applicant.id}
          row={row}
          selectedApplicantId={selectedApplicantId}
          menuOpen={String(openMenuApplicantId) === String(row.applicant.id)}
          onSelectApplicant={onSelectApplicant}
          onOpenApplicant={onOpenApplicant}
          onToggleMenu={onToggleMenu}
          onCloseMenu={onCloseMenu}
          onDelete={onDelete}
          onDownloadApplicantDataZip={onDownloadApplicantDataZip}
          onDownloadApplicantDataFile={onDownloadApplicantDataFile}
          downloadingApplicantId={downloadingApplicantId}
          deleting={deleting}
          pushBusy={pushBusy}
          filtrationRunning={filtrationRunning}
          downloadBusy={downloadBusy}
          onUpdateApplicantStatus={onUpdateApplicantStatus}
        />
      ))}
    </div>
  );
}

function ShortlistedApplicantCard({
  row,
  selectedApplicantId,
  menuOpen,
  onSelectApplicant,
  onOpenApplicant,
  onToggleMenu,
  onCloseMenu,
  onDelete,
  onDownloadApplicantDataZip,
  onDownloadApplicantDataFile,
  downloadingApplicantId,
  deleting,
  pushBusy,
  filtrationRunning,
  downloadBusy,
  onUpdateApplicantStatus
}) {
  const applicantBusy = downloadBusy || pushBusy || filtrationRunning || downloadingApplicantId === String(row.applicant.id);
  const isSelected = String(selectedApplicantId) === String(row.applicant.id);

  return (
    <div className={"card shortlist-applicant-card" + (isSelected ? " is-selected" : "")}>
      <div className="shortlist-applicant-card__main">
        <label className="shortlist-select-control">
          <input
            type="radio"
            name="shortlist-selected-applicant"
            checked={isSelected}
            onChange={() => onSelectApplicant(row)}
            aria-label={`Select ${row.applicant.name || "applicant"} for inline shortlist review`}
          />
          <span>Select applicant</span>
        </label>

        <div>
          <div className="shortlist-applicant-card__name">{row.applicant.name || "Unnamed applicant"}</div>
          <div className="shortlist-applicant-card__meta">
            {row.position?.title || row.applicant.positionTitle || "Unknown position"}
          </div>
        </div>

        <div className="shortlist-applicant-card__details">
          <span className="status-badge status-ready">{stageLabel(row.stage)}</span>
          <span className="mono shortlist-meta-pill">{row.applicant.email || "No email provided"}</span>
          <span className="mono shortlist-meta-pill">Applied {row.applicant.appliedAt ? new Date(row.applicant.appliedAt).toLocaleDateString("en-PG", { day: "numeric", month: "short", year: "numeric" }) : "Unknown date"}</span>
          <span className="mono shortlist-meta-pill">Application ID {row.applicant.id}</span>
        </div>

        <div className="shortlist-applicant-card__stage">
          <label className="mono shortlist-stage-label" htmlFor={`shortlist-stage-${row.applicant.id}`}>Stage</label>
          <select
            id={`shortlist-stage-${row.applicant.id}`}
            className="stage-select shortlist-stage-select"
            value={row.stage}
            onChange={(event) => onUpdateApplicantStatus(row.applicant.id, event.target.value)}
          >
            {(window.APPLICANT_STATUSES || []).map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
          </select>
        </div>
      </div>

      <div className="shortlist-applicant-card__actions">
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => openApplicantCv(row.applicant)}
          disabled={!hasApplicantCv(row.applicant) || applicantBusy}
          title={hasApplicantCv(row.applicant) ? "Open CV" : "No CV uploaded"}
        >
          CV
        </button>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => openApplicantCoverLetterOrData(row)}
          disabled={!hasApplicantCoverLetterOrData(row) || applicantBusy}
          title={hasApplicantCoverLetterOrData(row) ? "Open supporting document or application data" : "No cover letter or extra data available"}
        >
          {getApplicantSupportActionLabel(row)}
        </button>
        <button
          type="button"
          className="btn accent sm shortlist-open-btn"
          onClick={() => onOpenApplicant(row)}
          disabled={applicantBusy}
        >
          Open
        </button>
        <ApplicantRowActions
          applicantName={row.applicant.name}
          isOpen={menuOpen}
          onToggle={() => onToggleMenu(row.applicant.id)}
          onClose={onCloseMenu}
          onOpen={() => onOpenApplicant(row)}
          onDownload={() => onDownloadApplicantDataZip(row)}
          onDownloadData={() => onDownloadApplicantDataFile(row)}
          onDelete={onDelete ? () => onDelete(row) : null}
          downloadBusy={applicantBusy}
          downloading={downloadingApplicantId === String(row.applicant.id)}
          deleting={deleting}
          includeOpenAction={false}
        />
      </div>
    </div>
  );
}

function ShortlistedApplicantWorkspace({ row, onBack, onDelete, deleting, onSaveShortlistReview, onUpdatePhone }) {
  const applicant = row.applicant;
  const position = row.position;
  const completeness = row.completeness || { missingReq: [], missingOpt: [] };
  const aiSummary = buildApplicantAiSummary(row);
  const condensedReport = buildApplicantCondensedReport(row);
  const submittedFields = collectApplicationFields(applicant);
  const uploadedDocuments = [
    { label: "CV / Resume", ok: Boolean(applicant.cvName || applicant.cvFile?.downloadUrl), value: applicant.cvName || applicant.cvFile?.name || "Missing", url: applicant.cvFile?.downloadUrl || null },
    { label: "Cover letter", ok: Boolean(applicant.coverLetterName || applicant.coverLetterFile?.downloadUrl || applicant.coverLetterText), value: applicant.coverLetterName || applicant.coverLetterFile?.name || (applicant.coverLetterText ? "Submitted in application form" : "Missing"), url: applicant.coverLetterFile?.downloadUrl || null },
    { label: "ID Photo", ok: Boolean(applicant.idPhotoFile?.downloadUrl), value: applicant.idPhotoFile?.name || (applicant.photo || applicant.imageUrl || applicant.avatarUrl ? "Provided (legacy)" : "Not provided"), url: applicant.idPhotoFile?.downloadUrl || null }
  ];
  const [shortlistReview, setShortlistReview] = React.useState(() => createShortlistReviewDraft(applicant.shortlistReview));
  const [savingShortlistReview, setSavingShortlistReview] = React.useState(false);
  const [shortlistError, setShortlistError] = React.useState("");
  const [generatedChecklistReport, setGeneratedChecklistReport] = React.useState(null);
  const [downloadingDocuments, setDownloadingDocuments] = React.useState(false);
  // ── Phone edit state
  const [phoneEdit, setPhoneEdit] = React.useState(applicant.phone || "");
  const [phoneSaving, setPhoneSaving] = React.useState(false);
  const [phoneSynced, setPhoneSynced] = React.useState(false);
  const phoneChanged = phoneEdit !== (applicant.phone || "");

  React.useEffect(() => { setPhoneEdit(applicant.phone || ""); }, [applicant.id, applicant.phone]);

  async function savePhone() {
    if (!onUpdatePhone) return;
    setPhoneSaving(true);
    try {
      const res = await onUpdatePhone(applicant.id, phoneEdit);
      if (res?.pdEnabled) { setPhoneSynced(true); window.setTimeout(() => setPhoneSynced(false), 3000); }
    } catch { /* silent */ }
    finally { setPhoneSaving(false); }
  }

  const missingDocuments = [
    ...new Set([...(completeness.missingReq || []), ...(completeness.missingOpt || [])])
  ];
  const reportPreview = React.useMemo(
    () => generatedChecklistReport || applicant.shortlistReport || buildShortlistChecklistPreview(row, shortlistReview),
    [generatedChecklistReport, applicant.shortlistReport, row, shortlistReview]
  );

  React.useEffect(() => {
    setShortlistReview(createShortlistReviewDraft(applicant.shortlistReview));
    setShortlistError("");
    setGeneratedChecklistReport(applicant.shortlistReport || null);
  }, [applicant.id, applicant.shortlistReview]);

  React.useEffect(() => {
    let active = true;
    window.HEYA_API.getShortlistedChecklist(applicant.id)
      .then((response) => {
        if (!active || !response?.checklist) return;
        const apiChecklist = response.checklist;
        setShortlistReview((current) => ({
          ...current,
          referenceChecksCompleted: Boolean(apiChecklist.referenceChecksCompleted),
          backgroundChecksCompleted: Boolean(apiChecklist.backgroundCheckCompleted),
          credentialVerificationCompleted: Boolean(apiChecklist.credentialVerificationCompleted),
          employmentHistoryVerified: Boolean(apiChecklist.employmentHistoryVerified),
          meetsMandatoryRequirements: Boolean(apiChecklist.requiredQualificationsConfirmed),
          finalInterviewCompleted: Boolean(apiChecklist.finalInterviewCompleted),
          practicalAssessmentCompleted: Boolean(apiChecklist.finalAssessmentCompleted),
          hiringManagerRecommendationIncluded: Boolean(apiChecklist.hiringManagerRecommendationCompleted),
          readyForBoardReview: Boolean(apiChecklist.readyForBoardReview),
          salaryExpectationsReviewed: Boolean(apiChecklist.salaryExpectationsReviewed),
          startDateConfirmed: Boolean(apiChecklist.availabilityConfirmed),
          finalHiringRecommendation: String(apiChecklist.finalRecommendation || "").toLowerCase().replace(/\s+/g, "-"),
          recruiterFinalNotes: apiChecklist.checklistNotes || current.recruiterFinalNotes || ""
        }));
        if (apiChecklist.generatedReport) {
          setGeneratedChecklistReport(apiChecklist.generatedReport);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, [applicant.id]);

  function updateShortlistField(key, value) {
    setShortlistReview((current) => ({ ...current, [key]: value }));
  }

  async function saveShortlistReview() {
    setSavingShortlistReview(true);
    setShortlistError("");
    try {
      const response = await window.HEYA_API.saveShortlistedChecklist(applicant.id, {
        applicantId: applicant.applicantId || applicant.userId || applicant.id,
        applicationId: applicant.applicationId || applicant.id,
        positionId: row.positionId,
        referenceChecksCompleted: Boolean(shortlistReview.referenceChecksCompleted),
        backgroundCheckCompleted: Boolean(shortlistReview.backgroundChecksCompleted),
        credentialVerificationCompleted: Boolean(shortlistReview.credentialVerificationCompleted),
        employmentHistoryVerified: Boolean(shortlistReview.employmentHistoryVerified),
        requiredQualificationsConfirmed: Boolean(shortlistReview.meetsMandatoryRequirements),
        finalInterviewCompleted: Boolean(shortlistReview.finalInterviewCompleted),
        finalAssessmentCompleted: Boolean(shortlistReview.practicalAssessmentCompleted),
        hiringManagerRecommendationCompleted: Boolean(shortlistReview.hiringManagerRecommendationIncluded),
        readyForBoardReview: Boolean(shortlistReview.readyForBoardReview),
        salaryExpectationsReviewed: Boolean(shortlistReview.salaryExpectationsReviewed),
        availabilityConfirmed: Boolean(shortlistReview.startDateConfirmed),
        finalRecommendation: shortlistReview.finalHiringRecommendation
          ? shortlistReview.finalHiringRecommendation.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
          : "",
        checklistNotes: shortlistReview.recruiterFinalNotes || ""
      });
      if (response?.generatedReport) {
        setGeneratedChecklistReport(response.generatedReport);
      }
      if (onSaveShortlistReview) {
        await onSaveShortlistReview(applicant.id, { shortlistReview });
      }
    } catch (error) {
      setShortlistError(error.message || "Unable to save shortlist review right now.");
    } finally {
      setSavingShortlistReview(false);
    }
  }

  function downloadApplicantDocuments() {
    if (!hasApplicantFiles(applicant)) return;
    setDownloadingDocuments(true);
    try {
      window.HEYA_API.downloadApplicationZip(applicant.id);
    } finally {
      setDownloadingDocuments(false);
    }
  }

  return (
    <div className="shortlist-inline-workspace">
      <div className="shortlist-inline-toolbar">
        <div className="shortlist-inline-toolbar__nav">
          <button className="btn primary sm" onClick={onBack}>Back to Shortlisted Applicants</button>
        </div>
        <div className="shortlist-inline-toolbar__actions">
          <button className="btn ghost sm" onClick={() => openApplicantCv(applicant)} disabled={!hasApplicantCv(applicant)}>CV</button>
          <button className="btn ghost sm" onClick={() => openApplicantCoverLetterOrData(row)} disabled={!hasApplicantCoverLetterOrData(row)}>
            {getApplicantSupportActionLabel(row)}
          </button>
          <button className="btn ghost sm" onClick={downloadApplicantDocuments} disabled={!hasApplicantFiles(applicant) || downloadingDocuments}>
            {downloadingDocuments ? "Preparing..." : "Download CV / Data"}
          </button>
          {onDelete && <button className="btn accent sm" onClick={onDelete} disabled={deleting}>{deleting ? "Deleting..." : "Delete applicant"}</button>}
        </div>
      </div>

      <div className="shortlist-inline-grid">
        <div className="shortlist-inline-column">
          <div className="card shortlist-inline-card">
            <div className="spread" style={{ alignItems: "flex-start", gap: 16 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <ApplicantPhoto applicant={applicant} />
                <div>
                  <div className="mono eyebrow">Applicant report</div>
                  <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{applicant.name || "Unnamed applicant"}</div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>{position?.title || applicant.positionTitle || "Unknown position"}</div>
                  <div style={{ marginTop: 10 }}>
                    <span className="status-badge status-screening">{stageLabel(row.stage)}</span>
                  </div>
                </div>
              </div>
              {applicant.shortlistReviewSavedAt && (
                <span className="status-badge tag-complete">Saved {new Date(applicant.shortlistReviewSavedAt).toLocaleString("en-PG")}</span>
              )}
            </div>

            <div className="grid cols-2" style={{ gap: 10, marginTop: 18 }}>
              <ApplicantKV k="Application code" v={applicant.applicationCode || "Not captured"} />
              <ApplicantKV k="Applied" v={applicant.appliedAt ? new Date(applicant.appliedAt).toLocaleDateString("en-PG", { day: "numeric", month: "short", year: "numeric" }) : "Not captured"} />
              <ApplicantKV k="Email" v={applicant.email || "Not provided"} />
              <div className="applicant-kv">
                <div className="mono eyebrow applicant-kv__key">Phone</div>
                <div className="applicant-kv__val applicant-phone-edit">
                  <input
                    className="ifield applicant-phone-field"
                    type="text"
                    value={phoneEdit}
                    onChange={(e) => setPhoneEdit(e.target.value)}
                    placeholder="Not provided"
                  />
                  {phoneChanged && (
                    <button className="btn sm" onClick={savePhone} disabled={phoneSaving}>
                      {phoneSaving ? "Saving…" : "Save"}
                    </button>
                  )}
                  {phoneSynced && <span className="pd-sync-tag">✓ Synced to Pipedrive</span>}
                </div>
              </div>
              <ApplicantKV k="Experience" v={applicant.yearsExperience || "Not captured"} />
              <ApplicantKV k="Current location" v={applicant.currentLocation || "Not captured"} />
              <ApplicantKV k="Company" v={applicant.companyName || position?.client || "Not captured"} />
              <ApplicantKV k="Application ID" v={applicant.id || "Not linked"} />
              <ApplicantKV k="Position ID" v={row.positionId || "Not linked"} />
            </div>

            {/* Pipedrive deep-links */}
            {(applicant.pipedrivePersonId || applicant.pipedriveDealId) && (
              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                {applicant.pipedrivePersonId && (
                  <a
                    href={`https://app.pipedrive.com/person/${applicant.pipedrivePersonId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn"
                    style={{ fontSize: 12, padding: "4px 12px", display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <img src="https://play-lh.googleusercontent.com/XAKratCqSJUb3ZmItve16p8RjiF0ZvN_czysEoqtGET7i-tsdJEozbnOYRM6jQNHEg=w32-h32" alt="" style={{ width: 14, height: 14 }} />
                    View in Pipedrive (Contact)
                  </a>
                )}
                {applicant.pipedriveDealId && (
                  <a
                    href={`https://app.pipedrive.com/deal/${applicant.pipedriveDealId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn"
                    style={{ fontSize: 12, padding: "4px 12px", display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <img src="https://play-lh.googleusercontent.com/XAKratCqSJUb3ZmItve16p8RjiF0ZvN_czysEoqtGET7i-tsdJEozbnOYRM6jQNHEg=w32-h32" alt="" style={{ width: 14, height: 14 }} />
                    View in Pipedrive (Deal)
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="card shortlist-inline-card">
            <div className="card-title" style={{ marginBottom: 10 }}>Document status</div>
            <div className="grid cols-2" style={{ gap: 18 }}>
              <div>
                <div className="mono eyebrow" style={{ marginBottom: 8 }}>Uploaded documents</div>
                <ChecklistList items={uploadedDocuments} />
              </div>
              <div>
                <div className="mono eyebrow" style={{ marginBottom: 8 }}>Missing documents</div>
                {missingDocuments.length === 0 ? (
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>No missing items detected for this application.</div>
                ) : (
                  <ChecklistList items={missingDocuments.map((label) => ({ label, ok: false, value: "Missing" }))} />
                )}
              </div>
            </div>
          </div>

          <div className="card shortlist-inline-card">
            <div className="card-title" style={{ marginBottom: 10 }}>Application form submission</div>
            {submittedFields.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>No extra application fields were captured for this applicant.</div>
            ) : (
              <div className="grid cols-2" style={{ gap: 10 }}>
                {submittedFields.map((field) => <ApplicantKV key={field.key} k={field.label} v={field.value} />)}
              </div>
            )}
          </div>

          <div className="card shortlist-inline-card">
            <div className="card-title" style={{ marginBottom: 10 }}>Basic AI-generated applicant summary</div>
            <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{aiSummary}</div>
          </div>

          <div className="card shortlist-inline-card">
            <div className="card-title" style={{ marginBottom: 10 }}>Condensed generated report</div>
            <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{condensedReport}</div>
          </div>
        </div>

        <div className="shortlist-inline-column">
          <div className="card shortlist-inline-card shortlist-inline-sticky">
            <div className="spread" style={{ marginBottom: 12, alignItems: "flex-start" }}>
              <div>
                <div className="card-title">Shortlisted Applicant Final Checklist</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                  Complete the final review, save it to the applicant record, and keep the generated checklist report with the shortlist file.
                </div>
              </div>
            </div>
            <ShortlistReviewForm review={shortlistReview} onChange={updateShortlistField} />
            {shortlistError && <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 10 }}>{shortlistError}</div>}
            <div className="cluster" style={{ justifyContent: "flex-end", marginTop: 14 }}>
              <button className="btn accent" onClick={saveShortlistReview} disabled={savingShortlistReview}>
                {savingShortlistReview ? "Saving..." : "Save final checklist"}
              </button>
            </div>
          </div>

          <div className="card shortlist-inline-card">
            <div className="spread" style={{ alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div className="card-title">Generated checklist report</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                  {applicant.shortlistReport ? "Saved backend report" : "Live preview based on the current checklist"}
                </div>
              </div>
              {reportPreview?.completion && (
                <span className="status-badge status-ready">{reportPreview.completion.completed}/{reportPreview.completion.total}</span>
              )}
            </div>
            <ShortlistChecklistReport report={reportPreview} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Application history / duplicate detection (Item 9) ─────────────────── */
function ApplicantApplicationHistory({ applicantId }) {
  const [history, setHistory]   = React.useState(null);
  const [loading, setLoading]   = React.useState(false);
  const [error, setError]       = React.useState("");
  const [open, setOpen]         = React.useState(false);

  React.useEffect(() => {
    if (!open || history !== null) return;
    setLoading(true);
    window.HEYA_API.getApplicationEmailHistory(applicantId)
      .then((resp) => { setHistory(resp.history || []); setLoading(false); })
      .catch((err) => { setError(err.message || "Failed to load history."); setLoading(false); });
  }, [applicantId, open, history]);

  const hasHistory = history && history.length > 0;

  return (
    <div className="card" style={{ padding: 16, marginTop: 18 }}>
      <button
        type="button"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", cursor: "pointer", width: "100%", padding: 0, textAlign: "left" }}
        onClick={() => setOpen((v) => !v)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="card-title" style={{ margin: 0 }}>Application history</div>
          {hasHistory && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 20, background: "#FBF1DC", color: "#9A6A0E", border: "1px solid #fcd34d" }}>
              ⚠ {history.length} other application{history.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{open ? "▲ hide" : "▼ show"}</span>
      </button>
      {open && (
        <div style={{ marginTop: 14 }}>
          {loading && <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading...</div>}
          {error && <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div>}
          {!loading && !error && history !== null && history.length === 0 && (
            <div style={{ color: "var(--muted)", fontSize: 13 }}>First application from this email address.</div>
          )}
          {!loading && hasHistory && (
            <div className="card flush" style={{ marginTop: 4 }}>
              <table className="pos-table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>Position</th>
                    <th>Stage</th>
                    <th>Applied</th>
                    <th>Last updated</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((entry) => {
                    const isRejected = String(entry.status || "").toLowerCase() === "rejected";
                    const isHired    = String(entry.status || "").toLowerCase() === "hired";
                    return (
                      <tr key={entry.id}>
                        <td style={{ fontWeight: 500 }}>{entry.position_title || "Unknown position"}</td>
                        <td>
                          <span className={"status-badge " + (isHired ? "status-ready" : isRejected ? "status-rejected" : "status-screening")}>
                            {entry.status || "unknown"}
                          </span>
                        </td>
                        <td className="mono" style={{ color: "var(--muted)" }}>
                          {entry.created_at ? new Date(entry.created_at).toLocaleDateString("en-PG") : "—"}
                        </td>
                        <td className="mono" style={{ color: "var(--muted)" }}>
                          {entry.updated_at ? new Date(entry.updated_at).toLocaleDateString("en-PG") : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Rejection reason modal ───────────────────────────────────────────────── */
function RejectionReasonModal({ applicantName, onConfirm, onCancel }) {
  const [reasons, setReasons] = React.useState([]);
  const [selectedReason, setSelectedReason] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    window.HEYA_API.getRejectionReasons()
      .then((resp) => { setReasons(resp.reasons || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  async function handleConfirm() {
    setSaving(true);
    setError("");
    try {
      await onConfirm({ rejectionReasonId: selectedReason || null, rejectionNotes: notes });
    } catch (err) {
      setError(err.message || "Failed to save rejection reason.");
      setSaving(false);
    }
  }

  return (
    <div className="publish-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <div className="confirm-modal">
        <div className="publish-eyebrow">Rejecting applicant</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 20, marginTop: 4, marginBottom: 14 }}>{applicantName}</div>
        {loading ? (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading rejection reasons...</div>
        ) : (
          <>
            <div className="mono eyebrow" style={{ marginBottom: 6 }}>Rejection reason</div>
            <select className="ifield" style={{ width: "100%", marginBottom: 12 }} value={selectedReason} onChange={(event) => setSelectedReason(event.target.value)}>
              <option value="">— Select a reason (optional) —</option>
              {reasons.map((r) => <option key={r.id} value={r.id}>{r.description}</option>)}
            </select>
            <div className="mono eyebrow" style={{ marginBottom: 6 }}>Notes (optional)</div>
            <textarea
              className="ifield"
              style={{ width: "100%", resize: "vertical", minHeight: 72, fontFamily: "inherit" }}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Additional context about the rejection..."
            />
          </>
        )}
        {error && <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 8 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn" onClick={onCancel} disabled={saving}>Cancel</button>
          <button className="btn accent" onClick={handleConfirm} disabled={saving || loading}>
            {saving ? "Saving..." : "Confirm rejection"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Stage history timeline ──────────────────────────────────────────────── */
const STAGE_COLORS = {
  new: "#6c757d", applied: "#6c757d", screening: "#2B8FD4",
  shortlisted: "#3D6EF5", interview: "#7A5AF0",
  offer: "#C98A12", hired: "#1FA45E", rejected: "#E0556B"
};

function ApplicantStageHistory({ applicantId }) {
  const [history, setHistory] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open || history !== null) return;
    setLoading(true);
    window.HEYA_API.getApplicationStageHistory(applicantId)
      .then((resp) => { setHistory(resp.history || []); setLoading(false); })
      .catch((err) => { setError(err.message || "Failed to load stage history."); setLoading(false); });
  }, [applicantId, open, history]);

  return (
    <div className="card" style={{ padding: 16, marginTop: 18 }}>
      <button
        type="button"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", cursor: "pointer", width: "100%", padding: 0, textAlign: "left" }}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="card-title" style={{ margin: 0 }}>Stage history</div>
        <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{open ? "▲ hide" : "▼ show"}</span>
      </button>
      {open && (
        <div style={{ marginTop: 14 }}>
          {loading && <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading...</div>}
          {error && <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div>}
          {!loading && !error && history !== null && history.length === 0 && (
            <div style={{ color: "var(--muted)", fontSize: 13 }}>No stage changes recorded yet.</div>
          )}
          {!loading && history && history.length > 0 && (
            <div className="stage-timeline">
              {history.map((entry, index) => (
                <div key={entry.id || index} className="stage-timeline-entry">
                  <div className="stage-timeline-line" />
                  <div className="stage-timeline-dot" style={{ background: STAGE_COLORS[entry.to_stage] || "#999" }} />
                  <div className="stage-timeline-content">
                    <div style={{ fontWeight: 500, fontSize: 13 }}>
                      {entry.from_stage ? <span style={{ color: "var(--muted)" }}>{stageLabel(entry.from_stage)} → </span> : null}
                      <span style={{ color: STAGE_COLORS[entry.to_stage] || "inherit" }}>{stageLabel(entry.to_stage)}</span>
                    </div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                      {entry.changed_at ? new Date(entry.changed_at).toLocaleString("en-PG") : ""}
                      {entry.reason ? ` · ${entry.reason}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── File verification badges ────────────────────────────────────────────── */
const FILE_VERIFICATION_STATUSES = [
  { id: "pending_review",     label: "Pending Review",     color: "#C98A12" },
  { id: "valid",              label: "Valid",               color: "#1FA45E" },
  { id: "invalid",            label: "Invalid",             color: "#E0556B" },
  { id: "expired",            label: "Expired",             color: "#6b7280" },
  { id: "needs_resubmission", label: "Needs Resubmission",  color: "#7A5AF0" }
];

function ApplicantFilesVerification({ applicantId }) {
  const [files, setFiles] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [updatingId, setUpdatingId] = React.useState(null);

  React.useEffect(() => {
    setLoading(true);
    setFiles(null);
    setError("");
    window.HEYA_API.getApplicationFiles(applicantId)
      .then((resp) => { setFiles(resp.files || []); setLoading(false); })
      .catch((err) => { setError(err.message || "Failed to load files."); setLoading(false); });
  }, [applicantId]);

  async function handleVerificationChange(fileId, verificationStatus) {
    setUpdatingId(String(fileId));
    try {
      await window.HEYA_API.updateFileVerification(fileId, { verificationStatus });
      setFiles((current) => (current || []).map((f) =>
        String(f.id) === String(fileId) ? { ...f, verification_status: verificationStatus } : f
      ));
    } catch {}
    finally { setUpdatingId(null); }
  }

  if (loading) return <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading files...</div>;
  if (error) return <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div>;
  if (!files || files.length === 0) return <div style={{ color: "var(--muted)", fontSize: 13 }}>No files found for this application.</div>;

  return (
    <div className="stack" style={{ gap: 10 }}>
      {files.map((file) => {
        const info = FILE_VERIFICATION_STATUSES.find((s) => s.id === (file.verification_status || "pending_review")) || FILE_VERIFICATION_STATUSES[0];
        const busy = updatingId === String(file.id);
        return (
          <div key={file.id} className="file-verification-row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {file.original_name || file.stored_name || "Unknown file"}
              </div>
              <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                {file.file_type || "file"}{file.mime_type ? ` · ${file.mime_type}` : ""}
                {file.verified_at ? ` · verified ${new Date(file.verified_at).toLocaleDateString("en-PG")}` : ""}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <span className="file-verification-badge" style={{ background: info.color + "18", color: info.color, border: `1px solid ${info.color}44` }}>
                {info.label}
              </span>
              <select
                className="ifield"
                style={{ fontSize: 11, padding: "3px 6px", height: "auto", width: "auto" }}
                value={file.verification_status || "pending_review"}
                disabled={busy}
                onChange={(event) => handleVerificationChange(file.id, event.target.value)}
              >
                {FILE_VERIFICATION_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Offer detail panel ──────────────────────────────────────────────────── */
const OFFER_STATUS_COLORS = {
  pending: "#C98A12", sent: "#2B8FD4", accepted: "#1FA45E",
  rejected: "#E0556B", expired: "#6b7280", withdrawn: "#6b7280", closed: "#6b7280"
};

function ApplicantOfferPanel({ applicantId }) {
  const [offers, setOffers] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open || offers !== null) return;
    setLoading(true);
    window.HEYA_API.getApplicationOffers(applicantId)
      .then((resp) => { setOffers(resp.offers || []); setLoading(false); })
      .catch((err) => { setError(err.message || "Failed to load offer data."); setLoading(false); });
  }, [applicantId, open, offers]);

  return (
    <div className="card" style={{ padding: 16, marginTop: 18 }}>
      <button
        type="button"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", cursor: "pointer", width: "100%", padding: 0, textAlign: "left" }}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="card-title" style={{ margin: 0 }}>Offer details</div>
        <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{open ? "▲ hide" : "▼ show"}</span>
      </button>
      {open && (
        <div style={{ marginTop: 14 }}>
          {loading && <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading...</div>}
          {error && <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div>}
          {!loading && !error && offers !== null && offers.length === 0 && (
            <div style={{ color: "var(--muted)", fontSize: 13 }}>No offer records found for this applicant.</div>
          )}
          {!loading && offers && offers.map((offer) => {
            const statusColor = OFFER_STATUS_COLORS[offer.offer_status] || "#999";
            const historyEntries = (() => { try { return JSON.parse(offer.history_json || "[]"); } catch { return []; } })();
            return (
              <div key={offer.id} className="offer-panel-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Offer #{offer.id}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: statusColor + "18", color: statusColor, border: `1px solid ${statusColor}44` }}>
                    {offer.offer_status}
                  </span>
                </div>
                <div className="grid cols-2" style={{ gap: 8 }}>
                  <ApplicantKV k="Issued" v={offer.issued_at ? new Date(offer.issued_at).toLocaleDateString("en-PG") : "Not set"} />
                  <ApplicantKV k="Expires" v={offer.expires_at ? new Date(offer.expires_at).toLocaleDateString("en-PG") : "Not set"} />
                  <ApplicantKV k="Proposed start" v={offer.proposed_start || "Not set"} />
                  <ApplicantKV k="Response" v={offer.responded_at ? new Date(offer.responded_at).toLocaleDateString("en-PG") : "Awaiting"} />
                </div>
                {offer.salary_notes && <div style={{ marginTop: 8, fontSize: 12, color: "var(--ink-2)" }}><strong>Salary:</strong> {offer.salary_notes}</div>}
                {offer.notes && <div style={{ marginTop: 6, fontSize: 12, color: "var(--ink-2)" }}><strong>Notes:</strong> {offer.notes}</div>}
                {historyEntries.length > 0 && (
                  <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                    <div className="mono eyebrow" style={{ marginBottom: 6 }}>Status history</div>
                    {historyEntries.map((entry, i) => (
                      <div key={i} className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                        {entry.status} — {entry.at ? new Date(entry.at).toLocaleString("en-PG") : ""}
                        {entry.reason ? ` · ${entry.reason}` : ""}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ApplicantDetailModal({ row, onClose, onDelete, deleting, onSaveShortlistReview, onUpdatePhone }) {
  const applicant = row.applicant;
  const position = row.position;
  const completeness = row.completeness || { missingReq: [], missingOpt: [] };
  const aiSummary = buildApplicantAiSummary(row);
  const condensedReport = buildApplicantCondensedReport(row);
  const isShortlistedApplicant = String(row.stage || applicant.status || "").toLowerCase() === "shortlisted";
  const submittedFields = collectApplicationFields(applicant);
  const uploadedDocuments = [
    { label: "CV / Resume", ok: Boolean(applicant.cvName || applicant.cvFile?.downloadUrl), value: applicant.cvName || applicant.cvFile?.name || "Missing", url: applicant.cvFile?.downloadUrl || null },
    { label: "Cover letter", ok: Boolean(applicant.coverLetterName || applicant.coverLetterFile?.downloadUrl || applicant.coverLetterText), value: applicant.coverLetterName || applicant.coverLetterFile?.name || (applicant.coverLetterText ? "Submitted in application form" : "Missing"), url: applicant.coverLetterFile?.downloadUrl || null },
    { label: "ID Photo", ok: Boolean(applicant.idPhotoFile?.downloadUrl), value: applicant.idPhotoFile?.name || (applicant.photo || applicant.imageUrl || applicant.avatarUrl ? "Provided (legacy)" : "Not provided"), url: applicant.idPhotoFile?.downloadUrl || null }
  ];
  const [shortlistReview, setShortlistReview] = React.useState(() => createShortlistReviewDraft(applicant.shortlistReview));
  const [savingShortlistReview, setSavingShortlistReview] = React.useState(false);
  const [shortlistError, setShortlistError] = React.useState("");
  const [downloadingDocuments, setDownloadingDocuments] = React.useState(false);
  // ── Phone edit state
  const [phoneEdit, setPhoneEdit] = React.useState(applicant.phone || "");
  const [phoneSaving, setPhoneSaving] = React.useState(false);
  const [phoneSynced, setPhoneSynced] = React.useState(false);
  const phoneChanged = phoneEdit !== (applicant.phone || "");

  React.useEffect(() => { setPhoneEdit(applicant.phone || ""); }, [applicant.id, applicant.phone]);

  async function savePhone() {
    if (!onUpdatePhone) return;
    setPhoneSaving(true);
    try {
      const res = await onUpdatePhone(applicant.id, phoneEdit);
      if (res?.pdEnabled) { setPhoneSynced(true); window.setTimeout(() => setPhoneSynced(false), 3000); }
    } catch { /* silent */ }
    finally { setPhoneSaving(false); }
  }

  const missingDocuments = [
    ...new Set([...(completeness.missingReq || []), ...(completeness.missingOpt || [])])
  ];

  React.useEffect(() => {
    setShortlistReview(createShortlistReviewDraft(applicant.shortlistReview));
    setShortlistError("");
  }, [applicant.id, applicant.shortlistReview]);

  React.useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function updateShortlistField(key, value) {
    setShortlistReview((current) => ({ ...current, [key]: value }));
  }

  async function saveShortlistReview() {
    if (!onSaveShortlistReview) return;
    setSavingShortlistReview(true);
    setShortlistError("");
    try {
      await onSaveShortlistReview(applicant.id, { shortlistReview });
    } catch (error) {
      setShortlistError(error.message || "Unable to save shortlist review right now.");
    } finally {
      setSavingShortlistReview(false);
    }
  }

  function downloadApplicantDocuments() {
    if (!hasApplicantFiles(applicant)) return;
    setDownloadingDocuments(true);
    try {
      window.HEYA_API.downloadApplicationZip(applicant.id);
    } finally {
      setDownloadingDocuments(false);
    }
  }

  return (
    <div className="publish-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="edit-modal" style={{ maxWidth: 920 }}>
        <div className="edit-modal-head">
          <div>
            <div className="mono eyebrow">Applicant report</div>
            <div className="edit-modal-title">{applicant.name}</div>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close">x</button>
        </div>
        <div className="edit-modal-body">
          <div className="grid cols-2" style={{ gap: 18, alignItems: "start" }}>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <ApplicantPhoto applicant={applicant} />
                <div>
                  <div style={{ fontSize: 20, fontWeight: 600 }}>{applicant.name || "Unnamed applicant"}</div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{position?.title || applicant.positionTitle || "Unknown position"}</div>
                  <div style={{ marginTop: 10 }}>
                    <span className="status-badge status-screening">{stageLabel(row.stage)}</span>
                  </div>
                </div>
              </div>

              <div className="grid cols-2" style={{ gap: 10, marginTop: 16 }}>
                <ApplicantKV k="Application code" v={applicant.applicationCode || "Not captured"} />
                <ApplicantKV k="Applied" v={applicant.appliedAt ? new Date(applicant.appliedAt).toLocaleDateString("en-PG", { day: "numeric", month: "short", year: "numeric" }) : "Not captured"} />
                <ApplicantKV k="Experience" v={applicant.yearsExperience || "Not captured"} />
                <ApplicantKV k="Current location" v={applicant.currentLocation || "Not captured"} />
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div className="card-title" style={{ marginBottom: 10 }}>Contact details</div>
              <div className="grid cols-2" style={{ gap: 10 }}>
                <ApplicantKV k="Email" v={applicant.email || "Not provided"} />
                <div className="applicant-kv">
                  <div className="mono eyebrow applicant-kv__key">Phone</div>
                  <div className="applicant-kv__val applicant-phone-edit">
                    <input
                      className="ifield applicant-phone-field"
                      type="text"
                      value={phoneEdit}
                      onChange={(e) => setPhoneEdit(e.target.value)}
                      placeholder="Not provided"
                    />
                    {phoneChanged && (
                      <button className="btn sm" onClick={savePhone} disabled={phoneSaving}>
                        {phoneSaving ? "Saving…" : "Save"}
                      </button>
                    )}
                    {phoneSynced && <span className="pd-sync-tag">✓ Synced to Pipedrive</span>}
                  </div>
                </div>
                <ApplicantKV k="Company" v={applicant.companyName || position?.client || "Not captured"} />
                <ApplicantKV k="Position ID" v={row.positionId || "Not linked"} />
              </div>
              {(applicant.pipedrivePersonId || applicant.pipedriveDealId) && (
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  {applicant.pipedrivePersonId && (
                    <a href={`https://app.pipedrive.com/person/${applicant.pipedrivePersonId}`} target="_blank" rel="noopener noreferrer"
                      className="btn" style={{ fontSize: 11, padding: "3px 10px" }}>
                      Pipedrive Contact
                    </a>
                  )}
                  {applicant.pipedriveDealId && (
                    <a href={`https://app.pipedrive.com/deal/${applicant.pipedriveDealId}`} target="_blank" rel="noopener noreferrer"
                      className="btn" style={{ fontSize: 11, padding: "3px 10px" }}>
                      Pipedrive Deal
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid cols-2" style={{ gap: 18, marginTop: 18 }}>
            {isShortlistedApplicant && (
              <div className="card" style={{ padding: 16, gridColumn: "1 / -1" }}>
                <div className="spread" style={{ marginBottom: 12, alignItems: "flex-start" }}>
                  <div>
                    <div className="card-title">Shortlisted applicant final checklist</div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                      Save the final verification, panel pack, and hiring recommendation to the applicant record before final decision.
                    </div>
                  </div>
                  {applicant.shortlistReviewSavedAt && (
                    <span className="status-badge tag-complete">Saved {new Date(applicant.shortlistReviewSavedAt).toLocaleString("en-PG")}</span>
                  )}
                </div>
                <ShortlistReviewForm review={shortlistReview} onChange={updateShortlistField} />
                {shortlistError && <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 10 }}>{shortlistError}</div>}
                <div className="cluster" style={{ justifyContent: "flex-end", marginTop: 14 }}>
                  <button className="btn accent" onClick={saveShortlistReview} disabled={savingShortlistReview}>
                    {savingShortlistReview ? "Saving..." : "Save shortlist checklist"}
                  </button>
                </div>
              </div>
            )}

            <div className="card" style={{ padding: 16 }}>
              <div className="card-title" style={{ marginBottom: 10 }}>Uploaded documents checklist</div>
              <ChecklistList items={uploadedDocuments} />
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div className="card-title" style={{ marginBottom: 10 }}>Missing documents checklist</div>
              {missingDocuments.length === 0 ? (
                <div style={{ color: "var(--muted)", fontSize: 13 }}>No missing items detected for this application.</div>
              ) : (
                <ChecklistList items={missingDocuments.map((label) => ({ label, ok: false, value: "Missing" }))} />
              )}
            </div>
          </div>

          <div className="grid cols-2" style={{ gap: 18, marginTop: 18 }}>
            <div className="card" style={{ padding: 16 }}>
              <div className="card-title" style={{ marginBottom: 10 }}>Application files</div>
              <ApplicantFilesVerification applicantId={applicant.id} />
              <div className="cluster" style={{ marginTop: 14 }}>
                <button
                  className="btn ghost sm"
                  onClick={downloadApplicantDocuments}
                  disabled={!hasApplicantFiles(applicant) || downloadingDocuments}
                >
                  {downloadingDocuments ? "Preparing..." : "Download CV / Data"}
                </button>
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div className="card-title" style={{ marginBottom: 10 }}>Application form submission</div>
              {submittedFields.length === 0 ? (
                <div style={{ color: "var(--muted)", fontSize: 13 }}>No extra application fields were captured for this applicant.</div>
              ) : (
                <div className="grid cols-2" style={{ gap: 10 }}>
                  {submittedFields.map((field) => <ApplicantKV key={field.key} k={field.label} v={field.value} />)}
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ padding: 16, marginTop: 18 }}>
            <div className="card-title" style={{ marginBottom: 10 }}>Basic AI-generated applicant summary</div>
            <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{aiSummary}</div>
          </div>

          <div className="card" style={{ padding: 16, marginTop: 18 }}>
            <div className="card-title" style={{ marginBottom: 10 }}>Condensed generated report</div>
            <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{condensedReport}</div>
          </div>

          <ApplicantApplicationHistory applicantId={applicant.id} />
          <ApplicantStageHistory applicantId={applicant.id} />
          <ApplicantOfferPanel applicantId={applicant.id} />
        </div>
        <div className="edit-modal-foot">
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Deleting this record removes only this application and its files.</span>
          <div className="cluster">
            <button className="btn" onClick={onClose}>Close</button>
            {onDelete && <button className="btn accent" onClick={onDelete} disabled={deleting}>{deleting ? "Deleting..." : "Delete application"}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ApplicantsNoticeModal({ title, body, onClose }) {
  React.useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="publish-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="confirm-modal">
        <div className="publish-eyebrow">Heads up</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 22, marginTop: 4, marginBottom: 12 }}>{title}</div>
        <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55 }}>{body}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button className="btn accent" onClick={onClose}>OK</button>
        </div>
      </div>
    </div>
  );
}

function ApplicantFilterAnimation({ applicants, onDone }) {
  const [step, setStep] = React.useState(0);
  const steps = [
    "Resolving the selected position...",
    "Checking applicant documents for this position...",
    "Reviewing CV/data completeness...",
    "Organizing the selected applicant list...",
    "Saving the backup filtration order..."
  ];

  React.useEffect(() => {
    if (step < steps.length) {
      const timer = window.setTimeout(() => setStep((current) => current + 1), 360);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(onDone, 700);
    return () => window.clearTimeout(timer);
  }, [step, onDone]);

  return (
    <div className="publish-scrim">
      <div className="publish-modal">
        <div className="publish-eyebrow">AI Filter</div>
        <div className="publish-title">Re-checking {applicants.length} applicant{applicants.length === 1 ? "" : "s"} for the selected position</div>
        <div className="publish-list">
          {steps.map((label, index) => (
            <div key={label} className={"publish-step" + (index < step ? " done" : index === step ? " active" : "")}>
              <span className={"check-box" + (index < step ? " done" : "")}>
                {index < step && <I.Check />}
                {index === step && <span className="spinner" />}
              </span>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <div className="ai-disclaimer" style={{ marginTop: 16 }}>
          This backup filter only organizes applicants for the selected position. Final decisions stay with a human reviewer.
        </div>
      </div>
    </div>
  );
}

function ApplicantPhoto({ applicant }) {
  const photoUrl = applicant.idPhotoFile?.downloadUrl || applicant.photo || applicant.imageUrl || applicant.avatarUrl || "";
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={applicant.name || "Applicant"}
        style={{ width: 72, height: 72, borderRadius: 18, objectFit: "cover", border: "1px solid var(--line)" }}
      />
    );
  }

  const initials = String(applicant.name || "Applicant")
    .split(/\s+/)
    .map((part) => part[0] || "")
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div style={{
      width: 72,
      height: 72,
      borderRadius: 18,
      display: "grid",
      placeItems: "center",
      background: "linear-gradient(135deg, #f7d7bf, #f2b38d)",
      color: "#7a2f0b",
      fontWeight: 700,
      border: "1px solid var(--line)"
    }}>
      {initials || "A"}
    </div>
  );
}

function ChecklistList({ items }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      {items.map((item) => (
        <div key={item.label} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span className={"check-box small" + (item.ok ? " done" : "")} style={{ marginTop: 2 }}>
            {item.ok && <I.Check />}
          </span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{item.label}</div>
            <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
              {item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>{item.value}</a> : item.value}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ApplicantKV({ k, v }) {
  return (
    <div className="kv">
      <div className="kv-k">{k}</div>
      <div className="kv-v">{v || "Not provided"}</div>
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

function createShortlistReviewDraft(review = {}) {
  return {
    referenceChecksCompleted: Boolean(review?.referenceChecksCompleted),
    backgroundCheckRequired: Boolean(review?.backgroundCheckRequired),
    backgroundChecksCompleted: Boolean(review?.backgroundChecksCompleted),
    credentialVerificationCompleted: Boolean(review?.credentialVerificationCompleted),
    employmentHistoryVerified: Boolean(review?.employmentHistoryVerified),
    certificationsConfirmed: Boolean(review?.certificationsConfirmed),
    riskFlagsDocumented: Boolean(review?.riskFlagsDocumented),
    riskFlagsSummary: review?.riskFlagsSummary || "",
    meetsMandatoryRequirements: Boolean(review?.meetsMandatoryRequirements),
    meetsPreferredQualifications: Boolean(review?.meetsPreferredQualifications),
    finalInterviewCompleted: Boolean(review?.finalInterviewCompleted),
    practicalAssessmentCompleted: Boolean(review?.practicalAssessmentCompleted),
    behavioralAssessmentCompleted: Boolean(review?.behavioralAssessmentCompleted),
    technicalAssessmentCompleted: Boolean(review?.technicalAssessmentCompleted),
    finalAssessmentScore: review?.finalAssessmentScore ?? "",
    finalAssessmentRecommendation: review?.finalAssessmentRecommendation || "",
    profilePrepared: Boolean(review?.profilePrepared),
    resumeAttached: Boolean(review?.resumeAttached),
    interviewNotesAttached: Boolean(review?.interviewNotesAttached),
    assessmentResultsAttached: Boolean(review?.assessmentResultsAttached),
    checkStatusIncluded: Boolean(review?.checkStatusIncluded),
    hiringManagerRecommendationIncluded: Boolean(review?.hiringManagerRecommendationIncluded),
    readyForBoardReview: Boolean(review?.readyForBoardReview),
    strengthsSummary: review?.strengthsSummary || "",
    concernsSummary: review?.concernsSummary || "",
    salaryExpectationsReviewed: Boolean(review?.salaryExpectationsReviewed),
    salaryExpectationAmount: review?.salaryExpectationAmount || "",
    startDateConfirmed: Boolean(review?.startDateConfirmed),
    proposedStartDate: review?.proposedStartDate || "",
    culturalFitReviewed: Boolean(review?.culturalFitReviewed),
    finalHiringRecommendation: review?.finalHiringRecommendation || "",
    recruiterFinalNotes: review?.recruiterFinalNotes || "",
    savedByUserId: review?.savedByUserId || "dashboard-admin"
  };
}

function ShortlistCheckbox({ label, value, onChange }) {
  return (
    <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13 }}>
      <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} style={{ marginTop: 3 }} />
      <span>{label}</span>
    </label>
  );
}

function ShortlistReviewForm({ review, onChange }) {
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="grid cols-2" style={{ gap: 18 }}>
        <div className="card" style={{ padding: 14 }}>
          <div className="card-title" style={{ marginBottom: 10 }}>Final candidate verification</div>
          <div className="stack" style={{ gap: 8 }}>
            <ShortlistCheckbox label="Reference checks completed" value={review.referenceChecksCompleted} onChange={(value) => onChange("referenceChecksCompleted", value)} />
            <ShortlistCheckbox label="Background check required" value={review.backgroundCheckRequired} onChange={(value) => onChange("backgroundCheckRequired", value)} />
            <ShortlistCheckbox label="Background checks completed" value={review.backgroundChecksCompleted} onChange={(value) => onChange("backgroundChecksCompleted", value)} />
            <ShortlistCheckbox label="Credential verification completed" value={review.credentialVerificationCompleted} onChange={(value) => onChange("credentialVerificationCompleted", value)} />
            <ShortlistCheckbox label="Employment history verified" value={review.employmentHistoryVerified} onChange={(value) => onChange("employmentHistoryVerified", value)} />
            <ShortlistCheckbox label="Certifications / licenses confirmed" value={review.certificationsConfirmed} onChange={(value) => onChange("certificationsConfirmed", value)} />
            <ShortlistCheckbox label="Risk flags documented and reviewed" value={review.riskFlagsDocumented} onChange={(value) => onChange("riskFlagsDocumented", value)} />
            <Field2 label="Risk flag summary"><textarea className="ifield" rows="3" value={review.riskFlagsSummary} onChange={(event) => onChange("riskFlagsSummary", event.target.value)} placeholder="Document any risk flags or note that none were found." /></Field2>
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div className="card-title" style={{ marginBottom: 10 }}>Final assessment criteria</div>
          <div className="stack" style={{ gap: 8 }}>
            <ShortlistCheckbox label="Candidate meets all mandatory requirements" value={review.meetsMandatoryRequirements} onChange={(value) => onChange("meetsMandatoryRequirements", value)} />
            <ShortlistCheckbox label="Candidate meets preferred qualifications" value={review.meetsPreferredQualifications} onChange={(value) => onChange("meetsPreferredQualifications", value)} />
            <ShortlistCheckbox label="Final interview completed" value={review.finalInterviewCompleted} onChange={(value) => onChange("finalInterviewCompleted", value)} />
            <ShortlistCheckbox label="Practical assessment completed" value={review.practicalAssessmentCompleted} onChange={(value) => onChange("practicalAssessmentCompleted", value)} />
            <ShortlistCheckbox label="Behavioral / leadership assessment completed" value={review.behavioralAssessmentCompleted} onChange={(value) => onChange("behavioralAssessmentCompleted", value)} />
            <ShortlistCheckbox label="Technical / competency assessment completed" value={review.technicalAssessmentCompleted} onChange={(value) => onChange("technicalAssessmentCompleted", value)} />
            <div className="grid cols-2" style={{ gap: 10 }}>
              <Field2 label="Final assessment score"><input className="ifield" type="number" min="0" max="100" value={review.finalAssessmentScore} onChange={(event) => onChange("finalAssessmentScore", event.target.value)} /></Field2>
              <Field2 label="Assessment recommendation">
                <select className="ifield" value={review.finalAssessmentRecommendation} onChange={(event) => onChange("finalAssessmentRecommendation", event.target.value)}>
                  <option value="">Select</option>
                  <option value="strong-proceed">Strong proceed</option>
                  <option value="proceed">Proceed</option>
                  <option value="hold">Hold</option>
                  <option value="reject">Reject</option>
                  <option value="needs-more-review">Needs more review</option>
                </select>
              </Field2>
            </div>
          </div>
        </div>
      </div>

      <div className="grid cols-2" style={{ gap: 18 }}>
        <div className="card" style={{ padding: 14 }}>
          <div className="card-title" style={{ marginBottom: 10 }}>Hiring panel or board review</div>
          <div className="stack" style={{ gap: 8 }}>
            <ShortlistCheckbox label="Candidate profile prepared for review" value={review.profilePrepared} onChange={(value) => onChange("profilePrepared", value)} />
            <ShortlistCheckbox label="Resume / CV attached" value={review.resumeAttached} onChange={(value) => onChange("resumeAttached", value)} />
            <ShortlistCheckbox label="Interview notes attached" value={review.interviewNotesAttached} onChange={(value) => onChange("interviewNotesAttached", value)} />
            <ShortlistCheckbox label="Assessment results attached" value={review.assessmentResultsAttached} onChange={(value) => onChange("assessmentResultsAttached", value)} />
            <ShortlistCheckbox label="Reference / background status included" value={review.checkStatusIncluded} onChange={(value) => onChange("checkStatusIncluded", value)} />
            <ShortlistCheckbox label="Hiring manager recommendation included" value={review.hiringManagerRecommendationIncluded} onChange={(value) => onChange("hiringManagerRecommendationIncluded", value)} />
            <ShortlistCheckbox label="Ready for board / panel review" value={review.readyForBoardReview} onChange={(value) => onChange("readyForBoardReview", value)} />
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div className="card-title" style={{ marginBottom: 10 }}>Decision readiness</div>
          <div className="stack" style={{ gap: 8 }}>
            <Field2 label="Candidate strengths summary"><textarea className="ifield" rows="3" value={review.strengthsSummary} onChange={(event) => onChange("strengthsSummary", event.target.value)} /></Field2>
            <Field2 label="Candidate weaknesses / concerns"><textarea className="ifield" rows="3" value={review.concernsSummary} onChange={(event) => onChange("concernsSummary", event.target.value)} /></Field2>
            <ShortlistCheckbox label="Salary expectations reviewed" value={review.salaryExpectationsReviewed} onChange={(value) => onChange("salaryExpectationsReviewed", value)} />
            <Field2 label="Salary expectation amount / range"><input className="ifield" value={review.salaryExpectationAmount} onChange={(event) => onChange("salaryExpectationAmount", event.target.value)} /></Field2>
            <ShortlistCheckbox label="Availability / start date confirmed" value={review.startDateConfirmed} onChange={(value) => onChange("startDateConfirmed", value)} />
            <Field2 label="Proposed start date"><input className="ifield" type="date" value={review.proposedStartDate} onChange={(event) => onChange("proposedStartDate", event.target.value)} /></Field2>
            <ShortlistCheckbox label="Cultural fit / organizational alignment reviewed" value={review.culturalFitReviewed} onChange={(value) => onChange("culturalFitReviewed", value)} />
            <Field2 label="Final hiring recommendation">
              <select className="ifield" value={review.finalHiringRecommendation} onChange={(event) => onChange("finalHiringRecommendation", event.target.value)}>
                <option value="">Select</option>
                <option value="proceed">Proceed</option>
                <option value="hold">Hold</option>
                <option value="reject">Reject</option>
                <option value="needs-more-review">Needs more review</option>
              </select>
            </Field2>
            <Field2 label="Recruiter / hiring team notes"><textarea className="ifield" rows="3" value={review.recruiterFinalNotes} onChange={(event) => onChange("recruiterFinalNotes", event.target.value)} /></Field2>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShortlistChecklistReport({ report }) {
  if (!report) {
    return <div style={{ color: "var(--muted)", fontSize: 13 }}>No checklist report has been generated yet.</div>;
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      {report.summary && (
        <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55 }}>{report.summary}</div>
      )}
      <div className="grid cols-2" style={{ gap: 10 }}>
        <ApplicantKV k="Decision" v={report.decisionLabel || humanizeApplicantReportValue(report.decision, "Pending decision")} />
        <ApplicantKV k="Assessment" v={report.assessmentRecommendationLabel || humanizeApplicantReportValue(report.assessmentRecommendation, "Pending assessment")} />
        <ApplicantKV k="Assessment score" v={report.finalAssessmentScore == null ? "Not set" : `${report.finalAssessmentScore}/100`} />
        <ApplicantKV k="Generated" v={report.generatedAt ? new Date(report.generatedAt).toLocaleString("en-PG") : "Unsaved preview"} />
      </div>
      <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{report.text || ""}</div>
      {Array.isArray(report.outstandingItems) && report.outstandingItems.length > 0 && (
        <div>
          <div className="mono eyebrow" style={{ marginBottom: 8 }}>Outstanding items</div>
          <ChecklistList items={report.outstandingItems.map((label) => ({ label, ok: false, value: "Outstanding" }))} />
        </div>
      )}
    </div>
  );
}

function humanizeApplicantReportValue(value, fallback = "Not set") {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return text
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildShortlistChecklistPreview(row, review) {
  const numericAssessmentScore = review.finalAssessmentScore === "" || review.finalAssessmentScore == null
    ? null
    : Number(review.finalAssessmentScore);
  const completionItems = [
    ["referenceChecksCompleted", "Reference checks completed"],
    ["backgroundChecksCompleted", "Background checks completed"],
    ["credentialVerificationCompleted", "Credential verification completed"],
    ["employmentHistoryVerified", "Employment history verified"],
    ["certificationsConfirmed", "Certifications confirmed"],
    ["meetsMandatoryRequirements", "Mandatory requirements confirmed"],
    ["meetsPreferredQualifications", "Preferred qualifications confirmed"],
    ["finalInterviewCompleted", "Final interview completed"],
    ["practicalAssessmentCompleted", "Practical assessment completed"],
    ["behavioralAssessmentCompleted", "Behavioral assessment completed"],
    ["technicalAssessmentCompleted", "Technical assessment completed"],
    ["profilePrepared", "Profile prepared for review"],
    ["resumeAttached", "Resume attached"],
    ["interviewNotesAttached", "Interview notes attached"],
    ["assessmentResultsAttached", "Assessment results attached"],
    ["checkStatusIncluded", "Check status included"],
    ["hiringManagerRecommendationIncluded", "Hiring manager recommendation included"],
    ["salaryExpectationsReviewed", "Salary expectations reviewed"],
    ["startDateConfirmed", "Start date confirmed"],
    ["culturalFitReviewed", "Cultural fit reviewed"],
    ["readyForBoardReview", "Ready for board review"]
  ].map(([key, label]) => ({ key, label, done: Boolean(review[key]) }));

  const completed = completionItems.filter((item) => item.done).length;
  const total = completionItems.length;
  const outstandingItems = completionItems.filter((item) => !item.done).slice(0, 6).map((item) => item.label);

  return {
    generatedAt: null,
    summary: review.finalHiringRecommendation === "proceed"
      ? "This checklist is currently marked to proceed."
      : review.finalHiringRecommendation === "hold"
        ? "This checklist is currently marked to hold."
        : review.finalHiringRecommendation === "reject"
          ? "This checklist is currently marked to reject."
          : "This checklist is in progress and has not been finalized yet.",
    completion: {
      completed,
      total,
      percentage: total ? Math.round((completed / total) * 100) : 0
    },
    decision: review.finalHiringRecommendation || "",
    decisionLabel: humanizeApplicantReportValue(review.finalHiringRecommendation, "Pending decision"),
    assessmentRecommendation: review.finalAssessmentRecommendation || "",
    assessmentRecommendationLabel: humanizeApplicantReportValue(review.finalAssessmentRecommendation, "Pending assessment"),
    finalAssessmentScore: Number.isFinite(numericAssessmentScore) ? numericAssessmentScore : null,
    outstandingItems,
    text: [
      `Applicant: ${row.applicant.name || "Unnamed applicant"}`,
      `Position: ${row.position?.title || row.applicant.positionTitle || "Unknown position"}`,
      `Checklist completion: ${completed}/${total}`,
      `Decision: ${humanizeApplicantReportValue(review.finalHiringRecommendation, "Pending decision")}`,
      `Assessment recommendation: ${humanizeApplicantReportValue(review.finalAssessmentRecommendation, "Pending assessment")}`,
      Number.isFinite(numericAssessmentScore) ? `Assessment score: ${numericAssessmentScore}/100` : "Assessment score: Not set",
      review.salaryExpectationAmount ? `Salary expectation: ${review.salaryExpectationAmount}` : "Salary expectation: Not set",
      review.proposedStartDate ? `Proposed start date: ${review.proposedStartDate}` : "Proposed start date: Not set",
      outstandingItems.length ? `Outstanding items: ${outstandingItems.join(", ")}` : "Outstanding items: None",
      review.strengthsSummary ? `Strengths: ${review.strengthsSummary}` : null,
      review.concernsSummary ? `Concerns: ${review.concernsSummary}` : null,
      review.recruiterFinalNotes ? `Recruiter notes: ${review.recruiterFinalNotes}` : null
    ].filter(Boolean).join("\n")
  };
}

function triggerDownload(url, fileName) {
  const link = document.createElement("a");
  link.href = url;
  if (fileName) link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function downloadBlobFile(fileName, content, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, fileName);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function hasApplicantCv(applicant) {
  return Boolean(applicant?.cvFile?.downloadUrl);
}

function hasApplicantCoverLetterOrData(row) {
  return Boolean(row?.applicant);
}

function getApplicantSupportActionLabel(row) {
  const applicant = row?.applicant || {};
  return applicant.coverLetterFile?.downloadUrl || String(applicant.coverLetterText || "").trim()
    ? "Cover Letter"
    : "Data";
}

function openApplicantCv(applicant) {
  const url = applicant?.cvFile?.downloadUrl;
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

function openApplicantCoverLetterOrData(row) {
  const applicant = row?.applicant || {};
  if (applicant.coverLetterFile?.downloadUrl) {
    window.open(applicant.coverLetterFile.downloadUrl, "_blank", "noopener,noreferrer");
    return;
  }
  if (String(applicant.coverLetterText || "").trim()) {
    downloadBlobFile(`${slugify(applicant.name || applicant.id || "applicant")}-cover-letter.txt`, applicant.coverLetterText);
    return;
  }
  downloadApplicantDataFile(row);
}

function downloadApplicantDataFile(row) {
  const applicant = row?.applicant || {};
  if (applicant.id) {
    window.HEYA_API.downloadApplicationZip(applicant.id);
  }
}

function resolveApplicantPositionId(applicant, positions, posMap) {
  const directId = applicant?.positionId == null ? "" : String(applicant.positionId);
  if (directId && posMap[directId]) return directId;

  const positionTitle = String(applicant?.positionTitle || applicant?.jobTitle || "").trim().toLowerCase();
  if (!positionTitle) return directId || null;

  const matchedPosition = (positions || []).find((position) => String(position.title || "").trim().toLowerCase() === positionTitle);
  return matchedPosition ? String(matchedPosition.id) : (directId || null);
}

function normalizeApplicantStage(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "new") return "applied";
  if ([
    "applied",
    "screening",
    "screened",
    "shortlist_eligible",
    "shortlisted",
    "interview",
    "final_review",
    "offer",
    "hired",
    "rejected",
    "closed",
    "not_shortlisted"
  ].includes(normalized)) {
    return normalized;
  }
  return "applied";
}

function sortApplicantsForReview(rows, position) {
  const ordered = [...rows];
  const filtrationOrder = Array.isArray(position?.filtration?.order) ? position.filtration.order.map((id) => String(id)) : [];

  if (filtrationOrder.length) {
    const orderMap = new Map(filtrationOrder.map((id, index) => [id, index]));
    return ordered.sort((left, right) => {
      const leftOrder = orderMap.has(String(left.applicant.id)) ? orderMap.get(String(left.applicant.id)) : Number.MAX_SAFE_INTEGER;
      const rightOrder = orderMap.has(String(right.applicant.id)) ? orderMap.get(String(right.applicant.id)) : Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return right.completeness.pct - left.completeness.pct;
    });
  }

  return ordered.sort((left, right) => {
    if (right.completeness.pct !== left.completeness.pct) return right.completeness.pct - left.completeness.pct;
    const leftTime = new Date(left.applicant.appliedAt || 0).getTime();
    const rightTime = new Date(right.applicant.appliedAt || 0).getTime();
    return rightTime - leftTime;
  });
}

function describeDocumentCell(applicant) {
  const docs = [];
  if (applicant.cvName || applicant.cvFile?.downloadUrl) docs.push("CV");
  if (applicant.coverLetterName || applicant.coverLetterFile?.downloadUrl) docs.push("Cover");
  if (applicant.photo || applicant.imageUrl || applicant.avatarUrl) docs.push("Image");
  return docs.join(" / ");
}

function hasApplicantFiles(applicant) {
  return Boolean(
    applicant.cvName
    || applicant.cvFile?.downloadUrl
    || applicant.coverLetterName
    || applicant.coverLetterFile?.downloadUrl
    || applicant.photo
    || applicant.imageUrl
    || applicant.avatarUrl
  );
}

function stageLabel(stageId) {
  const match = (window.APPLICANT_STATUSES || []).find((item) => item.id === stageId)
    || [{ id: "screening", label: "Screening" }, { id: "new", label: "New" }, { id: "rejected", label: "Rejected" }].find((item) => item.id === stageId);
  return match ? match.label : (stageId || "Unknown");
}

function buildApplicantAiSummary(row) {
  const applicant = row.applicant;
  const position = row.position;
  const completeness = row.completeness || { pct: 0, missingReq: [], missingOpt: [] };
  const strongPoints = [];
  if (applicant.email) strongPoints.push("contact email is present");
  if (applicant.phone) strongPoints.push("phone contact is available");
  if (applicant.cvName) strongPoints.push("a CV has been uploaded");
  if (applicant.coverLetterName || applicant.coverLetterText) strongPoints.push("supporting motivation is available");
  if (applicant.yearsExperience) strongPoints.push("experience details were provided");

  const concerns = [...(completeness.missingReq || []), ...(completeness.missingOpt || [])];
  const summary = [];
  summary.push(`${applicant.name || "This applicant"} is linked to ${position?.title || applicant.positionTitle || "the selected position"} and currently sits at the ${stageLabel(row.stage)} stage.`);
  summary.push(`Application completeness is ${completeness.pct || 0}%.`);
  summary.push(strongPoints.length ? `Strengths noticed: ${strongPoints.join(", ")}.` : "No clear strengths were captured from the current submission metadata.");
  summary.push(concerns.length ? `Items that may need follow-up: ${concerns.join(", ")}.` : "No obvious document or data gaps were detected.");
  if (applicant.screening?.report?.content) {
    summary.push(`Existing screening notes: ${applicant.screening.report.content}`);
  } else if (applicant.coverLetterText) {
    summary.push(`Application message: ${String(applicant.coverLetterText).trim().slice(0, 220)}${String(applicant.coverLetterText).trim().length > 220 ? "..." : ""}`);
  }
  return summary.join("\n");
}

function buildApplicantCondensedReport(row) {
  const applicant = row.applicant;
  const position = row.position;
  const completeness = row.completeness || { pct: 0, missingReq: [], missingOpt: [] };
  const uploaded = [
    applicant.cvName || applicant.cvFile?.name ? "CV uploaded" : "CV missing",
    applicant.coverLetterName || applicant.coverLetterFile?.name || applicant.coverLetterText ? "cover letter or message present" : "cover letter missing",
    applicant.email ? "email present" : "email missing",
    applicant.phone ? "phone present" : "phone missing"
  ];

  return [
    `Applicant: ${applicant.name || "Unnamed applicant"}`,
    `Position: ${position?.title || applicant.positionTitle || "Unknown position"}`,
    `Stage: ${stageLabel(row.stage)}`,
    `Applied: ${applicant.appliedAt || "Unknown date"}`,
    `Completeness: ${completeness.pct || 0}%`,
    `Document snapshot: ${uploaded.join("; ")}.`,
    completeness.missingReq?.length || completeness.missingOpt?.length
      ? `Missing or follow-up items: ${[...(completeness.missingReq || []), ...(completeness.missingOpt || [])].join(", ")}.`
      : "No missing items were detected from the current submission.",
    applicant.screening?.report?.recommendation
      ? `Current recommendation marker: ${applicant.screening.report.recommendation}.`
      : "No recommendation has been saved yet."
  ].join("\n");
}

function collectApplicationFields(applicant) {
  const ignored = new Set([
    "id", "applicationCode", "name", "email", "phone", "positionId", "positionTitle", "companyName", "status",
    "appliedAt", "currentLocation", "yearsExperience", "coverLetterText", "cvName", "coverLetterName", "cvFile",
    "coverLetterFile", "cvComplete", "screening", "photo", "imageUrl", "avatarUrl"
  ]);

  const labels = {
    currentLocation: "Current location",
    yearsExperience: "Years of experience",
    coverLetterText: "Cover letter / message"
  };

  const fields = [];

  ["currentLocation", "yearsExperience", "coverLetterText"].forEach((key) => {
    const value = applicant[key];
    if (value != null && String(value).trim()) {
      fields.push({ key, label: labels[key] || key, value });
    }
  });

  Object.keys(applicant || {}).forEach((key) => {
    if (ignored.has(key)) return;
    const value = applicant[key];
    if (value == null) return;
    if (typeof value === "object") return;
    if (!String(value).trim()) return;
    fields.push({
      key,
      label: key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase()),
      value
    });
  });

  return fields;
}

async function exportApplicantBundle(position, rows, options = {}) {
  const encoder = new TextEncoder();
  const positionSlug = slugify(position.title || position.id || "position");
  const entries = [];

  entries.push({
    name: `${positionSlug}/position-summary.json`,
    data: encoder.encode(JSON.stringify({
      id: position.id,
      title: position.title,
      client: position.client || "",
      location: position.location || "",
      status: position.status || "",
      applicants: rows.length,
      exportedAt: new Date().toISOString()
    }, null, 2))
  });

  for (const row of rows) {
    const applicant = row.applicant;
    const applicantSlug = slugify(applicant.name || applicant.id || "applicant");
    const basePath = `${positionSlug}/${applicantSlug}`;

    entries.push({
      name: `${basePath}/application-report.txt`,
      data: encoder.encode(buildApplicantCondensedReport(row))
    });

    entries.push({
      name: `${basePath}/application-data.json`,
      data: encoder.encode(JSON.stringify({
        ...applicant,
        positionResolved: row.position ? { id: row.position.id, title: row.position.title } : null,
        normalizedStage: row.stage,
        completeness: row.completeness
      }, null, 2))
    });

    const files = [
      { label: "cv", meta: applicant.cvFile, fallbackName: applicant.cvName },
      { label: "cover-letter", meta: applicant.coverLetterFile, fallbackName: applicant.coverLetterName }
    ];

    for (const file of files) {
      const url = file.meta?.downloadUrl;
      if (!url) continue;
      try {
        const response = await fetch(url, { credentials: "same-origin" });
        if (!response.ok) throw new Error(`download failed (${response.status})`);
        const buffer = new Uint8Array(await response.arrayBuffer());
        const filename = sanitizeFilename(file.meta?.name || file.fallbackName || `${file.label}.bin`);
        entries.push({
          name: `${basePath}/documents/${filename}`,
          data: buffer
        });
      } catch (error) {
        entries.push({
          name: `${basePath}/documents/${file.label}-download-error.txt`,
          data: encoder.encode(`Unable to fetch ${file.label} for ${applicant.name || applicant.id}: ${error.message}`)
        });
      }
    }
  }

  const zipBlob = createZipBlob(entries);
  const anchor = document.createElement("a");
  const objectUrl = URL.createObjectURL(zipBlob);
  anchor.href = objectUrl;
  anchor.download = options.zipName || `${positionSlug}-cv-data.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}

function createZipBlob(entries) {
  const parts = [];
  const centralDirectory = [];
  let offset = 0;
  let centralSize = 0;

  entries.forEach((entry) => {
    const nameBytes = new TextEncoder().encode(String(entry.name || "file.txt"));
    const dataBytes = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
    const checksum = crc32(dataBytes);
    const stamp = dosDateTime(new Date());
    const flags = 0x0800;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, flags, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, stamp.time, true);
    localView.setUint16(12, stamp.date, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, dataBytes.length, true);
    localView.setUint32(22, dataBytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    parts.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, flags, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, stamp.time, true);
    centralView.setUint16(14, stamp.date, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, dataBytes.length, true);
    centralView.setUint32(24, dataBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralDirectory.push(centralHeader);
    centralSize += centralHeader.length;
    offset += localHeader.length + dataBytes.length;
  });

  const centralOffset = offset;
  parts.push(...centralDirectory);

  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);
  endView.setUint16(20, 0, true);
  parts.push(endRecord);

  return new Blob(parts, { type: "application/zip" });
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);
  return {
    time: (hours << 11) | (minutes << 5) | seconds,
    date: ((year - 1980) << 9) | (month << 5) | day
  };
}

function slugify(value) {
  return String(value || "item")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "item";
}

function sanitizeFilename(value) {
  return String(value || "file.bin").replace(/[\\/:*?"<>|]+/g, "-");
}

window.Applicants = Applicants;
