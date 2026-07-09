// Website Bots — CRM management area for the public website chatbot.
// Three panels: Conversations (review Q/A + rate answers), Common Questions,
// and Knowledge (train the bot with CRM-managed answers).
// Registered on window so crm-workspace.jsx can render <window.PublicBotWorkspace/>.

function PbwEmpty({ children }) {
  return <div className="pbw-empty">{children}</div>;
}

function PbwStatus({ loading, error, empty, emptyText, children }) {
  if (loading) return <div className="pbw-empty">Loading…</div>;
  if (error) return <div className="pbw-empty pbw-empty--error">{error}</div>;
  if (empty) return <PbwEmpty>{emptyText}</PbwEmpty>;
  return children;
}

function pbwDate(v) {
  if (!v) return "";
  const d = new Date(String(v).includes("T") ? v : String(v).replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleString("en-PG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ── Conversations ─────────────────────────────────────────────────────────────
function PbwConversations() {
  const [sessions, setSessions] = React.useState([]);
  const [sources, setSources]   = React.useState([]);
  const [totals, setTotals]     = React.useState({});
  const [loading, setLoading]   = React.useState(true);
  const [error, setError]       = React.useState(null);
  const [filter, setFilter]     = React.useState("");

  const [active, setActive]     = React.useState(null);
  const [messages, setMessages] = React.useState([]);
  const [msgLoading, setMsgLoading] = React.useState(false);
  const [msgError, setMsgError] = React.useState(null);

  function load() {
    setLoading(true); setError(null);
    window.HEYA_API.getPublicBotSessions({ sourcePath: filter })
      .then((d) => {
        setSessions(d.sessions || []);
        setSources(d.sources || []);
        setTotals(d.totals || {});
        setLoading(false);
      })
      .catch((e) => { setError(e.message || "Could not load conversations."); setLoading(false); });
  }
  React.useEffect(load, [filter]);

  function openSession(s) {
    setActive(s); setMessages([]); setMsgLoading(true); setMsgError(null);
    window.HEYA_API.getPublicBotSessionMessages(s.id)
      .then((d) => { setMessages(d.messages || []); setMsgLoading(false); })
      .catch((e) => { setMsgError(e.message || "Could not load conversation."); setMsgLoading(false); });
  }

  function rate(msg, rating) {
    window.HEYA_API.sendPublicBotFeedback(msg.id, { rating })
      .then(() => setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, review_status: rating } : m)))
      .catch(() => {});
  }

  return (
    <div className="pbw-split">
      <div className="pbw-list-col">
        <div className="pbw-toolbar">
          <select className="pbw-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All pages</option>
            {sources.map((s) => (
              <option key={s.path} value={s.path}>{s.path} ({s.count})</option>
            ))}
          </select>
          <button className="pbw-btn pbw-btn--ghost" onClick={load}>Refresh</button>
        </div>
        <div className="pbw-metrics">
          <span><strong>{totals.sessions || 0}</strong> sessions</span>
          <span><strong>{totals.messages || 0}</strong> messages</span>
          <span><strong>{totals.knowledge || 0}</strong> knowledge</span>
        </div>
        <PbwStatus loading={loading} error={error} empty={!sessions.length}
          emptyText="No chatbot conversations yet. They appear here as visitors use the site assistant.">
          <ul className="pbw-sessions">
            {sessions.map((s) => (
              <li key={s.id}
                  className={"pbw-session" + (active && active.id === s.id ? " is-active" : "")}
                  onClick={() => openSession(s)}>
                <div className="pbw-session__top">
                  <span className="pbw-session__path">{s.last_source_path || s.first_source_path || "/"}</span>
                  <span className="pbw-session__count">{s.message_count}</span>
                </div>
                <div className="pbw-session__meta">
                  {s.last_page_title ? s.last_page_title + " · " : ""}{pbwDate(s.last_seen_at)}
                </div>
              </li>
            ))}
          </ul>
        </PbwStatus>
      </div>

      <div className="pbw-detail-col">
        {!active && <PbwEmpty>Select a conversation to review its questions and answers.</PbwEmpty>}
        {active && (
          <div className="pbw-thread">
            <div className="pbw-thread__head">
              <div className="pbw-thread__title">{active.last_source_path || "/"}</div>
              <div className="pbw-thread__sub">Session {active.session_key || active.id} · {pbwDate(active.created_at)}</div>
            </div>
            <PbwStatus loading={msgLoading} error={msgError} empty={!messages.length}
              emptyText="No messages recorded for this session.">
              <div className="pbw-messages">
                {messages.map((m) => (
                  <div key={m.id} className="pbw-exchange">
                    <div className="pbw-bubble pbw-bubble--user">{m.user_message}</div>
                    <div className="pbw-bubble pbw-bubble--bot">
                      {m.bot_response || <em>(no answer captured)</em>}
                      <div className="pbw-bubble__foot">
                        <span className={"pbw-tag pbw-tag--" + (m.review_status || "unreviewed")}>{m.review_status || "unreviewed"}</span>
                        <span className="pbw-rate">
                          <button className={"pbw-rate__btn" + (m.review_status === "good" ? " is-on" : "")}
                                  title="Good answer" onClick={() => rate(m, "good")}>👍</button>
                          <button className={"pbw-rate__btn" + (m.review_status === "bad" ? " is-on" : "")}
                                  title="Needs improvement" onClick={() => rate(m, "bad")}>👎</button>
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </PbwStatus>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Common Questions ──────────────────────────────────────────────────────────
function PbwQuestions() {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    window.HEYA_API.getPublicBotQuestions({ limit: 100 })
      .then((d) => { setRows(d.questions || []); setLoading(false); })
      .catch((e) => { setError(e.message || "Could not load questions."); setLoading(false); });
  }, []);

  return (
    <PbwStatus loading={loading} error={error} empty={!rows.length}
      emptyText="No questions have been asked yet.">
      <table className="pbw-table">
        <thead>
          <tr><th>Question</th><th>Asked</th><th>Page</th><th>Last</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.question}{r.bad_count > 0 ? <span className="pbw-flag" title="Marked needs-improvement"> ⚑</span> : null}</td>
              <td className="pbw-num">{r.count}</td>
              <td className="pbw-dim">{r.source_path || "—"}</td>
              <td className="pbw-dim">{pbwDate(r.last_asked)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PbwStatus>
  );
}

// ── Knowledge (training) ──────────────────────────────────────────────────────
const PBW_BLANK = { title: "", category: "services", pathScope: "", keywords: "", question: "", answer: "", priority: 0, isActive: true };

function PbwKnowledge() {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [form, setForm] = React.useState(PBW_BLANK);
  const [editId, setEditId] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [toast, setToast] = React.useState(null);

  function load() {
    setLoading(true); setError(null);
    window.HEYA_API.getPublicBotKnowledge()
      .then((d) => { setItems(d.knowledge || []); setLoading(false); })
      .catch((e) => { setError(e.message || "Could not load knowledge."); setLoading(false); });
  }
  React.useEffect(load, []);

  function edit(it) {
    setEditId(it.id);
    setForm({
      title: it.title || "", category: it.category || "", pathScope: it.path_scope || "",
      keywords: it.keywords || "", question: it.question || "", answer: it.answer || "",
      priority: it.priority || 0, isActive: it.is_active !== 0,
    });
  }
  function resetForm() { setEditId(null); setForm(PBW_BLANK); }

  function save(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.answer.trim()) { setToast({ type: "err", text: "Title and answer are required." }); return; }
    setSaving(true);
    const p = editId
      ? window.HEYA_API.updatePublicBotKnowledge(editId, form)
      : window.HEYA_API.createPublicBotKnowledge(form);
    p.then(() => { setSaving(false); setToast({ type: "ok", text: editId ? "Entry updated." : "Entry added." }); resetForm(); load(); })
     .catch((err) => { setSaving(false); setToast({ type: "err", text: err.message || "Could not save." }); });
  }

  function toggleActive(it) {
    window.HEYA_API.updatePublicBotKnowledge(it.id, { isActive: it.is_active === 0 })
      .then(load).catch(() => {});
  }

  return (
    <div className="pbw-split">
      <div className="pbw-list-col">
        <PbwStatus loading={loading} error={error} empty={!items.length}
          emptyText="No knowledge entries yet. Add one to train the bot.">
          <ul className="pbw-knowledge">
            {items.map((it) => (
              <li key={it.id} className={"pbw-know" + (it.is_active === 0 ? " is-off" : "")}>
                <div className="pbw-know__head">
                  <span className="pbw-know__title">{it.title}</span>
                  <span className="pbw-know__scope">{it.path_scope || "global"}</span>
                </div>
                <div className="pbw-know__answer">{it.answer}</div>
                <div className="pbw-know__foot">
                  <span className="pbw-dim">{it.category || "general"} · priority {it.priority}</span>
                  <span className="pbw-know__actions">
                    <button className="pbw-btn pbw-btn--ghost" onClick={() => edit(it)}>Edit</button>
                    <button className="pbw-btn pbw-btn--ghost" onClick={() => toggleActive(it)}>{it.is_active === 0 ? "Enable" : "Disable"}</button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </PbwStatus>
      </div>

      <div className="pbw-detail-col">
        <form className="pbw-form" onSubmit={save}>
          <div className="pbw-form__title">{editId ? "Edit knowledge entry" : "Add knowledge entry"}</div>
          {toast && <div className={"pbw-toast pbw-toast--" + (toast.type === "ok" ? "ok" : "err")}>{toast.text}</div>}
          <label className="pbw-field"><span>Title *</span>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <div className="pbw-field-row">
            <label className="pbw-field"><span>Category</span>
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="services / careers / contact" /></label>
            <label className="pbw-field"><span>Page scope</span>
              <input value={form.pathScope} onChange={(e) => setForm({ ...form, pathScope: e.target.value })} placeholder="/services (blank = all)" /></label>
          </div>
          <label className="pbw-field"><span>Keywords (comma separated)</span>
            <input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="apply, vacancy, cv" /></label>
          <label className="pbw-field"><span>Example question</span>
            <input value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} /></label>
          <label className="pbw-field"><span>Answer *</span>
            <textarea rows="4" value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} /></label>
          <div className="pbw-field-row">
            <label className="pbw-field pbw-field--sm"><span>Priority</span>
              <input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} /></label>
            <label className="pbw-check">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active
            </label>
          </div>
          <div className="pbw-form__actions">
            {editId && <button type="button" className="pbw-btn pbw-btn--ghost" onClick={resetForm}>Cancel</button>}
            <button type="submit" className="pbw-btn pbw-btn--primary" disabled={saving}>{saving ? "Saving…" : (editId ? "Update entry" : "Add entry")}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PublicBotWorkspace() {
  const [view, setView] = React.useState("conversations");
  const tabs = [
    { id: "conversations", label: "Conversations" },
    { id: "questions",     label: "Common Questions" },
    { id: "knowledge",     label: "Bot Training" },
  ];
  return (
    <div className="crm-section pbw">
      <div className="crm-section-head">
        <div>
          <div className="crm-section-title">Website Bots</div>
          <div className="crm-section-sub">Review public chatbot conversations and train the assistant with CRM-managed answers.</div>
        </div>
      </div>
      <div className="pbw-tabs">
        {tabs.map((t) => (
          <button key={t.id}
                  className={"pbw-tab" + (view === t.id ? " is-active" : "")}
                  onClick={() => setView(t.id)}>{t.label}</button>
        ))}
      </div>
      <div className="pbw-body">
        {view === "conversations" && <PbwConversations />}
        {view === "questions" && <PbwQuestions />}
        {view === "knowledge" && <PbwKnowledge />}
      </div>
    </div>
  );
}

window.PublicBotWorkspace = PublicBotWorkspace;
