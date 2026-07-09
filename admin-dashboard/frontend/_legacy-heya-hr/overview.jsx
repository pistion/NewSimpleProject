// Dashboard — Requisitions (create + apply)
function Overview({ role, setView }) {
  const [postings, setPostings] = React.useState([]);
  const [showCreate, setShowCreate] = React.useState(false);
  const [applyingTo, setApplyingTo] = React.useState(null); // posting id
  const [expandedId, setExpandedId] = React.useState(null);
  const [applications, setApplications] = React.useState({}); // postingId -> [apps]
  const [toast, setToast] = React.useState(null);

  // ----- Create-posting form -----
  const blankPosting = {
    title: "",
    department: "",
    location: "",
    employmentType: "Full-time",
    experience: "",
    salary: "",
    description: "",
    requirements: "",
  };
  const [draft, setDraft] = React.useState(blankPosting);
  const updateDraft = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  function submitPosting(e) {
    e.preventDefault();
    if (!draft.title.trim()) return;
    const id = "req-" + Date.now().toString(36);
    const newPosting = {
      id,
      ...draft,
      postedAt: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    };
    setPostings(p => [newPosting, ...p]);
    setDraft(blankPosting);
    setShowCreate(false);
    setExpandedId(id);
    flashToast("Requisition posted · " + newPosting.title);
  }

  // ----- Apply form -----
  const blankApp = { name: "", email: "", cvName: "", coverLetterName: "" };
  const [appDraft, setAppDraft] = React.useState(blankApp);
  const updateApp = (k, v) => setAppDraft(d => ({ ...d, [k]: v }));

  function submitApplication(e) {
    e.preventDefault();
    if (!appDraft.name.trim() || !appDraft.email.trim()) return;
    const pid = applyingTo;
    setApplications(prev => ({
      ...prev,
      [pid]: [...(prev[pid] || []), { ...appDraft, submittedAt: new Date().toLocaleString() }]
    }));
    setAppDraft(blankApp);
    setApplyingTo(null);
    flashToast("Application submitted for review");
  }

  function flashToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  function handleFile(field, file) {
    if (!file) return;
    updateApp(field, file.name);
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="mono" style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Requisitions</div>
          <h1 className="page-title" style={{ marginTop: 8 }}>
            Open <em>roles</em> &amp; postings
          </h1>
          <div className="page-sub">
            Create a new requisition to open it for applications. Candidates can apply directly from the listing.
          </div>
        </div>
        <div className="cluster">
          <button className="btn accent" onClick={() => setShowCreate(s => !s)}>
            <I.Plus />
            <span>{showCreate ? "Close" : "Create new posting"}</span>
          </button>
        </div>
      </div>

      {/* ----- Layer 1: Create posting ----- */}
      {showCreate && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-head">
            <div className="card-title">New requisition <small>basic info</small></div>
            <button className="btn ghost sm" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
          <form onSubmit={submitPosting}>
            <div className="grid cols-2" style={{ gap: 14 }}>
              <Field label="Job title*">
                <input className="ifield" value={draft.title} onChange={e => updateDraft("title", e.target.value)} placeholder="e.g. Senior Backend Engineer" required />
              </Field>
              <Field label="Department">
                <input className="ifield" value={draft.department} onChange={e => updateDraft("department", e.target.value)} placeholder="e.g. Engineering" />
              </Field>
              <Field label="Location">
                <input className="ifield" value={draft.location} onChange={e => updateDraft("location", e.target.value)} placeholder="e.g. Remote · US" />
              </Field>
              <Field label="Employment type">
                <select className="ifield" value={draft.employmentType} onChange={e => updateDraft("employmentType", e.target.value)}>
                  <option>Full-time</option>
                  <option>Part-time</option>
                  <option>Contract</option>
                  <option>Internship</option>
                </select>
              </Field>
              <Field label="Experience required">
                <input className="ifield" value={draft.experience} onChange={e => updateDraft("experience", e.target.value)} placeholder="e.g. 5+ years" />
              </Field>
              <Field label="Salary range">
                <input className="ifield" value={draft.salary} onChange={e => updateDraft("salary", e.target.value)} placeholder="e.g. $120k – $160k" />
              </Field>
            </div>
            <div style={{ marginTop: 14 }}>
              <Field label="Job description">
                <textarea className="ifield" rows="4" value={draft.description} onChange={e => updateDraft("description", e.target.value)} placeholder="What the role is about, what you'll be doing..." />
              </Field>
            </div>
            <div style={{ marginTop: 14 }}>
              <Field label="Requirements / qualifications">
                <textarea className="ifield" rows="3" value={draft.requirements} onChange={e => updateDraft("requirements", e.target.value)} placeholder="Must-haves, nice-to-haves..." />
              </Field>
            </div>
            <div className="card-foot">
              <span>* required</span>
              <div className="cluster">
                <button type="button" className="btn ghost" onClick={() => setDraft(blankPosting)}>Reset</button>
                <button type="submit" className="btn primary">
                  <I.Send />
                  <span>Create posting</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ----- Job listings ----- */}
      {postings.length === 0 && !showCreate && (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 26, marginBottom: 8 }}>No requisitions yet</div>
          <div style={{ color: "var(--muted)", marginBottom: 20 }}>
            Click <b>Create new posting</b> to open your first role.
          </div>
          <button className="btn accent" onClick={() => setShowCreate(true)}>
            <I.Plus /><span>Create new posting</span>
          </button>
        </div>
      )}

      <div className="stack" style={{ gap: 14 }}>
        {postings.map(p => {
          const isOpen = expandedId === p.id;
          const isApplying = applyingTo === p.id;
          const apps = applications[p.id] || [];
          return (
            <div key={p.id} className="card">
              <div className="spread">
                <div style={{ minWidth: 0 }}>
                  <div className="cluster" style={{ marginBottom: 4 }}>
                    <span className="mono" style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      {p.department || "—"} · {p.location || "—"} · {p.employmentType}
                    </span>
                  </div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 24, lineHeight: 1.1 }}>{p.title}</div>
                  <div className="cluster" style={{ marginTop: 8, color: "var(--muted)", fontSize: 12 }}>
                    {p.experience && <span>{p.experience}</span>}
                    {p.salary && <span>· {p.salary}</span>}
                    <span>· posted {p.postedAt}</span>
                    {apps.length > 0 && <span>· {apps.length} application{apps.length === 1 ? "" : "s"}</span>}
                  </div>
                </div>
                <div className="cluster">
                  <button className="btn sm" onClick={() => setExpandedId(isOpen ? null : p.id)}>
                    {isOpen ? "Hide details" : "View details"}
                  </button>
                  <button className="btn accent sm" onClick={() => { setApplyingTo(isApplying ? null : p.id); setExpandedId(p.id); }}>
                    {isApplying ? "Close" : "Apply"}
                  </button>
                </div>
              </div>

              {isOpen && (
                <div style={{ marginTop: 16, borderTop: "1px solid var(--line-2)", paddingTop: 16 }}>
                  <Section title="Job description">{p.description || <em style={{ color: "var(--muted)" }}>No description provided.</em>}</Section>
                  <Section title="Experience">{p.experience || <em style={{ color: "var(--muted)" }}>Not specified.</em>}</Section>
                  <Section title="Requirements">{p.requirements || <em style={{ color: "var(--muted)" }}>Not specified.</em>}</Section>
                </div>
              )}

              {/* ----- Layer 2: Apply ----- */}
              {isApplying && (
                <div style={{ marginTop: 16, borderTop: "1px solid var(--line-2)", paddingTop: 16 }}>
                  <div className="card-title" style={{ marginBottom: 10 }}>
                    Apply for {p.title} <small>candidate info</small>
                  </div>
                  <form onSubmit={submitApplication}>
                    <div className="grid cols-2" style={{ gap: 14 }}>
                      <Field label="Full name*">
                        <input className="ifield" value={appDraft.name} onChange={e => updateApp("name", e.target.value)} placeholder="Jane Doe" required />
                      </Field>
                      <Field label="Email*">
                        <input className="ifield" type="email" value={appDraft.email} onChange={e => updateApp("email", e.target.value)} placeholder="jane@example.com" required />
                      </Field>
                      <Field label="Upload CV (PDF, DOCX)">
                        <label className="ifield filechip">
                          <I.Plus />
                          <span style={{ marginLeft: 8 }}>{appDraft.cvName || "Choose file…"}</span>
                          <input type="file" accept=".pdf,.doc,.docx" onChange={e => handleFile("cvName", e.target.files[0])} style={{ display: "none" }} />
                        </label>
                      </Field>
                      <Field label="Upload cover letter (optional)">
                        <label className="ifield filechip">
                          <I.Plus />
                          <span style={{ marginLeft: 8 }}>{appDraft.coverLetterName || "Choose file…"}</span>
                          <input type="file" accept=".pdf,.doc,.docx,.txt" onChange={e => handleFile("coverLetterName", e.target.files[0])} style={{ display: "none" }} />
                        </label>
                      </Field>
                    </div>
                    <div className="card-foot">
                      <span>* required</span>
                      <div className="cluster">
                        <button type="button" className="btn ghost" onClick={() => { setApplyingTo(null); setAppDraft(blankApp); }}>Cancel</button>
                        <button type="submit" className="btn primary">
                          <I.Send /><span>Submit application</span>
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {toast && (
        <div style={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          background: "var(--ink)",
          color: "var(--paper)",
          padding: "10px 18px",
          borderRadius: 10,
          fontSize: 13,
          boxShadow: "var(--shadow)",
          zIndex: 30
        }}>{toast}</div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block" }}>
      <div className="mono" style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="mono" style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{title}</div>
      <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

window.Overview = Overview;
