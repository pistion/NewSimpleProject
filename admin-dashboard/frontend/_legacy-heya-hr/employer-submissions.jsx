function EmployerSubmissions({ submissions, onCreateDraft, onDelete, onBulkDelete }) {
  const [selected, setSelected] = React.useState([]);
  const [expanded, setExpanded] = React.useState(null);
  const visibleIds = submissions.map((submission) => submission.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  React.useEffect(() => {
    setSelected((current) => current.filter((id) => visibleIds.includes(id)));
  }, [submissions.length]);

  function toggleOne(id) {
    setSelected((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  }

  function toggleAll() {
    setSelected(allSelected ? [] : visibleIds);
  }

  async function deleteOne(submission) {
    if (!submission || !onDelete) return;
    if (!window.confirm(`Delete employer submission from "${submission.companyName || "this company"}"?`)) return;
    await onDelete(submission.id);
    setSelected((current) => current.filter((id) => id !== submission.id));
  }

  async function deleteSelected() {
    if (!selected.length || !onBulkDelete) return;
    if (!window.confirm(`Delete ${selected.length} selected employer submission${selected.length === 1 ? "" : "s"}?`)) return;
    await onBulkDelete(selected);
    setSelected([]);
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="mono eyebrow">Employers</div>
          <h1 className="page-title" style={{ marginTop: 8 }}>Employer <em>submissions</em></h1>
          <div className="page-sub">Vacancy advertising requests received from employers through the Careers portal.</div>
        </div>
        {selected.length > 0 && (
          <button className="btn ghost sm" onClick={deleteSelected}>Delete selected ({selected.length})</button>
        )}
      </div>

      <div className="card flush">
        <table className="pos-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all employer submissions" />
              </th>
              <th>Company</th>
              <th>Role</th>
              <th>Contact</th>
              <th>Status</th>
              <th>Received</th>
              <th style={{ width: 1 }}></th>
            </tr>
          </thead>
          <tbody>
            {submissions.length === 0 && (
              <tr><td colSpan="7" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>No employer submissions yet.</td></tr>
            )}
            {submissions.map((submission) => {
              const createUnavailable = submission.status === "converted" || submission.status === "draft";
              return (
                <React.Fragment key={submission.id}>
                  <tr>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(submission.id)}
                        onChange={() => toggleOne(submission.id)}
                        aria-label={`Select ${submission.companyName}`}
                      />
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{submission.companyName}</div>
                      <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{submission.jobCategory || submission.industry || "Department not provided"} / {submission.location || "Location not provided"}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{submission.jobTitle}</div>
                      <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{submission.employmentType || "Type not provided"} / {submission.numberOfVacancies || "?"} hire(s)</div>
                    </td>
                    <td>
                      <div>{submission.fullName}</div>
                      <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{submission.email}</div>
                    </td>
                    <td><span className={"status-badge " + (createUnavailable ? "status-published" : "status-ready")}>{submission.status}</span></td>
                    <td className="mono" style={{ fontSize: 12 }}>{submission.createdAt ? new Date(submission.createdAt).toLocaleDateString("en-PG", { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                    <td>
                      <div className="cluster" style={{ flexWrap: "nowrap" }}>
                        <button className="btn ghost sm" onClick={() => setExpanded(expanded === submission.id ? null : submission.id)}>
                          {expanded === submission.id ? "Hide" : "Details"}
                        </button>
                        {createUnavailable ? (
                          <button className="btn ghost sm" onClick={() => deleteOne(submission)}>Delete</button>
                        ) : (
                          <EmployerRowMenu
                            onCreate={() => onCreateDraft(submission.id)}
                            onDelete={() => deleteOne(submission)}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded === submission.id && (
                    <tr>
                      <td></td>
                      <td colSpan="6">
                        <EmployerSubmissionDetails submission={submission} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmployerSubmissionDetails({ submission }) {
  const items = [
    ["Company address", submission.companyAddress],
    ["Contact role", submission.contactPersonRole],
    ["Deadline", submission.applicationDeadline],
    ["Salary range", submission.salaryDisplay],
    ["Job description", submission.jobDescription],
    ["Job criteria", submission.jobCriteria],
    ["Minimum qualifications", submission.minimumQualifications],
    ["Required experience", submission.requiredExperience],
    ["Required skills", submission.requiredSkills],
    ["Application instructions", submission.applicationInstructions],
    ["Supporting notes", submission.supportingNotes],
    ["Additional message", submission.additionalMessage || submission.message],
    ["Company career site URL", submission.careerSiteUrl]
  ];
  return (
    <div className="card" style={{ margin: "8px 0", padding: 16, background: "rgba(255,255,255,0.72)" }}>
      <div className="grid cols-2" style={{ gap: 12 }}>
        {items.map(([label, value]) => (
          <div key={label}>
            <div className="mono" style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
            <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{value || <em style={{ color: "var(--muted)", fontStyle: "normal" }}>Not provided</em>}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmployerRowMenu({ onCreate, onDelete }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="row-actions">
      <button className="icon-btn" title="Employer actions" onClick={() => setOpen((value) => !value)}>
        <I.Dots />
      </button>
      {open && (
        <>
          <div className="menu-scrim" onClick={() => setOpen(false)} />
          <div className="menu">
            <button className="menu-item" onClick={() => { setOpen(false); onCreate(); }}>Create draft</button>
            <button className="menu-item danger" onClick={() => { setOpen(false); onDelete(); }}>Delete</button>
          </div>
        </>
      )}
    </div>
  );
}

window.EmployerSubmissions = EmployerSubmissions;
