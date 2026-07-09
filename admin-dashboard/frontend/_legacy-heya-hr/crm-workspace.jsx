// CRM Workspace — separate from the hiring dashboard.
// AI Chat = content generation studio (email drafts, marketing copy, image/video prompts).
// Inbox = compose/reply/conversation area.
// Service Requests = non-job website form submissions.
// Email Lists = organised recipient pools (not compose).
// Automations = future agent workflow UI.

const CRM_TABS = [
  { id: "overview",         label: "Overview" },
  { id: "inbox",            label: "Messages" },
  { id: "service-requests", label: "Service Requests" },
  { id: "email-lists",      label: "Email Lists" },
  { id: "ai-chat",          label: "AI Chat" },
  { id: "website-bots",     label: "Website Bots" },
  { id: "automations",      label: "Automations" },
];



const AUTOMATION_CARDS = [
  { icon: "🔄", title: "Follow-up Service Request",  desc: "Auto-draft a follow-up email 48 hrs after a new service request arrives." },
  { icon: "✉️", title: "Reply Draft",                desc: "Generate a reply draft for any new inbox message using AI." },
  { icon: "🎯", title: "Re-engage Talent List",      desc: "Monthly reminder to re-engage talent pool contacts not contacted in 90+ days." },
  { icon: "📋", title: "Weekly Employer Follow-up",  desc: "Send a weekly summary email to active employer leads." },
];

// ── Mention autocomplete helpers ──────────────────────────────────────────────

function makeMentionHandle(label, fallbackId = 0) {
  const handle = String(label || "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
  return handle || `Record${fallbackId}`;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SLASH_COMMANDS = [
  { token: "analyze",         label: "Analyze",         description: "AI analysis of this record", allowedTargets: ["talent","applicant","lead","service_request"] },
  { token: "research",        label: "Research",         description: "Deep background research",   allowedTargets: ["talent","applicant","lead"] },
  { token: "email",           label: "Email",            description: "Draft or send an email",     allowedTargets: ["talent","applicant","lead","service_request","message","email_list","position"] },
  { token: "agent",           label: "Start Agent",      description: "Launch an AI agent on this record", allowedTargets: ["lead","talent","applicant","service_request"], requiresConfirmation: true },
  { token: "mark-contacted",  label: "Mark Contacted",   description: "Mark lead as contacted",     allowedTargets: ["lead"], requiresConfirmation: true },
  { token: "create-lead",     label: "Create Lead",      description: "Create a follow-up lead",    allowedTargets: ["service_request","message"], requiresConfirmation: true },
  { token: "sync-leads",      label: "Sync Leads",       description: "Sync service requests into leads", requiresConfirmation: true },
  { token: "schedule-post",   label: "Schedule Post",    description: "Schedule social post",       allowedTargets: ["social_post"], requiresConfirmation: true },
  { token: "post-now",        label: "Post Now",         description: "Publish social post immediately", allowedTargets: ["social_post"], requiresConfirmation: true },
  { token: "social-plan",     label: "Social Plan",      description: "Generate a batch of social posts", allowedTargets: ["voice_profile"], requiresConfirmation: true },
  { token: "stop-agent",      label: "Stop Agent",       description: "Stop running agent",         allowedTargets: ["agent"], requiresConfirmation: true },
  { token: "restart-agent",   label: "Restart Agent",    description: "Restart agent",              allowedTargets: ["agent"], requiresConfirmation: true },
];

// ─── Helper ──────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-PG", { day: "numeric", month: "short" });
}

function cap(s) {
  const str = String(s || "");
  return str ? str[0].toUpperCase() + str.slice(1) : str;
}

function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {});
  } else {
    const el = document.createElement("textarea");
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }
}

// ─── Sub-panels ──────────────────────────────────────────────────────────────

function CrmOverview({ messages, serviceRequests, talentPool, applicants, employerSubmissions }) {
  const unread = messages.filter((m) => m.status === "unread").length;
  const srCount = serviceRequests.length;
  const talentEmails = talentPool.filter((t) => t.email).length;
  const applicantEmails = applicants.filter((a) => a.email).length;
  const employerEmails = employerSubmissions.filter((e) => e.email).length;

  const stats = [
    { label: "Unread Inbox",      value: unread,         sub: `of ${messages.length} total` },
    { label: "Service Requests",  value: srCount,        sub: "pending / new" },
    { label: "Talent Emails",     value: talentEmails,   sub: "in talent pool" },
    { label: "Applicant Emails",  value: applicantEmails,sub: "from applications" },
    { label: "Employer Emails",   value: employerEmails, sub: "employer leads" },
    { label: "Automations",       value: AUTOMATION_CARDS.length, sub: "available soon" },
  ];

  return (
    <div>
      <div className="crm-section-head">
        <div>
          <div className="crm-section-title">CRM Overview</div>
          <div className="crm-section-sub">Summary of all communication channels and contact lists.</div>
        </div>
      </div>
      <div className="crm-stat-grid">
        {stats.map((s) => (
          <div key={s.label} className="crm-card">
            <div className="crm-card__label">{s.label}</div>
            <div className="crm-card__value">{s.value}</div>
            <div className="crm-card__sub">{s.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Each folder has a UI `id` and an `apiFolder` (the exact backend folder value).
// Backend folder values: inbox | sent | draft | archive | trash | spam | scheduled.
// Starred/Important are flag-based views, not folders, so they have no apiFolder.
const MAIL_FOLDER_SECTIONS = [
  {
    id: "primary",
    label: "Mailbox",
    folders: [
      { id: "inbox",     label: "Inbox",     icon: "inbox", apiFolder: "inbox" },
      { id: "starred",   label: "Starred",   icon: "star" },
      { id: "important", label: "Important", icon: "alert" },
    ],
  },
  {
    id: "mail",
    label: "Mail",
    folders: [
      { id: "sent",      label: "Sent",     icon: "send", apiFolder: "sent" },
      { id: "drafts",    label: "Drafts",   icon: "file", apiFolder: "draft" },
    ],
  },
  {
    id: "cleanup",
    label: "Cleanup",
    folders: [
      { id: "archived", label: "Archived", icon: "archive", apiFolder: "archive" },
      { id: "spam",     label: "Spam",     icon: "octagon", apiFolder: "spam" },
      { id: "trash",    label: "Trash",    icon: "trash",   apiFolder: "trash" },
    ],
  },
];

function findMailFolder(folderId) {
  for (const section of MAIL_FOLDER_SECTIONS) {
    const f = section.folders.find((f) => f.id === folderId);
    if (f) return f;
  }
  return null;
}

// Resolve a UI folder id to the backend query params for /api/admin/email/messages.
// Starred/Important are flag views (no folder); everything else maps to its apiFolder.
function getEmailQueryForFolder(folderId) {
  if (folderId === "starred")   return { starred: true };
  if (folderId === "important") return { important: true };
  const meta = findMailFolder(folderId);
  return { folder: meta?.apiFolder || folderId };
}

function MailFolderIcon({ icon }) {
  const size = 14;
  const props = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" };
  switch (icon) {
    case "inbox":      return <svg {...props}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>;
    case "star":       return <svg {...props}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
    case "alert":      return <svg {...props}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
    case "send":       return <svg {...props}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
    case "file":       return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
    case "briefcase":  return <svg {...props}><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>;
    case "user":       return <svg {...props}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
    case "paperclip":  return <svg {...props}><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>;
    case "clock":      return <svg {...props}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
    case "mail":       return <svg {...props}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>;
    case "octagon":    return <svg {...props}><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
    case "trash":      return <svg {...props}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;
    case "archive":    return <svg {...props}><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>;
    default:           return <svg {...props}><rect x="3" y="3" width="18" height="18" rx="2"/></svg>;
  }
}

// Local view filter. The backend already returns only the selected folder's rows,
// so this is mostly a safety net. `status` here is the backend folder value
// (inbox/sent/draft/archive/trash/spam/scheduled) - see normalizeEmailMsg.
function folderFilter(messages, folderId) {
  switch (folderId) {
    case "inbox":     return messages.filter((m) => !["archive","trash","spam","sent","draft","scheduled"].includes(m.status));
    case "starred":   return messages.filter((m) => m.isStarred);
    case "important": return messages.filter((m) => m.isImportant);
    case "sent":      return messages.filter((m) => m.status === "sent");
    case "drafts":    return messages.filter((m) => m.status === "draft");
    case "scheduled": return messages.filter((m) => m.status === "scheduled");
    case "spam":      return messages.filter((m) => m.status === "spam");
    case "trash":     return messages.filter((m) => m.status === "trash");
    case "archived":  return messages.filter((m) => m.status === "archive");
    default:          return messages;
  }
}

function folderCount(messages, folderId) {
  const items = folderFilter(messages, folderId);
  if (folderId === "inbox") return items.filter((m) => m.status === "unread").length;
  return items.length;
}

// Normalise a crm_email_messages row for the existing folderFilter / display logic.
function normalizeEmailMsg(m) {
  const from    = m.from    || {};
  const toList  = Array.isArray(m.to) ? m.to : [];
  const status  = m.folder === "inbox"
    ? (m.isRead ? "read" : "unread")
    : (m.folder || "inbox");
  return {
    ...m,
    name:   from.name    || from.address || "Unknown",
    email:  from.address || "",
    phone:  "",
    body:   m.snippet    || m.textBody || "",
    toDisplay: toList.map((a) => a.address).filter(Boolean).join(", "),
    status,
    kind:   m.direction === "outbound" ? "sent" : "general",
    receivedAt: m.receivedAt || m.sentAt || m.createdAt,
    // keep isStarred, isImportant from model
  };
}

function CrmInbox({ messages: _legacyMessages, positions }) {
  const [folder, setFolder]                   = React.useState("inbox");
  const [search, setSearch]                   = React.useState("");
  const [activeMessage, setActiveMessage]     = React.useState(null);
  const [composing, setComposing]             = React.useState(false);
  const [compose, setCompose]                 = React.useState({ to: "", subject: "", body: "" });
  const [draftId, setDraftId]                 = React.useState(null);
  const [sending, setSending]                 = React.useState(false);

  // Email messages loaded from /api/admin/email
  const [rawEmailMessages, setRawEmailMessages] = React.useState([]);
  const [emailCounts, setEmailCounts]           = React.useState({});
  const [emailLoading, setEmailLoading]         = React.useState(true);
  const [syncStatus, setSyncStatus]             = React.useState(null); // null | "syncing" | "ok" | "error"
  const [emailHealth, setEmailHealth]           = React.useState(null);

  const [starOverrides, setStarOverrides]           = React.useState({});
  const [importantOverrides, setImportantOverrides] = React.useState({});
  const [statusOverrides, setStatusOverrides]       = React.useState({});
  const [deletedIds, setDeletedIds]                 = React.useState({});
  const [mailError, setMailError]             = React.useState(null);
  const [mailSuccess, setMailSuccess]         = React.useState(null);
  const [confirmDelete, setConfirmDelete]     = React.useState(null);
  const mailErrorTimer   = React.useRef(null);
  const mailSuccessTimer = React.useRef(null);

  function showMailError(msg) {
    setMailError(msg);
    clearTimeout(mailErrorTimer.current);
    mailErrorTimer.current = setTimeout(() => setMailError(null), 4000);
  }

  function showMailSuccess(msg) {
    setMailSuccess(msg);
    clearTimeout(mailSuccessTimer.current);
    mailSuccessTimer.current = setTimeout(() => setMailSuccess(null), 3000);
  }

  const openPrefilledCompose = React.useCallback((detail = {}) => {
    const next = {
      to: String(detail.to || "").trim(),
      subject: String(detail.subject || "").trim(),
      body: String(detail.body || "").trim(),
    };
    if (!next.to) return;
    setCompose(next);
    setComposing(true);
    setActiveMessage(null);
  }, []);

  React.useEffect(() => {
    const readPending = () => {
      try {
        const raw = sessionStorage.getItem(window.HEYA_PENDING_CRM_COMPOSE_KEY || "heya.pendingCrmCompose");
        if (!raw) return;
        sessionStorage.removeItem(window.HEYA_PENDING_CRM_COMPOSE_KEY || "heya.pendingCrmCompose");
        openPrefilledCompose(JSON.parse(raw));
      } catch (_) {}
    };
    const onCompose = (event) => openPrefilledCompose(event.detail || {});
    window.addEventListener("heya:crm-compose", onCompose);
    readPending();
    return () => window.removeEventListener("heya:crm-compose", onCompose);
  }, [openPrefilledCompose]);

  // Load email health once on mount
  React.useEffect(() => {
    window.HEYA_API?.getCrmEmailHealth?.()
      .then((d) => setEmailHealth(d.health))
      .catch(() => {});
  }, []);

  // Load email messages and counts when folder changes.
  // `silent` skips the loading spinner + error toast for background auto-refresh.
  function loadEmailMessages(targetFolder, { silent = false } = {}) {
    const f = targetFolder || folder;
    if (!silent) setEmailLoading(true);
    const query = getEmailQueryForFolder(f);

    Promise.all([
      window.HEYA_API.listCrmEmailMessages({ ...query, limit: 100 }),
      window.HEYA_API.getCrmEmailCounts(),
    ]).then(([msgData, countData]) => {
      setRawEmailMessages(msgData.messages || []);
      setEmailCounts(countData.counts || {});
      if (!silent) setEmailLoading(false);
    }).catch((err) => {
      if (!silent) {
        showMailError("Could not load messages: " + (err.message || "Unknown error"));
        setEmailLoading(false);
      }
    });
  }

  React.useEffect(() => {
    setStarOverrides({});
    setImportantOverrides({});
    setStatusOverrides({});
    loadEmailMessages(folder);
  }, [folder]);

  // Auto-refresh the inbox so new mail appears without clicking Sync:
  //  • reload from the DB every 45s (shows anything the server already synced)
  //  • pull new mail from IMAP every 3 min while the tab is open + IMAP is healthy
  // Runs silently (no spinner) and pauses while the browser tab is hidden.
  React.useEffect(() => {
    const RELOAD_MS = 45 * 1000;
    const SYNC_MS   = 3 * 60 * 1000;
    let lastSyncAt  = Date.now();
    const canSync = () => emailHealth?.configured !== false && emailHealth?.imap?.ok !== false;

    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (canSync() && Date.now() - lastSyncAt >= SYNC_MS) {
        lastSyncAt = Date.now();
        window.HEYA_API.syncCrmEmailInbox()
          .then(() => loadEmailMessages(folder, { silent: true }))
          .catch(() => loadEmailMessages(folder, { silent: true }));
      } else {
        loadEmailMessages(folder, { silent: true });
      }
    }, RELOAD_MS);

    return () => clearInterval(id);
  }, [folder, emailHealth]);

  async function handleSync() {
    // Short-circuit if health already reports IMAP is down - no backend request.
    if (emailHealth?.configured === false || emailHealth?.imap?.ok === false) {
      const reason = emailHealth?.imap?.error;
      showMailError("Cannot sync inbox because IMAP is not connected." + (reason ? ` Reason: ${reason}` : ""));
      return;
    }
    setSyncStatus("syncing");
    try {
      const r = await window.HEYA_API.syncCrmEmailInbox();
      setSyncStatus("ok");
      showMailSuccess(`Sync complete: ${r.sync?.inserted || 0} new message(s).`);
      loadEmailMessages(folder);
    } catch (err) {
      setSyncStatus("error");
      showMailError("Sync failed: " + (err.message || "Unknown error"));
    }
    setTimeout(() => setSyncStatus(null), 3000);
  }

  const messages = React.useMemo(() => rawEmailMessages
    .filter((m) => !deletedIds[m.id])
    .map((m) => {
      const norm = normalizeEmailMsg(m);
      return {
        ...norm,
        isStarred:   starOverrides.hasOwnProperty(m.id)      ? starOverrides[m.id]      : norm.isStarred,
        isImportant: importantOverrides.hasOwnProperty(m.id) ? importantOverrides[m.id] : norm.isImportant,
        status:      statusOverrides.hasOwnProperty(m.id)    ? statusOverrides[m.id]    : norm.status,
      };
    }), [rawEmailMessages, starOverrides, importantOverrides, statusOverrides, deletedIds]);

  const folderMessages = React.useMemo(() => folderFilter(messages, folder), [messages, folder]);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return folderMessages;
    const q = search.toLowerCase();
    return folderMessages.filter((m) =>
      [m.subject, m.name, m.email, m.body, m.status, m.toDisplay]
        .some((v) => v && String(v).toLowerCase().includes(q))
    );
  }, [folderMessages, search]);

  // Use real counts from API if available, else count locally
  function getCount(folderId) {
    if (folderId === "inbox")     return emailCounts.unread     ?? folderCount(messages, folderId);
    if (folderId === "starred")   return emailCounts.starred    ?? folderCount(messages, folderId);
    if (folderId === "important") return emailCounts.important  ?? folderCount(messages, folderId);
    if (folderId === "sent")      return emailCounts.sent       ?? folderCount(messages, folderId);
    if (folderId === "drafts")    return emailCounts.draft      ?? folderCount(messages, folderId);
    if (folderId === "spam")      return emailCounts.spam       ?? folderCount(messages, folderId);
    if (folderId === "trash")     return emailCounts.trash      ?? folderCount(messages, folderId);
    if (folderId === "archived")  return emailCounts.archive    ?? folderCount(messages, folderId);
    return folderCount(messages, folderId);
  }

  async function openMessage(msg) {
    setActiveMessage(msg);
    if (!msg.isRead && msg.status === "unread") {
      setStatusOverrides((prev) => ({ ...prev, [msg.id]: "read" }));
      try {
        await window.HEYA_API.markCrmEmailRead(msg.id, true);
        setEmailCounts((prev) => ({ ...prev, unread: Math.max(0, (prev.unread || 1) - 1) }));
      } catch {
        setStatusOverrides((prev) => ({ ...prev, [msg.id]: "unread" }));
      }
    }
  }

  async function toggleStar(e, msg) {
    e.stopPropagation();
    const next = !msg.isStarred;
    setStarOverrides((prev) => ({ ...prev, [msg.id]: next }));
    try {
      await window.HEYA_API.starCrmEmail(msg.id, next);
    } catch {
      setStarOverrides((prev) => ({ ...prev, [msg.id]: !next }));
      showMailError("Could not update starred state. Please try again.");
    }
  }

  async function toggleImportant(e, msg) {
    if (e) e.stopPropagation();
    const next = !msg.isImportant;
    setImportantOverrides((prev) => ({ ...prev, [msg.id]: next }));
    if (activeMessage?.id === msg.id) setActiveMessage((prev) => ({ ...prev, isImportant: next }));
    try {
      await window.HEYA_API.markCrmEmailImportant(msg.id, next);
    } catch {
      setImportantOverrides((prev) => ({ ...prev, [msg.id]: !next }));
      if (activeMessage?.id === msg.id) setActiveMessage((prev) => ({ ...prev, isImportant: !next }));
      showMailError("Could not update important state. Please try again.");
    }
  }

  async function performMailAction(e, msg, action) {
    if (e) e.stopPropagation();
    const prevStatus = msg.status;
    const api = window.HEYA_API;
    try {
      switch (action) {
        case "archive":
          setStatusOverrides((prev) => ({ ...prev, [msg.id]: "archive" }));
          if (activeMessage?.id === msg.id) setActiveMessage(null);
          await api.archiveCrmEmail(msg.id);
          loadEmailMessages(folder);
          break;
        case "trash":
          setStatusOverrides((prev) => ({ ...prev, [msg.id]: "trash" }));
          if (activeMessage?.id === msg.id) setActiveMessage(null);
          await api.trashCrmEmail(msg.id);
          loadEmailMessages(folder);
          break;
        case "restore":
          setStatusOverrides((prev) => ({ ...prev, [msg.id]: "unread" }));
          if (activeMessage?.id === msg.id) setActiveMessage({ ...msg, status: "unread" });
          await api.restoreCrmEmail(msg.id);
          loadEmailMessages(folder);
          break;
        case "spam":
          setStatusOverrides((prev) => ({ ...prev, [msg.id]: "spam" }));
          if (activeMessage?.id === msg.id) setActiveMessage(null);
          await api.spamCrmEmail(msg.id);
          loadEmailMessages(folder);
          break;
        case "mark-read":
          setStatusOverrides((prev) => ({ ...prev, [msg.id]: "read" }));
          if (activeMessage?.id === msg.id) setActiveMessage({ ...msg, status: "read" });
          await api.markCrmEmailRead(msg.id, true);
          break;
        case "mark-unread":
          setStatusOverrides((prev) => ({ ...prev, [msg.id]: "unread" }));
          if (activeMessage?.id === msg.id) setActiveMessage({ ...msg, status: "unread" });
          await api.markCrmEmailRead(msg.id, false);
          break;
        default:
          return;
      }
    } catch {
      setStatusOverrides((prev) => ({ ...prev, [msg.id]: prevStatus }));
      showMailError(`Could not ${action} message. Please try again.`);
    }
  }

  async function confirmDeleteForever(msg) {
    setConfirmDelete(null);
    setDeletedIds((prev) => ({ ...prev, [msg.id]: true }));
    if (activeMessage?.id === msg.id) setActiveMessage(null);
    try {
      await window.HEYA_API.deleteCrmEmailForever(msg.id);
      loadEmailMessages(folder);
    } catch {
      setDeletedIds((prev) => { const n = { ...prev }; delete n[msg.id]; return n; });
      showMailError("Could not permanently delete message. Please try again.");
    }
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!compose.to.trim() || !compose.subject.trim() || !compose.body.trim()) {
      showMailError("To, Subject, and body are required to send.");
      return;
    }
    setSending(true);
    try {
      await window.HEYA_API.sendCrmEmail({
        to:      compose.to,
        subject: compose.subject,
        text:    compose.body,
      });
      setCompose({ to: "", subject: "", body: "" });
      setComposing(false);
      setDraftId(null);
      showMailSuccess("Email sent.");
      loadEmailMessages("sent");
      setTimeout(() => setFolder("sent"), 100);
    } catch (err) {
      showMailError("Send failed: " + (err.message || "Unknown error"));
    } finally {
      setSending(false);
    }
  }

  async function handleSaveDraft() {
    try {
      if (draftId) {
        await window.HEYA_API.updateCrmEmailDraft(draftId, {
          to: compose.to, subject: compose.subject, text: compose.body,
        });
      } else {
        const d = await window.HEYA_API.createCrmEmailDraft({
          to: compose.to, subject: compose.subject, text: compose.body,
        });
        setDraftId(d.draft?.id || null);
      }
      showMailSuccess("Draft saved.");
    } catch (err) {
      showMailError("Could not save draft: " + (err.message || "Unknown error"));
    }
  }

  return (
    <div className="crm-mail-shell">

      {/* Left sidebar */}
      <div className="crm-mail-sidebar">
        <nav className="crm-mail-folder-list">
          {MAIL_FOLDER_SECTIONS.map((section) => (
            <div key={section.id} className="crm-mail-folder-section">
              <div className="crm-mail-folder-section__label">{section.label}</div>
              {section.folders.map((f) => {
                const count = getCount(f.id);
                return (
                  <button
                    key={f.id}
                    className={"crm-mail-folder" + (folder === f.id ? " active" : "")}
                    onClick={() => { setFolder(f.id); setSearch(""); }}
                  >
                    <span className="crm-mail-folder__icon"><MailFolderIcon icon={f.icon} /></span>
                    <span className="crm-mail-folder__label">{f.label}</span>
                    {count > 0 && <span className="crm-mail-folder__count">{count}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* Right panel */}
      <div className="crm-mail-main">
        <div className="crm-mail-toolbar">
          <div className="crm-mail-title">{findMailFolder(folder)?.label || "Inbox"}</div>
          <div className="crm-mail-search">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              placeholder="Search messages..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="crm-mail-toolbar-actions">
            <button
              className={"crm-mail-sync-btn crm-mail-sync-btn--icon" + (syncStatus === "syncing" ? " is-syncing" : "")}
              onClick={handleSync}
              disabled={syncStatus === "syncing"}
              aria-label="Sync inbox"
              title={
                emailHealth?.configured === false ? "Email is not configured"
                : emailHealth?.imap?.ok === false ? "IMAP is not connected"
                : "Sync inbox from Spacemail IMAP"
              }
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.76"/></svg>
            </button>
            <button className="crm-mail-compose-btn" onClick={() => setComposing(true)} title="Compose new email">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Compose
            </button>
          </div>
        </div>

        {emailHealth && emailHealth.configured === false && (
          <div className="crm-mail-warning">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>Email is not configured. Set Spacemail SMTP/IMAP env values to send or sync.</span>
          </div>
        )}

        {emailHealth && emailHealth.configured !== false && (emailHealth.imap?.ok === false || emailHealth.smtp?.ok === false) && (
          <div className="crm-mail-warning">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>
              {emailHealth.imap?.ok === false && <React.Fragment>IMAP not connected — {emailHealth.imap.error || "unknown error"}. </React.Fragment>}
              {emailHealth.smtp?.ok === false && <React.Fragment>SMTP not connected — {emailHealth.smtp.error || "unknown error"}.</React.Fragment>}
            </span>
          </div>
        )}

        {mailError && (
          <div className="crm-mail-error">
            <span>{mailError}</span>
            <button type="button" onClick={() => setMailError(null)} aria-label="Dismiss">x</button>
          </div>
        )}

        {mailSuccess && (
          <div className="crm-mail-success">
            <span>{mailSuccess}</span>
            <button type="button" onClick={() => setMailSuccess(null)} aria-label="Dismiss">x</button>
          </div>
        )}

        {composing && (
          <div className="crm-compose crm-compose--inline">
            <div className="crm-compose-head">New Message</div>
            <div className="crm-compose-field"><label>To</label><input value={compose.to} onChange={(e) => setCompose({ ...compose, to: e.target.value })} placeholder="recipient@email.com" /></div>
            <div className="crm-compose-field"><label>Subject</label><input value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} placeholder="Subject..." /></div>
            <div className="crm-compose-body">
              <textarea value={compose.body} onChange={(e) => setCompose({ ...compose, body: e.target.value })} placeholder="Write your message..." />
            </div>
            <div className="crm-compose-foot crm-compose-toolbar">
              {/* Send pill */}
              <div className="crm-compose-send-group">
                <button
                  type="button"
                  className="crm-compose-send-btn"
                  disabled={
                    sending
                    || !compose.to.trim()
                    || !compose.subject.trim()
                    || !compose.body.trim()
                    || emailHealth?.configured === false
                    || emailHealth?.smtp?.ok === false
                  }
                  title={
                    emailHealth?.configured === false ? "Email is not configured"
                    : emailHealth?.smtp?.ok === false ? "SMTP is not connected"
                    : (!compose.to.trim() || !compose.subject.trim() || !compose.body.trim()) ? "To, subject, and body are required"
                    : "Send email"
                  }
                  onClick={handleSend}
                >
                  {sending ? "Sending..." : "Send"}
                </button>
                <button type="button" className="crm-compose-send-menu" disabled title="Send options coming soon">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
              </div>

              {/* Formatting + attachment tools - visual only until backend is ready */}
              <div className="crm-compose-tools">
                <button type="button" className="crm-compose-tool" disabled aria-disabled="true" title="Formatting - coming soon">
                  <span style={{ fontWeight: 700, fontSize: 13, fontFamily: "serif" }}>A</span>
                </button>
                <button type="button" className="crm-compose-tool" disabled aria-disabled="true" title="Writing tools - coming soon">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7l1 1-3 3-1-1V5.73A2 2 0 0 1 10 4a2 2 0 0 1 2-2z"/><path d="M9 17H5a2 2 0 0 0-2 2v1h18v-1a2 2 0 0 0-2-2h-4"/><path d="M9 17l3-3 3 3"/></svg>
                </button>
                <div className="crm-compose-tool-divider" />
                <button type="button" className="crm-compose-tool" disabled aria-disabled="true" title="Attachments coming soon">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                </button>
                <button type="button" className="crm-compose-tool" disabled aria-disabled="true" title="Insert link - coming soon">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                </button>
                <button type="button" className="crm-compose-tool" disabled aria-disabled="true" title="Emoji - coming soon">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                </button>
                <button type="button" className="crm-compose-tool" disabled aria-disabled="true" title="Insert image - coming soon">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                </button>
                <div className="crm-compose-tool-divider" />
                <button type="button" className="crm-compose-tool" disabled aria-disabled="true" title="Confidential mode - coming soon">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </button>
                <button type="button" className="crm-compose-tool" disabled aria-disabled="true" title="Signature - coming soon">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                </button>
                <button type="button" className="crm-compose-tool" disabled aria-disabled="true" title="More options - coming soon">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                </button>
              </div>

              {/* Save draft */}
              <button
                type="button"
                className="crm-compose-tool"
                title="Save draft"
                style={{ fontSize: 11, fontWeight: 600, padding: "0 8px", width: "auto" }}
                onClick={handleSaveDraft}
              >
                Save
              </button>

              {/* Discard - always active */}
              <button
                type="button"
                className="crm-compose-trash"
                title="Discard"
                onClick={() => { setCompose({ to: "", subject: "", body: "" }); setComposing(false); setDraftId(null); }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              </button>
            </div>
          </div>
        )}

        {/* List + reading pane split */}
        <div className={"crm-mail-body" + (activeMessage ? " has-reader" : "")}>

          {/* Message list */}
          <div className="crm-mail-list">
            {emailLoading ? (
              <div className="crm-empty">
                <div className="crm-empty__title" style={{ color: "#94a3b8" }}>Loading...</div>
              </div>
            ) : filtered.length === 0 && (
              <div className="crm-empty">
                <div className="crm-empty__icon" style={{ fontSize: 28, color: "#cbd5e1" }}>&#9993;</div>
                <div className="crm-empty__title">No messages</div>
                <div className="crm-empty__body">{search ? "No messages match your search." : "This folder is empty."}</div>
              </div>
            )}
            {filtered.map((msg) => (
              <div
                key={msg.id}
                className={"crm-mail-row" + (msg.status === "unread" ? " is-unread" : "") + (activeMessage?.id === msg.id ? " is-selected" : "")}
                onClick={() => openMessage(msg)}
              >
                <div className={"crm-mail-dot" + (msg.status !== "unread" ? " is-read" : "")} />
                <button
                  className={"crm-mail-star" + (msg.isStarred ? " is-starred" : "")}
                  onClick={(e) => toggleStar(e, msg)}
                  title={msg.isStarred ? "Unstar" : "Star"}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill={msg.isStarred ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                </button>
                <div className="crm-mail-row__sender">
                  <span className="crm-mail-row__name">{msg.name || "Unknown"}</span>
                </div>
                <div className="crm-mail-row__content">
                  <span className="crm-mail-row__subject">{msg.subject || "No subject"}</span>
                  {msg.body && <span className="crm-mail-row__preview"> - {msg.body.slice(0, 80)}</span>}
                </div>
                <div className="crm-mail-row__time">{fmtDate(msg.receivedAt || msg.createdAt)}</div>
                <div className="crm-mail-row__actions" onClick={(e) => e.stopPropagation()}>
                  {msg.status === "trash" ? (
                    <>
                      <button className="crm-mail-row__act" title="Restore" onClick={(e) => performMailAction(e, msg, "restore")}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.76"/></svg>
                      </button>
                      <button className="crm-mail-row__act crm-mail-row__act--danger" title="Delete forever" onClick={(e) => { e.stopPropagation(); setConfirmDelete(msg); }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    </>
                  ) : (
                    <>
                      <button className={"crm-mail-row__act" + (msg.isImportant ? " is-important" : "")} title={msg.isImportant ? "Unmark important" : "Mark important"} onClick={(e) => toggleImportant(e, msg)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill={msg.isImportant ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      </button>
                      <button className="crm-mail-row__act" title={msg.status === "unread" ? "Mark read" : "Mark unread"} onClick={(e) => performMailAction(e, msg, msg.status === "unread" ? "mark-read" : "mark-unread")}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                      </button>
                      <button className="crm-mail-row__act" title="Archive" onClick={(e) => performMailAction(e, msg, "archive")}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
                      </button>
                      <button className="crm-mail-row__act" title="Move to trash" onClick={(e) => performMailAction(e, msg, "trash")}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Inline reading pane */}
          {activeMessage && (
            <div className="crm-mail-reader">
              {/* Reader header */}
              <div className="crm-mail-reader__head">
                <div className="crm-mail-reader__head-top">
                  <div className="crm-mail-reader__subject">{activeMessage.subject || "No subject"}</div>
                  <button
                    type="button"
                    className="crm-mail-reader__close"
                    onClick={() => setActiveMessage(null)}
                    title="Close"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
                <div className="crm-mail-reader__meta-row">
                  <span className={"crm-mail-reader__status crm-mail-reader__status--" + (activeMessage.status || "read")}>
                    {activeMessage.status || "read"}
                  </span>
                  {activeMessage.isImportant && (
                    <span className="crm-mail-kind-chip crm-mail-kind-chip--important">Important</span>
                  )}
                  <span className="crm-mail-reader__date">{fmtDate(activeMessage.receivedAt || activeMessage.createdAt)}</span>
                </div>
              </div>

              {/* Sender card */}
              <div className="crm-mail-reader__sender">
                <div className="crm-mail-reader__avatar">
                  {(activeMessage.name || activeMessage.email || "?").trim().charAt(0).toUpperCase()}
                </div>
                <div className="crm-mail-reader__sender-info">
                  <div className="crm-mail-reader__sender-name">{activeMessage.name || "Unknown sender"}</div>
                  <div className="crm-mail-reader__sender-detail">
                    {activeMessage.email || "No email"}
                  </div>
                  {activeMessage.toDisplay ? (
                    <div className="crm-mail-reader__sender-detail" style={{ marginTop: 2 }}>
                      <span style={{ color: "#94a3b8" }}>To: </span>{activeMessage.toDisplay}
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Body - render plain text; HTML is shown as a sanitized text fallback */}
              <div className="crm-mail-reader__body" style={{ whiteSpace: "pre-wrap" }}>
                {activeMessage.textBody
                  || activeMessage.body
                  || (activeMessage.htmlBody ? activeMessage.htmlBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "")
                  || "No message body."}
              </div>

              {/* Attachments */}
              {(activeMessage.attachments?.length > 0) && (
                <div className="crm-mail-reader__attachments">
                  <div className="crm-mail-reader__attachments-label">Attachments ({activeMessage.attachments.length})</div>
                  <div className="crm-mail-reader__attachment-row">
                    {activeMessage.attachments.map((att) => (
                      <a
                        key={att.id}
                        className="crm-mail-reader__attachment"
                        href={`/api/admin/email/attachments/${encodeURIComponent(att.id)}/download`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        <div>
                          <span>{att.filename || "Attachment"}</span>
                          <small>{att.sizeBytes ? `${Math.round(att.sizeBytes / 1024)} KB` : "Download"}</small>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer actions */}
              <div className="crm-mail-reader__foot">
                <button type="button" className="crm-mail-reader__action-btn" onClick={() => setActiveMessage(null)}>
                  Back to list
                </button>
                <div className="crm-mail-reader__foot-actions">
                  {activeMessage.status === "trash" ? (
                    <>
                      <button type="button" className="crm-mail-reader__action-btn" onClick={(e) => performMailAction(e, activeMessage, "restore")} title="Restore from trash">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.76"/></svg>
                        Restore
                      </button>
                      <button type="button" className="crm-mail-reader__action-btn crm-mail-reader__action-btn--danger" onClick={() => setConfirmDelete(activeMessage)} title="Delete forever">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        Delete forever
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="crm-mail-reader__action-btn" onClick={(e) => performMailAction(e, activeMessage, activeMessage.status === "unread" ? "mark-read" : "mark-unread")}>
                        {activeMessage.status === "unread" ? "Mark read" : "Mark unread"}
                      </button>
                      <button type="button" className={"crm-mail-reader__action-btn" + (activeMessage.isImportant ? " is-important" : "")} onClick={(e) => toggleImportant(e, activeMessage)} title={activeMessage.isImportant ? "Unmark important" : "Mark important"}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill={activeMessage.isImportant ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        {activeMessage.isImportant ? "Important" : "Mark important"}
                      </button>
                      <button type="button" className="crm-mail-reader__action-btn" onClick={(e) => performMailAction(e, activeMessage, "archive")}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
                        Archive
                      </button>
                      <button type="button" className="crm-mail-reader__action-btn" onClick={(e) => performMailAction(e, activeMessage, "trash")}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        Trash
                      </button>
                      {activeMessage.status !== "spam" && (
                        <button type="button" className="crm-mail-reader__action-btn" onClick={(e) => performMailAction(e, activeMessage, "spam")}>
                          Spam
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete-forever confirm dialog */}
      {confirmDelete && (
        <div className="crm-modal-scrim" onClick={() => setConfirmDelete(null)}>
          <div className="crm-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="crm-modal-title">Delete forever?</div>
            <div className="crm-modal-body">
              <strong>{confirmDelete.name || "This message"}</strong> will be permanently removed and cannot be recovered.
            </div>
            <div className="crm-modal-foot">
              <button type="button" className="crm-modal-btn crm-modal-btn--cancel" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button type="button" className="crm-modal-btn crm-modal-btn--danger" onClick={() => confirmDeleteForever(confirmDelete)}>Delete forever</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Service Request grouping ─────────────────────────────────────────────────

const SR_GROUPS = [
  { id: "all",         label: "All Requests" },
  { id: "contact",     label: "General Contact" },
  { id: "recruitment", label: "Recruitment / Staffing" },
  { id: "labour-hire", label: "Labour Hire" },
  { id: "immigration", label: "Immigration / Passport / Visa" },
  { id: "training",    label: "Training" },
  { id: "vacancy",     label: "Vacancy Enquiries" },
  { id: "other",       label: "Other Services" },
  { id: "spam",        label: "Spam" },
];

const SR_STATUS_OPTIONS = [
  { id: "all",         label: "All statuses" },
  { id: "new",         label: "New" },
  { id: "unread",      label: "Unread" },
  { id: "read",        label: "Read" },
  { id: "in-progress", label: "In Progress" },
  { id: "resolved",    label: "Resolved" },
  { id: "spam",        label: "Spam" },
];

const SR_SORT_OPTIONS = [
  { id: "newest",  label: "Newest first" },
  { id: "oldest",  label: "Oldest first" },
  { id: "name",    label: "Name A-Z" },
  { id: "company", label: "Company A-Z" },
  { id: "service", label: "Service A-Z" },
];

const SR_SOURCE_OPTIONS = [
  { id: "contact", label: "Contact Form" },
  { id: "vacancy", label: "Vacancy Enquiry" },
  { id: "message", label: "Inbox Message" },
  { id: "service", label: "Service Form" },
];

const DEFAULT_SR_FILTERS = {
  query: "",
  groups: [],
  statuses: [],
  sources: [],
  sort: "newest",
};

const SR_FILTER_GROUPS = SR_GROUPS.filter((g) => g.id !== "all");
const SR_FILTER_STATUSES = SR_STATUS_OPTIONS.filter((s) => s.id !== "all");

function cloneSrFilters(filters = DEFAULT_SR_FILTERS) {
  return {
    query: filters.query || "",
    groups: [...(filters.groups || [])],
    statuses: [...(filters.statuses || [])],
    sources: [...(filters.sources || [])],
    sort: filters.sort || "newest",
  };
}

function srActiveFilterCount(filters) {
  return (filters.groups?.length || 0) + (filters.statuses?.length || 0) + (filters.sources?.length || 0);
}

function sourceLabelForRequest(r) {
  const source = r.sourceType || r.type;
  if (source === "vacancy") return "Vacancy";
  if (source === "message") return "Inbox Message";
  if (source === "contact") return "Contact Form";
  if (source === "service") return "Service Form";
  return r.type || "Service Request";
}

function requestSourceType(r) {
  const source = r.sourceType || r.type;
  if (source === "service") return "service";
  if (source === "vacancy") return "vacancy";
  if (source === "message") return "message";
  return "contact";
}

function matchesServiceRequestFilters(r, filters) {
  const spam = isSpamReq(r);
  const groups = filters.groups || [];
  const statuses = filters.statuses || [];
  const sources = filters.sources || [];

  if (groups.length === 0) {
    if (spam) return false;
  } else {
    const wantsSpam = groups.includes("spam");
    const normalGroups = groups.filter((g) => g !== "spam");
    let groupMatch = false;
    if (wantsSpam && (spam || r.autoSpam)) groupMatch = true;
    if (normalGroups.length && normalGroups.includes(r._group) && !spam) groupMatch = true;
    if (!groupMatch) return false;
  }

  if (statuses.length && !statuses.includes(r.status || "new")) return false;
  if (sources.length && !sources.includes(requestSourceType(r))) return false;

  const q = String(filters.query || "").trim().toLowerCase();
  if (q) {
    const hay = [
      r.id, r.name, r.companyName, r.email, r.phone, r.serviceNeeded,
      r.subject, r.message, r.status, r.sourcePath, r.type, r.sourceType,
      r.serviceGroup, r.serviceCategory, sourceLabelForRequest(r),
    ].filter(Boolean).join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function buildAgentPromptForRequest(r) {
  return [
    "Help me follow up this service request:",
    `Ref: ${r.id || ""}`,
    `Name: ${r.name || ""}`,
    `Email: ${r.email || ""}`,
    `Phone: ${r.phone || ""}`,
    `Service: ${r.serviceNeeded || r.subject || ""}`,
    `Source: ${sourceLabelForRequest(r)}`,
    r.message ? `Message: ${r.message}` : "",
  ].filter(Boolean).join("\n");
}

function openAgentForRequest(r) {
  const payload = {
    sourceType: "service-request",
    sourceId: r.id,
    name: r.name || "",
    email: r.email || "",
    phone: r.phone || "",
    service: r.serviceNeeded || r.subject || "",
    message: r.message || "",
    source: sourceLabelForRequest(r),
    prompt: buildAgentPromptForRequest(r),
  };
  try {
    sessionStorage.setItem("heya.pendingCrmAgentContext", JSON.stringify(payload));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("heya:crm-agent-context", { detail: payload }));
}

function ServiceRequestFilterModal({
  draftFilters,
  setDraftFilters,
  groupCounts,
  onImplement,
  onCancel,
}) {
  function toggleList(key, id) {
    setDraftFilters((prev) => {
      const list = prev[key] || [];
      const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
      return { ...prev, [key]: next };
    });
  }

  function removeDraftChip(key, id) {
    setDraftFilters((prev) => ({ ...prev, [key]: (prev[key] || []).filter((x) => x !== id) }));
  }

  const draftTags = [
    ...(draftFilters.groups || []).map((id) => ({ key: "groups", id, label: SR_GROUPS.find((g) => g.id === id)?.label || id })),
    ...(draftFilters.statuses || []).map((id) => ({ key: "statuses", id, label: SR_STATUS_OPTIONS.find((s) => s.id === id)?.label || id })),
    ...(draftFilters.sources || []).map((id) => ({ key: "sources", id, label: SR_SOURCE_OPTIONS.find((s) => s.id === id)?.label || id })),
  ];

  return (
    <div className="crm-sr-filter-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="crm-sr-filter-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Filter service requests">
        <div className="crm-sr-filter-modal__header">
          <span className="crm-sr-filter-modal__title">Filter service requests</span>
          <button type="button" className="icon-btn" onClick={onCancel} aria-label="Close"><I.X /></button>
        </div>
        <div className="crm-sr-filter-modal__body">
          <div className="crm-sr-filter-modal__search">
            <input
              className="crm-sr-filter-modal__search-input"
              placeholder="Search name, email, service, ref…"
              value={draftFilters.query || ""}
              onChange={(e) => setDraftFilters((prev) => ({ ...prev, query: e.target.value }))}
            />
          </div>
          <div className="crm-sr-filter-modal__section">
            <div className="crm-sr-filter-modal__section-title">Service group</div>
            <div className="crm-sr-filter-tags">
              {SR_FILTER_GROUPS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={"crm-sr-filter-tag" + ((draftFilters.groups || []).includes(g.id) ? " is-selected" : "")}
                  onClick={() => toggleList("groups", g.id)}
                >
                  {g.label}{groupCounts[g.id] != null ? ` (${groupCounts[g.id]})` : ""}
                </button>
              ))}
            </div>
          </div>
          <div className="crm-sr-filter-modal__section">
            <div className="crm-sr-filter-modal__section-title">Status</div>
            <div className="crm-sr-filter-tags">
              {SR_FILTER_STATUSES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={"crm-sr-filter-tag" + ((draftFilters.statuses || []).includes(s.id) ? " is-selected" : "")}
                  onClick={() => toggleList("statuses", s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="crm-sr-filter-modal__section">
            <div className="crm-sr-filter-modal__section-title">Source type</div>
            <div className="crm-sr-filter-tags">
              {SR_SOURCE_OPTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={"crm-sr-filter-tag" + ((draftFilters.sources || []).includes(s.id) ? " is-selected" : "")}
                  onClick={() => toggleList("sources", s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="crm-sr-filter-modal__section">
            <div className="crm-sr-filter-modal__section-title">Sort</div>
            <div className="crm-sr-filter-tags">
              {SR_SORT_OPTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={"crm-sr-filter-tag" + (draftFilters.sort === s.id ? " is-selected" : "")}
                  onClick={() => setDraftFilters((prev) => ({ ...prev, sort: s.id }))}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          {draftTags.length > 0 && (
            <div className="crm-sr-filter-modal__chips">
              <div className="crm-sr-filter-modal__section-title">Active filters</div>
              <div className="crm-sr-filter-modal__chip-list">
                {draftTags.map((tag) => (
                  <span key={tag.key + tag.id} className="crm-sr-filter-modal__chip">
                    {tag.label}
                    <button type="button" onClick={() => removeDraftChip(tag.key, tag.id)} aria-label={"Remove " + tag.label}>×</button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="crm-sr-filter-modal__actions">
          <button type="button" className="btn ghost sm" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn accent sm" onClick={onImplement}>Apply filters</button>
        </div>
      </div>
    </div>
  );
}

function sortServiceRequests(list, sort) {
  const copy = [...list];
  const dateVal = (r) => new Date(r.submittedAt || r.createdAt || 0).getTime();
  const textVal = (r, field) => {
    if (field === "name") return (r.name || "").toLowerCase();
    if (field === "company") return (r.companyName || "").toLowerCase();
    if (field === "service") return (r.serviceNeeded || r.subject || "").toLowerCase();
    return "";
  };
  switch (sort) {
    case "oldest":
      return copy.sort((a, b) => dateVal(a) - dateVal(b));
    case "name":
      return copy.sort((a, b) => textVal(a, "name").localeCompare(textVal(b, "name")));
    case "company":
      return copy.sort((a, b) => textVal(a, "company").localeCompare(textVal(b, "company")));
    case "service":
      return copy.sort((a, b) => textVal(a, "service").localeCompare(textVal(b, "service")));
    case "newest":
    default:
      return copy.sort((a, b) => dateVal(b) - dateVal(a));
  }
}

const SR_GROUP_COLORS = {
  "vacancy":     { bg: "#e0f2fe", text: "#0369a1" },
  "immigration": { bg: "#ede9fe", text: "#6d28d9" },
  "labour-hire": { bg: "#fef3c7", text: "#92400e" },
  "recruitment": { bg: "#dcfce7", text: "#166534" },
  "training":    { bg: "#fce7f3", text: "#9d174d" },
  "contact":     { bg: "#f1f5f9", text: "#334155" },
  "other":       { bg: "#f4f4f5", text: "#52525b" },
  "spam":        { bg: "#fee2e2", text: "#b91c1c" },
};

function isSpamReq(r)  { return r.status === "spam"; }

function getServiceRequestGroup(r) {
  if (r.serviceGroup) return r.serviceGroup;
  if (r.type === "vacancy") return "vacancy";
  if (r.type === "service") {
    const svc = String(r.serviceNeeded || "").toLowerCase();
    if (/recruit|talent acquisition|talent marketing|advertising.*talent|advertising.*sourc/.test(svc)) return "recruitment";
    if (/immigration|visa|passport|work.?permit|mobility service/.test(svc)) return "immigration";
    if (/labour.?hire|labor.?hire|workforce solution|workforce management|onboard|mobil/.test(svc)) return "labour-hire";
    if (/training|job.?ready|course|certificate|upskill/.test(svc)) return "training";
    if (/hr|workforce support|advisory|consulting/.test(svc)) return "other";
    return "other";
  }
  const hay = [r.serviceNeeded, r.subject, r.message, r.sourcePath]
    .filter(Boolean).join(" ").toLowerCase();
  if (/visa|passport|immigration|work.?permit/.test(hay)) return "immigration";
  if (/labour.?hire|labor.?hire|shutdown|operations.?support/.test(hay)) return "labour-hire";
  if (/recruit|staffing|manpower|workforce|sourcing|hiring/.test(hay)) return "recruitment";
  if (/training|course|certificate|upskill/.test(hay)) return "training";
  if (r.type === "contact" || !hay) return "contact";
  return "other";
}

function srEmailButtonProps(r) {
  const subject = r.serviceNeeded || r.subject || "Service request";
  return {
    email: r.email,
    name: r.name,
    sourceType: "service-request",
    sourceLabel: "Service Request",
    sourceId: r.id,
    subject: "Glondiasites - " + subject,
    body: "Hello " + (r.name || "") + ",\n\nThank you for contacting Glondiasites about " + subject + ".\n\n",
  };
}

function ServiceRequestActions({ r, busy, copiedId, onCopy, onView, onAgent, onSpam, onNotSpam, onDelete, compact = false }) {
  const spam = isSpamReq(r);
  return (
    <div className={"crm-sr-card__actions" + (compact ? " crm-sr-card__actions--compact" : "")}>
      {r.email && (
        <window.CrmEmailActionButton
          className="crm-sr-action-btn crm-sr-action-btn--icon"
          {...srEmailButtonProps(r)}
          title="Email"
        >
          {compact ? (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              Email
            </>
          )}
        </window.CrmEmailActionButton>
      )}
      <button type="button" className="crm-sr-action-btn crm-sr-action-btn--icon" onClick={() => onCopy(r)} title="Copy contact details">
        {copiedId === r.id ? (compact ? "✓" : "Copied ✓") : (compact ? <i className="fa-regular fa-copy" /> : "Copy")}
      </button>
      <button type="button" className="crm-sr-action-btn crm-sr-action-btn--icon" onClick={() => onAgent(r)} title="Agent bot" disabled={busy}>
        <i className="fa-solid fa-robot" aria-hidden="true" />
        {!compact && <span>Agent</span>}
      </button>
      <button type="button" className="crm-sr-action-btn" onClick={() => onView(r)}>View</button>
      {spam ? (
        <button type="button" className="crm-sr-action-btn" onClick={() => onNotSpam(r)} disabled={busy}>Not spam</button>
      ) : (
        <button type="button" className="crm-sr-action-btn" onClick={() => onSpam(r)} disabled={busy}>Spam</button>
      )}
      <button type="button" className="crm-sr-action-btn crm-sr-action-btn--danger" onClick={() => onDelete(r)} disabled={busy}>Delete</button>
    </div>
  );
}

function CrmServiceRequests({ requests = [], loading = false, error = null, reload }) {
  const [filters, setFilters] = React.useState(() => cloneSrFilters());
  const [draftFilters, setDraftFilters] = React.useState(() => cloneSrFilters());
  const [filterModalOpen, setFilterModalOpen] = React.useState(false);
  const [viewMode, setViewMode] = React.useState("grid");
  const [copiedId, setCopiedId] = React.useState(null);
  const [activeReq, setActiveReq] = React.useState(null);
  const [confirm, setConfirm] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const toastTimer = React.useRef(null);

  function showToast(type, text) {
    setToast({ type, text });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }

  const withGroup = React.useMemo(() =>
    requests.map((r) => ({ ...r, _group: getServiceRequestGroup(r) })),
    [requests]
  );

  const groupCounts = React.useMemo(() => {
    const counts = {};
    withGroup.forEach((r) => {
      const g = r._group || "other";
      counts[g] = (counts[g] || 0) + 1;
      if (isSpamReq(r) || r.autoSpam) counts.spam = (counts.spam || 0) + 1;
    });
    return counts;
  }, [withGroup]);

  const filtered = React.useMemo(() => {
    const matched = withGroup.filter((r) => matchesServiceRequestFilters(r, filters));
    return sortServiceRequests(matched, filters.sort);
  }, [withGroup, filters]);

  const activeFilterCount = srActiveFilterCount(filters);
  const activeFilterTags = React.useMemo(() => {
    const tags = [];
    (filters.groups || []).forEach((id) => tags.push({ key: "groups", id, label: SR_GROUPS.find((g) => g.id === id)?.label || id }));
    (filters.statuses || []).forEach((id) => tags.push({ key: "statuses", id, label: SR_STATUS_OPTIONS.find((s) => s.id === id)?.label || id }));
    (filters.sources || []).forEach((id) => tags.push({ key: "sources", id, label: SR_SOURCE_OPTIONS.find((s) => s.id === id)?.label || id }));
    if (filters.sort && filters.sort !== "newest") {
      tags.push({ key: "sort", id: filters.sort, label: SR_SORT_OPTIONS.find((s) => s.id === filters.sort)?.label || filters.sort });
    }
    return tags;
  }, [filters]);

  function openFilterModal() {
    setDraftFilters(cloneSrFilters(filters));
    setFilterModalOpen(true);
  }

  function implementFilters() {
    setFilters(cloneSrFilters(draftFilters));
    setFilterModalOpen(false);
  }

  function removeAppliedFilterTag(key, id) {
    setFilters((prev) => {
      if (key === "sort") return { ...prev, sort: "newest" };
      return { ...prev, [key]: (prev[key] || []).filter((x) => x !== id) };
    });
  }

  function clearAllFilters() {
    setFilters(cloneSrFilters());
  }

  async function applyAction(ids, action) {
    if (!ids.length || busy) return;
    setBusy(true);
    try {
      const res = await window.HEYA_API.bulkCrmServiceRequests({ ids, action });
      const n = res.processed ?? ids.length;
      const verb = action === "delete" ? "Deleted" : action === "spam" ? "Marked as spam" : "Restored";
      showToast("ok", `${verb} ${n} request${n !== 1 ? "s" : ""}.`);
      if (res.failed && res.failed.length) {
        showToast("err", `${res.failed.length} could not be processed.`);
      }
      setActiveReq(null);
      if (reload) reload();
    } catch (err) {
      showToast("err", (err && err.message) || "Action failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function askDelete(ids) {
    if (!ids.length) return;
    setConfirm({ ids, count: ids.length });
  }
  function confirmDeleteNow() {
    const ids = confirm?.ids || [];
    setConfirm(null);
    applyAction(ids, "delete");
  }

  function copyContact(r) {
    const lines = [
      r.name ? `Name: ${r.name}` : "",
      r.email ? `Email: ${r.email}` : "",
      r.phone ? `Phone: ${r.phone}` : "",
      r.id ? `Ref: ${r.id}` : "",
      `Source: ${sourceLabelForRequest(r)}`,
    ].filter(Boolean);
    copyToClipboard(lines.join("\n"));
    setCopiedId(r.id);
    setTimeout(() => setCopiedId(null), 1800);
  }

  function groupLabel(id) {
    return SR_GROUPS.find((g) => g.id === id)?.label || id;
  }

  const filtersActive = activeFilterCount > 0 || (filters.sort && filters.sort !== "newest");
  const spamFilterActive = (filters.groups || []).includes("spam");

  return (
    <div className="crm-sr-board">
      <div className="crm-section-head">
        <div>
          <div className="crm-section-title">Service Requests</div>
          <div className="crm-section-sub">Website enquiries from contact forms, vacancies, and inbox messages.</div>
        </div>
        {reload && <button className="btn sm" onClick={reload}>Reload</button>}
      </div>

      {loading && <div className="crm-sr-loading">Loading…</div>}
      {error && (
        <div className="crm-empty">
          <div className="crm-empty__title">Could not load</div>
          <div className="crm-empty__body">{error}</div>
        </div>
      )}

      {!loading && !error && (
        <React.Fragment>
          <div className="crm-sr-toolbar">
            <div className="crm-sr-search">
              <svg className="crm-sr-search__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                className="crm-sr-search__input"
                placeholder="Search requests…"
                value={filters.query}
                onChange={(e) => setFilters((prev) => ({ ...prev, query: e.target.value }))}
              />
              {filters.query && (
                <button type="button" className="crm-sr-search__clear" onClick={() => setFilters((prev) => ({ ...prev, query: "" }))}>✕</button>
              )}
            </div>
            <button
              type="button"
              className={"crm-sr-filter-button" + (activeFilterCount > 0 ? " is-active" : "")}
              onClick={openFilterModal}
              title="Filter requests"
              aria-haspopup="dialog"
            >
              <i className="fa-solid fa-filter" aria-hidden="true" />
              {activeFilterCount > 0 && <span className="crm-sr-filter-button__badge">{activeFilterCount}</span>}
            </button>
            <div className="crm-sr-view-toggle">
              <button type="button" className={"crm-sr-view-btn" + (viewMode === "grid" ? " active" : "")} onClick={() => setViewMode("grid")} title="Grid view">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              </button>
              <button type="button" className={"crm-sr-view-btn" + (viewMode === "list" ? " active" : "")} onClick={() => setViewMode("list")} title="List view">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              </button>
            </div>
          </div>

          {filtersActive && (
            <div className="crm-sr-active-filters" aria-label="Active filters">
              {activeFilterTags.map((tag) => (
                <span key={tag.key + tag.id} className="crm-sr-active-filter">
                  {tag.label}
                  <button type="button" onClick={() => removeAppliedFilterTag(tag.key, tag.id)} aria-label={"Remove " + tag.label}>×</button>
                </span>
              ))}
              <button type="button" className="crm-sr-filter-clear" onClick={clearAllFilters}>Clear all</button>
            </div>
          )}

          {requests.length === 0 && (
            <div className="crm-empty">
              <div className="crm-empty__title">No service requests yet</div>
              <div className="crm-empty__body">Website contact and service enquiries will appear here.</div>
            </div>
          )}
          {requests.length > 0 && filtered.length === 0 && (
            <div className="crm-empty">
              <div className="crm-empty__title">{spamFilterActive ? "No spam" : "No results"}</div>
              <div className="crm-empty__body">{spamFilterActive ? "Nothing has been flagged or marked as spam." : "No requests match your search or filters."}</div>
            </div>
          )}

          {viewMode === "grid" && filtered.length > 0 && (
            <div className="crm-sr-grid">
              {filtered.map((r) => {
                const gc = SR_GROUP_COLORS[r._group] || SR_GROUP_COLORS["other"];
                const spam = isSpamReq(r);
                return (
                  <div key={r.id} className={"crm-sr-card" + (spam ? " is-spam" : "")}>
                    <div className="crm-sr-card__banner" style={{ background: gc.bg }} />
                    <div className="crm-sr-card__head">
                      <span className="crm-sr-card__badge" style={{ background: gc.bg, color: gc.text }}>{groupLabel(r._group)}</span>
                      <span className={"crm-sr-card__status crm-sr-status--" + (r.status || "new")}>{r.status || "new"}</span>
                    </div>
                    {!spam && r.autoSpam && (
                      <div className="crm-sr-spam-badge" title={(r.spamReasons || []).join(", ")}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        Likely spam
                      </div>
                    )}
                    <div className="crm-sr-ticket-meta">
                      <span>Ref: {r.id}</span>
                      <span>Source: {sourceLabelForRequest(r)}</span>
                    </div>
                    <div className="crm-sr-card__name">{r.name || "Unknown"}</div>
                    {r.companyName && <div className="crm-sr-card__company">{r.companyName}</div>}
                    <div className="crm-sr-contact-stack">
                      {r.email && <span><i className="fa-solid fa-envelope" aria-hidden="true" /> {r.email}</span>}
                      {r.phone && <span><i className="fa-solid fa-phone" aria-hidden="true" /> {r.phone}</span>}
                    </div>
                    <div className="crm-sr-card__service">{r.serviceNeeded || r.subject || "—"}</div>
                    {r.message && <div className="crm-sr-card__message">{r.message}</div>}
                    <div className="crm-sr-card__footer">
                      <span className="crm-sr-card__date">{fmtDate(r.submittedAt || r.createdAt)}</span>
                      {r.sourcePath && <span className="crm-sr-card__source">{r.sourcePath}</span>}
                    </div>
                    <ServiceRequestActions
                      r={r}
                      busy={busy}
                      copiedId={copiedId}
                      onCopy={copyContact}
                      onView={setActiveReq}
                      onAgent={openAgentForRequest}
                      onSpam={(req) => applyAction([req.id], "spam")}
                      onNotSpam={(req) => applyAction([req.id], "not-spam")}
                      onDelete={(req) => askDelete([req.id])}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {viewMode === "list" && filtered.length > 0 && (
            <div className="crm-sr-list">
              <div className="crm-sr-list-header">
                <span>Ticket</span><span>Service</span><span>Contact</span><span>Status</span><span>Date</span><span>Actions</span>
              </div>
              {filtered.map((r) => {
                const spam = isSpamReq(r);
                return (
                  <div key={r.id} className={"crm-sr-list-row" + (spam ? " is-spam" : "")}>
                    <div>
                      <div className="crm-sr-list-row__name">
                        {r.name || "—"}
                        {!spam && r.autoSpam && <span className="crm-sr-spam-tag" title={(r.spamReasons || []).join(", ")}>spam?</span>}
                      </div>
                      {r.companyName && <div className="crm-sr-list-row__company">{r.companyName}</div>}
                      <div className="crm-sr-ticket-meta crm-sr-ticket-meta--inline">
                        <span>Ref: {r.id}</span>
                        <span>{sourceLabelForRequest(r)}</span>
                      </div>
                    </div>
                    <div className="crm-sr-list-row__service">{r.serviceNeeded || r.subject || "—"}</div>
                    <div className="crm-sr-contact-stack crm-sr-contact-stack--list">
                      {r.email && <span><i className="fa-solid fa-envelope" aria-hidden="true" /> {r.email}</span>}
                      {r.phone && <span><i className="fa-solid fa-phone" aria-hidden="true" /> {r.phone}</span>}
                    </div>
                    <span className={"crm-sr-card__status crm-sr-status--" + (r.status || "new")}>{r.status || "new"}</span>
                    <div className="crm-sr-list-row__date">{fmtDate(r.submittedAt || r.createdAt)}</div>
                    <ServiceRequestActions
                      r={r}
                      busy={busy}
                      copiedId={copiedId}
                      onCopy={copyContact}
                      onView={setActiveReq}
                      onAgent={openAgentForRequest}
                      onSpam={(req) => applyAction([req.id], "spam")}
                      onNotSpam={(req) => applyAction([req.id], "not-spam")}
                      onDelete={(req) => askDelete([req.id])}
                      compact
                    />
                  </div>
                );
              })}
            </div>
          )}
        </React.Fragment>
      )}

      {filterModalOpen && (
        <ServiceRequestFilterModal
          draftFilters={draftFilters}
          setDraftFilters={setDraftFilters}
          groupCounts={groupCounts}
          onImplement={implementFilters}
          onCancel={() => setFilterModalOpen(false)}
        />
      )}

      {toast && (
        <div className={"crm-sr-toast crm-sr-toast--" + toast.type} role="status">
          {toast.text}
        </div>
      )}

      {confirm && (
        <div className="crm-modal-scrim" onClick={() => setConfirm(null)}>
          <div className="crm-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="crm-modal-title">Delete {confirm.count > 1 ? `${confirm.count} requests` : "request"}?</div>
            <div className="crm-modal-body">
              {confirm.count > 1
                ? <span>These {confirm.count} service requests will be permanently removed and cannot be recovered.</span>
                : <span>This service request will be permanently removed and cannot be recovered.</span>}
            </div>
            <div className="crm-modal-foot">
              <button type="button" className="crm-modal-btn crm-modal-btn--cancel" onClick={() => setConfirm(null)} disabled={busy}>Cancel</button>
              <button type="button" className="crm-modal-btn crm-modal-btn--danger" onClick={confirmDeleteNow} disabled={busy}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {activeReq && (
        <div className="publish-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setActiveReq(null); }}>
          <div className="edit-modal" style={{ maxWidth: 540 }}>
            <div className="edit-modal-head">
              <div>
                <div className="mono eyebrow">{groupLabel(activeReq._group)} · {sourceLabelForRequest(activeReq)}</div>
                <div className="edit-modal-title">{activeReq.subject || activeReq.serviceNeeded || "Service Request"}</div>
              </div>
              <button className="icon-btn" onClick={() => setActiveReq(null)}><I.X /></button>
            </div>
            <div className="edit-modal-body">
              <div className="stack" style={{ gap: 12 }}>
                <div className="crm-sr-ticket-meta crm-sr-ticket-meta--detail">
                  <span>Ref: {activeReq.id}</span>
                  <span>Source: {sourceLabelForRequest(activeReq)}</span>
                </div>
                <div className="inbox-read-card">
                  <div className="mono eyebrow">From</div>
                  <div className="inbox-read-card__name">{activeReq.name || "—"}</div>
                  {activeReq.companyName && <div className="inbox-read-card__line">{activeReq.companyName}</div>}
                  <div className="inbox-read-card__line">{activeReq.email || "No email"}</div>
                  {activeReq.phone && <div className="inbox-read-card__line">{activeReq.phone}</div>}
                </div>
                {activeReq.serviceNeeded && (
                  <div style={{ fontSize: 13 }}><strong>Service:</strong> {activeReq.serviceNeeded}</div>
                )}
                {activeReq.message && (
                  <div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.6, padding: "12px 16px", background: "#f9fafb", borderRadius: 8, border: "1px solid var(--line)" }}>
                    {activeReq.message}
                  </div>
                )}
                {activeReq.sourcePath && (
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>Page: {activeReq.sourcePath}</div>
                )}
              </div>
            </div>
            <div className="edit-modal-foot">
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{fmtDate(activeReq.submittedAt || activeReq.createdAt)}</span>
              <button type="button" className="btn sm" onClick={() => copyContact(activeReq)}>
                {copiedId === activeReq.id ? "Copied ✓" : "Copy"}
              </button>
              <button type="button" className="btn sm" onClick={() => openAgentForRequest(activeReq)} disabled={busy}>
                <i className="fa-solid fa-robot" aria-hidden="true" /> Agent
              </button>
              {isSpamReq(activeReq)
                ? <button className="btn sm" onClick={() => applyAction([activeReq.id], "not-spam")} disabled={busy}>Not spam</button>
                : <button className="btn sm" onClick={() => applyAction([activeReq.id], "spam")} disabled={busy}>Mark spam</button>}
              <button className="btn sm danger" onClick={() => askDelete([activeReq.id])} disabled={busy}>Delete</button>
              {activeReq.email && (
                <window.CrmEmailActionButton
                  className="btn accent sm"
                  {...srEmailButtonProps(activeReq)}
                >
                  Email
                </window.CrmEmailActionButton>
              )}
              <button className="btn" onClick={() => setActiveReq(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function emailSearchText(row) {
  return [row.name, row.email, row.tag, row.listTitle, row.companyName, row.positionTitle, row.role]
    .filter(Boolean).join(" ").toLowerCase();
}

function openAgentForEmailList(list) {
  let audience, extraFields;
  if (list.key === "talent") {
    audience = "talent";
    extraFields = {};
  } else if (list.key === "applicants") {
    audience = "applicants";
    extraFields = {};
  } else if (list.key === "employers") {
    audience = "employers";
    extraFields = {};
  } else if (list.key.startsWith("pos-") && list.positionId) {
    audience = "position-applicants";
    extraFields = { positionId: list.positionId };
  } else {
    // Cannot safely resolve without positionId — use custom with explicit email list
    audience = "custom";
    extraFields = { customRecipients: list.rows.map((r) => r.email).filter(Boolean) };
  }
  const payload = {
    sourceType: "email-list",
    listKey:    list.key,
    listTitle:  list.title,
    audience,
    count:      list.rows.length,
    ...extraFields,
    prompt: `Prepare a bulk email for the "${list.title}" list (${list.rows.length} contacts). Ask me for the subject and body before sending.`,
  };
  try { sessionStorage.setItem("heya.pendingCrmAgentContext", JSON.stringify(payload)); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent("heya:crm-agent-context", { detail: payload }));
}

function openAgentForEmailRow(row, listTitle) {
  const payload = {
    sourceType:       "email-list-row",
    audience:         "custom",
    customRecipients: [row.email].filter(Boolean),
    name:             row.name  || "",
    email:            row.email || "",
    listTitle:        listTitle || row.listTitle || "",
    prompt: `Help me draft a follow-up email to ${row.name || row.email} from the ${listTitle || row.listTitle || "email list"}. Ask me for details before drafting.`,
  };
  try { sessionStorage.setItem("heya.pendingCrmAgentContext", JSON.stringify(payload)); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent("heya:crm-agent-context", { detail: payload }));
}

function CrmEmailLists({ talentPool, applicants, employerSubmissions }) {
  const [copiedKey,        setCopiedKey]        = React.useState(null);
  const [copiedVisible,    setCopiedVisible]     = React.useState(false);
  const [emailSearch,      setEmailSearch]       = React.useState("");
  const [activeEmailGroup, setActiveEmailGroup]  = React.useState("all");

  function copyList(emails, key) {
    copyToClipboard(emails.join(", "));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  }

  function copyEmail(email) { copyToClipboard(email); }

  const byPosition = React.useMemo(() => {
    const map = {};
    applicants.forEach((a) => {
      const posId    = a.positionId ? String(a.positionId) : null;
      const posTitle = a.positionTitle || posId || "Unknown Position";
      const key      = posId || posTitle;
      if (!map[key]) map[key] = { title: posTitle, positionId: posId, apps: [] };
      if (a.email) map[key].apps.push(a);
    });
    return map;
  }, [applicants]);

  const lists = React.useMemo(() => [
    {
      key: "talent",
      title: "Talent Pool",
      rows: talentPool.filter((t) => t.email).map((t) => ({
        name: t.name, email: t.email, tag: t.source || "Talent Pool",
        listTitle: "Talent Pool", companyName: null, positionTitle: null, role: t.role || null,
      })),
      emails: talentPool.filter((t) => t.email).map((t) => t.email),
    },
    {
      key: "applicants",
      title: "All Applicants",
      rows: applicants.filter((a) => a.email).map((a) => ({
        name: a.name, email: a.email, tag: a.positionTitle || "Application",
        listTitle: "All Applicants", companyName: null, positionTitle: a.positionTitle || null, role: null,
      })),
      emails: applicants.filter((a) => a.email).map((a) => a.email),
    },
    {
      key: "employers",
      title: "Employer Leads",
      rows: employerSubmissions.filter((e) => e.email).map((e) => ({
        name: e.companyName || e.name, email: e.email, tag: "Employer",
        listTitle: "Employer Leads", companyName: e.companyName || null, positionTitle: null, role: null,
      })),
      emails: employerSubmissions.filter((e) => e.email).map((e) => e.email),
    },
    ...Object.entries(byPosition).map(([key, { title, positionId, apps }]) => ({
      key:        "pos-" + key,
      positionId: positionId || null,
      title:      `Position: ${title}`,
      rows: apps.map((a) => ({
        name: a.name, email: a.email, tag: a.status || "Applicant",
        listTitle: `Position: ${title}`, companyName: null, positionTitle: title, role: null,
      })),
      emails: apps.map((a) => a.email),
    })),
  ], [talentPool, applicants, employerSubmissions, byPosition]);

  // All flat rows for search / count
  const allRows = React.useMemo(() => lists.flatMap((l) => l.rows), [lists]);
  const totalCount = allRows.length;

  // Group chips
  const groupChips = React.useMemo(() => [
    { key: "all", label: "All Emails", count: totalCount },
    ...lists.map((l) => ({ key: l.key, label: l.title, count: l.rows.length })),
  ], [lists, totalCount]);

  // Filtered lists
  const q = emailSearch.trim().toLowerCase();
  const filteredLists = React.useMemo(() => {
    return lists
      .filter((l) => activeEmailGroup === "all" || l.key === activeEmailGroup)
      .map((l) => ({
        ...l,
        rows: q ? l.rows.filter((r) => emailSearchText(r).includes(q)) : l.rows,
      }))
      .filter((l) => l.rows.length > 0);
  }, [lists, q, activeEmailGroup]);

  const visibleRows = React.useMemo(() => filteredLists.flatMap((l) => l.rows), [filteredLists]);
  const matchCount  = visibleRows.length;

  function copyAllVisible() {
    copyToClipboard(visibleRows.map((r) => r.email).join(", "));
    setCopiedVisible(true);
    setTimeout(() => setCopiedVisible(false), 1800);
  }

  return (
    <div>
      <div className="crm-section-head">
        <div>
          <div className="crm-section-title">Email Lists</div>
          <div className="crm-section-sub">Organised email pools from talent, applicants, and employers. Copy lists for campaigns.</div>
        </div>
      </div>

      {/* Search + groups */}
      <div className="crm-email-search">
        <div className="crm-email-search__bar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flex:"none", color:"#9ca3af" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            className="crm-email-search__input"
            placeholder="Search emails by name, address, role, company, or list…"
            value={emailSearch}
            onChange={(e) => setEmailSearch(e.target.value)}
          />
          {emailSearch && (
            <button className="crm-email-search__clear" onClick={() => setEmailSearch("")}>✕</button>
          )}
        </div>
        <div className="crm-email-search__groups">
          {groupChips.map((chip) => (
            <button
              key={chip.key}
              className={"crm-email-search__chip" + (activeEmailGroup === chip.key ? " active" : "")}
              onClick={() => setActiveEmailGroup(chip.key)}
            >
              {chip.label}
              <span className="crm-email-search__chip-count">{chip.count}</span>
            </button>
          ))}
        </div>
        <div className="crm-email-search__meta">
          <span className="crm-email-search__count">
            {q ? `${matchCount} matching email${matchCount !== 1 ? "s" : ""}` : `${totalCount} total email${totalCount !== 1 ? "s" : ""}`}
          </span>
          <div className="crm-email-search__actions">
            <button className="crm-sr-action-btn" onClick={copyAllVisible} disabled={matchCount === 0}>
              {copiedVisible ? "Copied ✓" : "Copy All Visible"}
            </button>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {q && matchCount === 0 && (
        <div className="crm-empty">
          <div className="crm-empty__title">No emails match this search.</div>
          <div className="crm-empty__body">
            <button className="crm-sr-action-btn" onClick={() => setEmailSearch("")}>Clear search</button>
          </div>
        </div>
      )}

      <div className="crm-email-list">
        {filteredLists.map((list) => (
          <div key={list.key} className="crm-email-list-section">
            <div className="crm-email-list-head">
              <div>
                <div className="crm-email-list-head__title">{list.title}</div>
                <span className="crm-email-list-head__count">{list.rows.length} email{list.rows.length !== 1 ? "s" : ""}</span>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button
                  className="crm-email-list-head__copy"
                  title={`Email the ${list.title} list via AI`}
                  onClick={() => openAgentForEmailList(list)}
                  disabled={list.rows.length === 0}
                >
                  Ask AI
                </button>
                <button
                  className="crm-email-list-head__copy"
                  onClick={() => copyList(list.rows.map((r) => r.email), list.key)}
                  disabled={list.rows.length === 0}
                >
                  {copiedKey === list.key ? "Copied ✓" : "Copy All"}
                </button>
              </div>
            </div>
            {list.rows.length === 0 && (
              <div style={{ padding: "12px 16px", fontSize: 12, color: "var(--muted)" }}>No emails in this list.</div>
            )}
            {list.rows.slice(0, 40).map((row, i) => (
              <div key={i} className="crm-email-row">
                <div className="crm-email-row__name">{row.name || "—"}</div>
                <div className="crm-email-row__email">{row.email}</div>
                <span className="crm-email-row__tag">{row.tag}</span>
                <window.CrmEmailActionButton
                  className="crm-email-copy-btn"
                  email={row.email}
                  name={row.name}
                  sourceType="email-list"
                  sourceLabel={row.listTitle || "Email List"}
                  sourceId={row.id || row.email}
                  subject={`Glondiasites - ${row.listTitle || row.tag || "Email list"}`}
                >
                  Email
                </window.CrmEmailActionButton>
                <button className="crm-email-copy-btn" onClick={() => copyEmail(row.email)} title="Copy email">Copy</button>
                <button className="crm-email-copy-btn" onClick={() => openAgentForEmailRow(row, list.title)} title="Open in AI Chat">Ask AI</button>
              </div>
            ))}
            {list.rows.length > 40 && (
              <div style={{ padding: "8px 16px", fontSize: 11, color: "var(--muted)", borderTop: "1px solid var(--line)" }}>
                +{list.rows.length - 40} more — use Copy All to get full list.
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const AI_MODES = [
  { id: "email-draft",    label: "Email Draft",    short: "Email",    icon: "mail" },
  { id: "service-reply",  label: "Service Reply",  short: "Reply",    icon: "reply" },
  { id: "marketing-copy", label: "Marketing Copy", short: "Copy",     icon: "megaphone" },
  { id: "image-prompt",   label: "Image Prompt",   short: "Image",    icon: "image" },
  { id: "video-prompt",   label: "Video Prompt",   short: "Video",    icon: "video" },
];

const AI_MODELS = [
  { id: "default",       label: "Dashboard Default" },
  { id: "gpt-4o",        label: "GPT-4o" },
  { id: "claude-sonnet", label: "Claude Sonnet" },
  { id: "gemini-flash",  label: "Gemini Flash" },
];

function renderModeIcon(icon) {
  const s = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 };
  if (icon === "mail")      return <svg {...s}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>;
  if (icon === "reply")     return <svg {...s}><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 00-4-4H4"/></svg>;
  if (icon === "megaphone") return <svg {...s}><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>;
  if (icon === "image")     return <svg {...s}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
  if (icon === "video")     return <svg {...s}><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>;
  return null;
}

function AiActionBar({ msg, onCopy, onRegenerate, onFeedback }) {
  return (
    <div className="crm-ai-actions">
      <button className="crm-ai-action-btn" onClick={() => onCopy(msg.text)} title="Copy">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        Copy
      </button>
      <button className="crm-ai-action-btn" onClick={() => onRegenerate(msg.id)} title="Regenerate">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
        Regenerate
      </button>
      <button
        className={"crm-ai-action-btn crm-ai-action-btn--icon" + (msg.feedback === "good" ? " is-active" : "")}
        onClick={() => onFeedback(msg.id, msg.feedback === "good" ? null : "good")}
        title="Good response"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill={msg.feedback === "good" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
      </button>
      <button
        className={"crm-ai-action-btn crm-ai-action-btn--icon" + (msg.feedback === "bad" ? " is-active" : "")}
        onClick={() => onFeedback(msg.id, msg.feedback === "bad" ? null : "bad")}
        title="Bad response"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill={msg.feedback === "bad" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/></svg>
      </button>
    </div>
  );
}

function ConnectionRow({ label, connected, subtitle, statusText, busy, onConnect, onDisconnect, canConnect = true }) {
  return (
    <div className="crm-ai-conn-row">
      <div className="crm-ai-conn-info">
        <span className="crm-ai-conn-label">{label}</span>
        <span className="crm-ai-conn-sub">{subtitle}</span>
      </div>
      <div className="crm-ai-conn-actions">
        <span className={"crm-ai-conn-dot " + (connected ? "is-on" : "is-off")} />
        <span className="crm-ai-conn-status">{statusText}</span>
        {onConnect && (
          connected ? (
            <button className="crm-ai-conn-btn crm-ai-conn-btn--ghost" onClick={onDisconnect} disabled={busy}>
              {busy ? "…" : "Disconnect"}
            </button>
          ) : (
            <button
              className="crm-ai-conn-btn"
              onClick={onConnect}
              disabled={busy}
              title={canConnect ? "Connect this MCP Tool provider" : "MCP Tool provider credentials are missing. Click to see setup status."}
            >
              {busy ? "…" : "Connect"}
            </button>
          )
        )}
      </div>
    </div>
  );
}

function ReauthCard({ msg, onReconnect }) {
  return (
    <div className="crm-ai-reauth-card">
      <div className="crm-ai-reauth-head">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
        {msg.label || "Reconnection required"}
      </div>
      <div className="crm-ai-reauth-body">
        {window.marked
          ? <span dangerouslySetInnerHTML={{ __html: window.marked.parse(msg.text || "") }} />
          : msg.text}
      </div>
      {msg.provider && (
        <button className="crm-ai-conn-btn" onClick={() => onReconnect(msg)}>
          Reconnect {cap(msg.provider)}
        </button>
      )}
    </div>
  );
}

function CrmAiChat() {
  const [mode, setMode]         = React.useState("email-draft");
  const [model, setModel]       = React.useState("default");
  const [messages, setMessages] = React.useState([]);
  const [input, setInput]       = React.useState("");
  const [loading, setLoading]   = React.useState(false);
  const [error, setError]       = React.useState(null);
  const [modelOpen, setModelOpen] = React.useState(false);

  // Conversation persistence
  const [conversationUid, setConversationUid]   = React.useState(null);
  const [conversations, setConversations]       = React.useState([]);
  const [showHistory, setShowHistory]           = React.useState(false);
  const [loadingConversation, setLoadingConversation] = React.useState(false);

  // MCP Tool providers (email / Facebook / LinkedIn)
  const [toolStatus, setToolStatus]         = React.useState(null);
  const [showConnections, setShowConnections] = React.useState(false);
  const [connBusy, setConnBusy]             = React.useState("");
  const [toast, setToast]                   = React.useState(null);
  const toastTimer = React.useRef(null);

  // Mention + command autocomplete
  const [mentions, setMentions]             = React.useState([]); // verified mentions attached to current message
  const [selectedCommand, setSelectedCommand] = React.useState(null); // { token, label, ... }
  const [dropdown, setDropdown]             = React.useState(null); // null | { mode: "mention"|"command", query, results, activeIdx }
  const [sendError, setSendError]           = React.useState(null);
  const textareaRef = React.useRef(null);
  const searchDebounce = React.useRef(null);

  const messagesEndRef = React.useRef(null);
  const hasMessages    = messages.length > 0;
  const selectedModel  = AI_MODELS.find((m) => m.id === model) || AI_MODELS[0];

  // Load conversation list on mount
  React.useEffect(() => {
    window.HEYA_API?.listCrmAiConversations?.({ limit: 25 })
      .then((d) => setConversations(d.conversations || []))
      .catch(() => {});
  }, []);

  // Load tool/connection status on mount, and surface OAuth callback results.
  React.useEffect(() => {
    loadToolStatus();
    try {
      const params = new URLSearchParams(window.location.search);
      const social = params.get("social");
      const status = params.get("status");
      if (social && status) {
        setToast(
          status === "connected"
            ? { type: "success", text: `${cap(social)} connected successfully.` }
            : { type: "error", text: `${cap(social)} MCP Tool failed${params.get("reason") ? `: ${params.get("reason")}` : ""}.` }
        );
        // Clean the URL so a refresh doesn't repeat the toast.
        const clean = window.location.pathname + window.location.hash;
        window.history.replaceState({}, "", clean);
        setTimeout(() => setToast(null), 6000);
      }
    } catch { /* ignore */ }
  }, []);

  function loadToolStatus() {
    window.HEYA_API?.getCrmToolStatus?.()
      .then((d) => setToolStatus(d.status || null))
      .catch(() => {});
  }

  function showNotice(type, text, timeout = 6000) {
    clearTimeout(toastTimer.current);
    setToast({ type, text });
    if (timeout) toastTimer.current = setTimeout(() => setToast(null), timeout);
  }

  async function handleConnect(provider) {
    setConnBusy(provider);
    try {
      const d = await window.HEYA_API.startSocialAuth(provider, window.location.href);
      if (d.authUrl) {
        window.location.href = d.authUrl; // full redirect; returns to CRM tab
      } else {
        showNotice("info", `${cap(provider)} MCP Tool is not ready yet. Check the provider credentials and try again.`);
      }
    } catch (err) {
      showNotice("info", err.message || `${cap(provider)} MCP Tool needs setup before it can connect.`);
    } finally {
      setConnBusy("");
    }
  }

  function handleReconnect(msg) {
    if (msg.authUrl) {
      window.location.href = msg.authUrl;
    } else if (msg.provider) {
      handleConnect(msg.provider);
    }
  }

  async function handleDisconnect(provider) {
    setConnBusy(provider);
    try {
      await window.HEYA_API.disconnectSocial(provider);
      showNotice("success", `${cap(provider)} disconnected.`);
      loadToolStatus();
    } catch (err) {
      showNotice("info", err.message || `Could not disconnect ${cap(provider)} right now.`);
    } finally {
      setConnBusy("");
    }
  }

  React.useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  React.useEffect(() => {
    function applyAgentContext(payload) {
      const prompt = payload?.prompt || "";
      if (prompt) setInput(prompt);
      try {
        sessionStorage.removeItem("heya.pendingCrmAgentContext");
      } catch {
        /* ignore */
      }
    }
    function onAgentContext(event) {
      applyAgentContext(event.detail || {});
    }
    try {
      const raw = sessionStorage.getItem("heya.pendingCrmAgentContext");
      if (raw) applyAgentContext(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    window.addEventListener("heya:crm-agent-context", onAgentContext);
    return () => window.removeEventListener("heya:crm-agent-context", onAgentContext);
  }, []);

  React.useEffect(() => {
    if (!modelOpen) return;
    function close(e) {
      if (!e.target.closest(".crm-ai-model-menu")) setModelOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [modelOpen]);

  React.useEffect(() => {
    if (!showHistory) return;
    function close(e) {
      if (!e.target.closest(".crm-ai-history-panel") && !e.target.closest(".crm-ai-history-btn")) {
        setShowHistory(false);
      }
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showHistory]);

  React.useEffect(() => {
    if (!showConnections) return;
    function close(e) {
      if (!e.target.closest(".crm-ai-connections-panel") && !e.target.closest(".crm-ai-connections-btn")) {
        setShowConnections(false);
      }
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showConnections]);

  // ── Conversation management ─────────────────────────────────────────────────

  function startNewChat() {
    setConversationUid(null);
    setMessages([]);
    setInput("");
    setError(null);
    setShowHistory(false);
  }

  async function loadConversation(uid) {
    setShowHistory(false);
    setLoadingConversation(true);
    setError(null);
    try {
      const data = await window.HEYA_API.getCrmAiConversation(uid);
      setConversationUid(uid);
      setMessages((data.messages || []).map((m) => ({
        id: m.uid,
        role: m.role === "user" ? "user" : "ai",
        text: m.content || "",
        type: m.type,
        label: m.label,
        detail: m.detail,
        action: m.action,
        confirmationToken: null, // tokens are short-lived; don't restore them
        authUrl: m.metadata?.authUrl || null,
        provider: m.metadata?.provider || null,
        code: m.metadata?.code || null,
        feedback: null,
        showDetail: false,
      })));
    } catch (err) {
      showNotice("info", "Could not load that conversation right now.");
    } finally {
      setLoadingConversation(false);
    }
  }

  async function archiveCurrent() {
    if (!conversationUid) return;
    try {
      await window.HEYA_API.archiveCrmAiConversation(conversationUid);
      setConversations((prev) => prev.filter((c) => c.uid !== conversationUid));
      startNewChat();
    } catch {
      showNotice("info", "Could not archive that conversation right now.");
    }
  }

  function refreshConversationList() {
    window.HEYA_API?.listCrmAiConversations?.({ limit: 25 })
      .then((d) => setConversations(d.conversations || []))
      .catch(() => {});
  }

  // ── AI calls ────────────────────────────────────────────────────────────────

  async function callAI(promptText, history, mentionsList, commandToken) {
    if (!window.HEYA_API?.runCrmAiChat) throw new Error("AI endpoint not available.");
    return window.HEYA_API.runCrmAiChat({
      message: promptText,
      history,
      mode,
      model: model !== "default" ? model : undefined,
      conversationUid: conversationUid || undefined,
      mentions: mentionsList && mentionsList.length ? mentionsList : undefined,
      command: commandToken || undefined,
    });
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setSendError(null);

    // Validate command is compatible with selected mentions
    const cmdToken = selectedCommand?.token || null;
    const unverifiedHandles = [...text.matchAll(/(^|\s)@([A-Za-z0-9_][A-Za-z0-9_-]*)(?!\s*:)/g)]
      .map((m) => m[2])
      .filter((handle) => !mentions.some((mention) => mention.handle === handle));
    if (cmdToken && unverifiedHandles.length > 0) {
      setSendError(`Select ${unverifiedHandles.map((h) => `@${h}`).join(", ")} from the suggestions before using /${cmdToken}.`);
      return;
    }

    if (cmdToken && mentions.length > 0) {
      const cmd = SLASH_COMMANDS.find((c) => c.token === cmdToken);
      if (cmd && cmd.allowedTargets) {
        const incompatible = mentions.filter((m) => !cmd.allowedTargets.includes(m.type));
        if (incompatible.length > 0) {
          setSendError(`/${cmdToken} cannot be used with ${incompatible.map((m) => m.type).join(", ")} records.`);
          return;
        }
      }
    }

    const snapshotMentions = [...mentions];
    const snapshotCommand  = cmdToken;

    setMessages((prev) => [...prev, { id: Date.now(), role: "user", text }]);
    setInput("");
    setMentions([]);
    setSelectedCommand(null);
    setDropdown(null);
    setLoading(true);
    setError(null);
    try {
      const history = messages.map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
      const result = await callAI(text, history, snapshotMentions, snapshotCommand);
      if (result.conversationUid && !conversationUid) {
        setConversationUid(result.conversationUid);
        refreshConversationList();
      }
      setMessages((prev) => [...prev, makeAiMessage(result)]);
    } catch (err) {
      showNotice("info", err.message || "AI request failed.");
    } finally {
      setLoading(false);
    }
  }

  async function regenerate(msgId) {
    const aiIdx = messages.findIndex((m) => m.id === msgId);
    if (aiIdx < 1) return;
    const userMsg = messages.slice(0, aiIdx).reverse().find((m) => m.role === "user");
    if (!userMsg) return;
    const trimmedMessages = messages.filter((m) => m.id !== msgId);
    setMessages(trimmedMessages);
    setLoading(true);
    setError(null);
    try {
      const history = trimmedMessages.slice(0, -1).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
      const result = await callAI(userMsg.text, history);
      setMessages((prev) => [...prev, makeAiMessage(result)]);
    } catch (err) {
      showNotice("info", err.message || "Regeneration failed.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmAction(msgId, confirmed) {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg?.confirmationToken) return;
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, confirmationToken: null } : m));
    setLoading(true);
    try {
      const result = await window.HEYA_API.confirmCrmAiAction({
        confirmationToken: msg.confirmationToken,
        confirmed,
        conversationUid: conversationUid || undefined,
      });
      setMessages((prev) => [...prev, makeAiMessage(result)]);
    } catch (err) {
      showNotice("info", err.message || "Confirmation failed.");
    } finally {
      setLoading(false);
    }
  }

  function makeAiMessage(result) {
    return {
      id: Date.now() + Math.random(),
      role: "ai",
      text: result.content || "",
      type: result.type,
      label: result.label,
      detail: result.detail,
      action: result.action,
      missing: result.missing,
      confirmationToken: result.confirmationToken || null,
      authUrl: result.authUrl || null,
      provider: result.provider || null,
      code: result.code || null,
      feedback: null,
      showDetail: false,
      isNew: true,   // triggers the one-shot reveal animation; history loads omit this
    };
  }

  function toggleDetail(msgId) {
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, showDetail: !m.showDetail } : m));
  }

  function setFeedback(msgId, fb) {
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, feedback: fb } : m));
  }

  function handleKeyDown(e) {
    if (dropdown) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setDropdown((d) => d ? { ...d, activeIdx: Math.min(d.activeIdx + 1, d.results.length - 1) } : d);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setDropdown((d) => d ? { ...d, activeIdx: Math.max(d.activeIdx - 1, 0) } : d);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (dropdown.results.length > 0) {
          const item = dropdown.results[dropdown.activeIdx] || dropdown.results[0];
          if (dropdown.mode === "mention") selectMention(item);
          else selectCommand(item);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDropdown(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function renderInputHighlights(text) {
    if (!text) return null;
    const parts = [];
    const verified = new Set(mentions.map((m) => m.handle));
    const re = /@[A-Za-z0-9_][A-Za-z0-9_-]*/g;
    let last = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      if (match.index > last) parts.push(text.slice(last, match.index));
      const token = match[0];
      const handle = token.slice(1);
      parts.push(
        <span
          key={`${match.index}-${token}`}
          className={"crm-ai-inline-tag" + (verified.has(handle) ? " crm-ai-inline-tag--verified" : " crm-ai-inline-tag--plain")}
        >
          {token}
        </span>
      );
      last = match.index + token.length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  }

  function maybeAutoVerifyMention(query, results, sourceText) {
    const q = String(query || "").trim().toLowerCase();
    if (!q || !Array.isArray(results)) return;
    const exact = results.filter((r) => String(r.handle || "").toLowerCase() === q);
    if (exact.length !== 1) return;
    const result = exact[0];
    setMentions((prev) => {
      if (prev.find((m) => m.type === result.type && String(m.id) === String(result.id))) return prev;
      return [...prev, { type: result.type, id: result.id, label: result.label, handle: result.handle }];
    });
    if (result.handle !== query && sourceText.includes(`@${query}`)) {
      setInput((prev) => prev.replace(new RegExp(`@${escapeRegExp(query)}(?=\\s|$)`, "g"), `@${result.handle}`));
    }
  }

  function handleInputChange(e) {
    const val = e.target.value;
    setInput(val);
    setSendError(null);

    const cursor = e.target.selectionStart || val.length;
    const textUpToCursor = val.slice(0, cursor);

    // Detect @ trigger: walk back from cursor until space or start
    const atMatch = textUpToCursor.match(/@([^\s@/]*)$/);
    if (atMatch) {
      const query = atMatch[1];
      clearTimeout(searchDebounce.current);
      searchDebounce.current = setTimeout(() => {
        if (!query) {
          setDropdown({ mode: "mention", query: "", results: [], activeIdx: 0 });
          return;
        }
        window.HEYA_API?.searchMentions?.(query)
          .then((d) => {
            const results = d.results || [];
            maybeAutoVerifyMention(query, results, val);
            setDropdown((prev) => prev?.mode === "mention"
              ? { ...prev, query, results, activeIdx: 0 }
              : prev
            );
          })
          .catch(() => {});
      }, 200);
      setDropdown((d) => d?.mode === "mention" ? d : { mode: "mention", query, results: [], activeIdx: 0 });
      return;
    }

    // Detect / trigger: slash at start or after whitespace
    const slashMatch = textUpToCursor.match(/(^|\s)\/([^\s/]*)$/);
    if (slashMatch) {
      const query = slashMatch[2].toLowerCase();
      const results = SLASH_COMMANDS.filter(
        (c) => !query || c.token.startsWith(query) || c.label.toLowerCase().startsWith(query)
      );
      setDropdown({ mode: "command", query, results, activeIdx: 0 });
      return;
    }

    // Clear dropdown if no trigger found
    setDropdown(null);

    // Purge stale mentions whose handle no longer appears in the text
    setMentions((prev) => prev.filter((m) => val.includes(`@${m.handle}`)));
  }

  function selectMention(result) {
    // Replace the @query trigger with @Handle in the textarea
    const ta = textareaRef.current;
    const cursor = ta ? ta.selectionStart : input.length;
    const before = input.slice(0, cursor);
    const after  = input.slice(cursor);
    const replaced = before.replace(/@([^\s@/]*)$/, `@${result.handle} `);
    setInput(replaced + after);
    setMentions((prev) => {
      // Avoid duplicates
      if (prev.find((m) => m.type === result.type && String(m.id) === String(result.id))) return prev;
      return [...prev, { type: result.type, id: result.id, label: result.label, handle: result.handle }];
    });
    setDropdown(null);
    setTimeout(() => ta && ta.focus(), 0);
  }

  function selectCommand(cmd) {
    // Replace the /query trigger with /token in the textarea
    const ta = textareaRef.current;
    const cursor = ta ? ta.selectionStart : input.length;
    const before = input.slice(0, cursor);
    const after  = input.slice(cursor);
    const replaced = before.replace(/(^|\s)\/([^\s/]*)$/, (_, prefix) => `${prefix}/${cmd.token} `);
    setInput(replaced + after);
    setSelectedCommand(cmd);
    setDropdown(null);
    setTimeout(() => ta && ta.focus(), 0);
  }

  const placeholder =
    mode === "image-prompt"  ? "Describe the image you want to generate…" :
    mode === "video-prompt"  ? "Describe the video concept…" :
    mode === "email-draft"   ? "e.g. Write a follow-up email to a candidate who submitted 2 weeks ago…" :
    mode === "service-reply" ? "e.g. Draft a reply to this service enquiry: …" :
                               "What would you like to write?";

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={"crm-ai-studio" + (hasMessages ? " has-messages" : "")}>

      {/* Top bar — history toggle + new chat + archive */}
      <div className="crm-ai-topbar">
        <button
          className="crm-ai-history-btn"
          onClick={() => setShowHistory((s) => !s)}
          title="Chat history"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h12"/></svg>
          History
        </button>
        {conversationUid && (
          <button className="crm-ai-archive-btn" onClick={archiveCurrent} title="Archive this conversation">
            Archive
          </button>
        )}
        <button className="crm-ai-new-btn" onClick={startNewChat} title="Start a new chat">
          + New chat
        </button>
        <button
          className="crm-ai-history-btn crm-ai-connections-btn"
          onClick={() => { setShowConnections((s) => !s); if (!showConnections) loadToolStatus(); }}
          title="MCP Tool"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
          MCP Tool
        </button>

        {showConnections && (
          <div className="crm-ai-connections-panel">
            <div className="crm-ai-history-head">MCP Tool</div>
            <ConnectionRow
              label="Email"
              connected={toolStatus?.email?.configured}
              subtitle={toolStatus?.email?.from || "Not configured"}
              statusText={toolStatus?.email?.configured ? "Configured" : "Not configured"}
            />
            <ConnectionRow
              label="Facebook"
              connected={toolStatus?.facebook?.connected}
              subtitle={
                toolStatus?.facebook?.connected
                  ? toolStatus.facebook.accountName || "Connected Page"
                  : (toolStatus?.tools?.find((t) => t.provider === "facebook")?.configured ? "Not connected" : "App not configured")
              }
              statusText={toolStatus?.facebook?.connected ? "Connected" : "Disconnected"}
              busy={connBusy === "facebook"}
              onConnect={() => handleConnect("facebook")}
              onDisconnect={() => handleDisconnect("facebook")}
              canConnect={Boolean(toolStatus?.tools?.find((t) => t.provider === "facebook")?.configured)}
            />
            <ConnectionRow
              label="LinkedIn"
              connected={toolStatus?.linkedin?.connected}
              subtitle={
                toolStatus?.linkedin?.connected
                  ? toolStatus.linkedin.accountName || "Connected account"
                  : (toolStatus?.tools?.find((t) => t.provider === "linkedin")?.configured ? "Not connected" : "App not configured")
              }
              statusText={toolStatus?.linkedin?.connected ? "Connected" : "Disconnected"}
              busy={connBusy === "linkedin"}
              onConnect={() => handleConnect("linkedin")}
              onDisconnect={() => handleDisconnect("linkedin")}
              canConnect={Boolean(toolStatus?.tools?.find((t) => t.provider === "linkedin")?.configured)}
            />
          </div>
        )}

        {/* History panel */}
        {showHistory && (
          <div className="crm-ai-history-panel">
            <div className="crm-ai-history-head">Recent chats</div>
            {conversations.length === 0 && (
              <div className="crm-ai-history-empty">No conversations yet.</div>
            )}
            {conversations.map((c) => (
              <button
                key={c.uid}
                className={"crm-ai-history-item" + (c.uid === conversationUid ? " active" : "")}
                onClick={() => loadConversation(c.uid)}
              >
                <span className="crm-ai-history-title">{c.title || "Untitled chat"}</span>
                <span className="crm-ai-history-date">{c.updated_at ? new Date(c.updated_at).toLocaleDateString() : ""}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Welcome state */}
      {!hasMessages && !loadingConversation && (
        <div className="crm-ai-welcome">
          <div className="crm-ai-welcome__star">✦</div>
          <div className="crm-ai-welcome__title">Glondiasites AI Studio</div>
          <div className="crm-ai-welcome__sub">Generate emails, marketing copy, and creative prompts.</div>
          <div className="crm-ai-capabilities">
            {AI_MODES.map((m) => (
              <span key={m.id}>{m.label}</span>
            ))}
          </div>
        </div>
      )}

      {loadingConversation && (
        <div className="crm-ai-loading-conv">Loading conversation…</div>
      )}

      {/* Message viewport */}
      {hasMessages && !loadingConversation && (
        <div className="crm-ai-chat-viewport">
          <div className="crm-ai-messages">
            {messages.map((msg) => (
              <div key={msg.id} className={"crm-ai-message" + (msg.role === "user" ? " is-user" : " is-ai")}>
                {msg.role === "user" ? (
                  <div className="crm-ai-bubble crm-ai-bubble--user">{msg.text}</div>
                ) : msg.type === "reauth_required" ? (
                  <div className="crm-ai-message-inner">
                    <ReauthCard msg={msg} onReconnect={handleReconnect} />
                  </div>
                ) : (
                  <div className="crm-ai-message-inner">
                    {msg.label && (
                      <div className="crm-ai-result-badge">
                        <span className={"crm-ai-type-chip crm-ai-type-chip--" + (msg.type || "chat")}>
                          {msg.label}
                        </span>
                        {msg.detail && (
                          <button className="crm-ai-detail-toggle" onClick={() => toggleDetail(msg.id)}>
                            {msg.showDetail ? "Hide details" : "Details"}
                          </button>
                        )}
                      </div>
                    )}
                    <div className={"crm-ai-bubble crm-ai-bubble--ai" + (msg.isNew ? " crm-ai-bubble--reveal" : "")}>
                      {window.marked
                        ? <span dangerouslySetInnerHTML={{ __html: window.marked.parse(msg.text || "") }} />
                        : msg.text}
                    </div>
                    {msg.showDetail && msg.detail && (
                      <div className="crm-ai-detail-panel">
                        {window.marked
                          ? <span dangerouslySetInnerHTML={{ __html: window.marked.parse(msg.detail) }} />
                          : msg.detail}
                      </div>
                    )}
                    {msg.confirmationToken && (
                      <div className="crm-ai-confirm-row">
                        <button className="crm-ai-confirm-btn crm-ai-confirm-btn--proceed" onClick={() => confirmAction(msg.id, true)} disabled={loading}>Proceed</button>
                        <button className="crm-ai-confirm-btn crm-ai-confirm-btn--cancel" onClick={() => confirmAction(msg.id, false)} disabled={loading}>Cancel</button>
                      </div>
                    )}
                    {!msg.confirmationToken && (
                      <AiActionBar msg={msg} onCopy={copyToClipboard} onRegenerate={regenerate} onFeedback={setFeedback} />
                    )}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="crm-ai-message is-ai">
                <div className="crm-ai-bubble crm-ai-bubble--ai crm-ai-bubble--thinking">
                  <span className="crm-ai-dot" /><span className="crm-ai-dot" /><span className="crm-ai-dot" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      {/* MCP Tool popup */}
      {toast && (
        <div className={"crm-ai-toast crm-ai-toast--" + toast.type} role="status" aria-live="polite">
          <span>{toast.type === "success" ? "Done" : "MCP Tool"}: {toast.text}</span>
          <button onClick={() => { clearTimeout(toastTimer.current); setToast(null); }} aria-label="Close message">x</button>
        </div>
      )}
      {false && toast && (
        <div className={"crm-ai-toast crm-ai-toast--" + toast.type} role="status" aria-live="polite">
          <span>{toast.type === "success" ? "✓" : "⚠"} {toast.text}</span>
          <button onClick={() => setToast(null)}>✕</button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="crm-ai-error">
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Composer */}
      <div className={"crm-ai-composer" + (!hasMessages ? " crm-ai-composer--welcome" : "")}>
        <div className="crm-ai-input-shell">
          {/* Mention pills + command badge */}
          {(mentions.length > 0 || selectedCommand) && (
            <div className="crm-ai-mention-bar">
              {mentions.map((m) => (
                <span key={`${m.type}-${m.id}`} className="crm-ai-mention-pill">
                  <span className="crm-ai-mention-pill__type">{m.type.replace("_", " ")}</span>
                  {m.label}
                  <button
                    className="crm-ai-mention-pill__remove"
                    onClick={() => {
                      setMentions((prev) => prev.filter((x) => !(x.type === m.type && String(x.id) === String(m.id))));
                      setInput((v) => v.replace(`@${m.handle}`, "").replace(/\s{2,}/g, " ").trim() + " ");
                    }}
                    aria-label={`Remove ${m.label}`}
                  >×</button>
                </span>
              ))}
              {selectedCommand && (
                <span className="crm-ai-mention-pill crm-ai-mention-pill--cmd">
                  /{selectedCommand.token}
                  <button
                    className="crm-ai-mention-pill__remove"
                    onClick={() => {
                      setSelectedCommand(null);
                      setInput((v) => v.replace(new RegExp(`\\/${selectedCommand.token}\\s?`), "").trim() + " ");
                    }}
                    aria-label="Remove command"
                  >×</button>
                </span>
              )}
            </div>
          )}

          {/* Autocomplete dropdown */}
          {dropdown && dropdown.results.length > 0 && (
            <div className="crm-ai-dropdown">
              {dropdown.mode === "mention" && dropdown.results.map((r, i) => (
                <button
                  key={`${r.type}-${r.id}`}
                  className={"crm-ai-dropdown-item" + (i === dropdown.activeIdx ? " active" : "")}
                  onMouseDown={(e) => { e.preventDefault(); selectMention(r); }}
                  onMouseEnter={() => setDropdown((d) => d ? { ...d, activeIdx: i } : d)}
                >
                  <span className="crm-ai-dropdown-item__type">{r.type.replace(/_/g, " ")}</span>
                  <span className="crm-ai-dropdown-item__label">{r.label}</span>
                  {r.subtitle && <span className="crm-ai-dropdown-item__sub">{r.subtitle}</span>}
                  <span className="crm-ai-dropdown-item__handle">@{r.handle}</span>
                </button>
              ))}
              {dropdown.mode === "command" && dropdown.results.map((c, i) => (
                <button
                  key={c.token}
                  className={"crm-ai-dropdown-item" + (i === dropdown.activeIdx ? " active" : "")}
                  onMouseDown={(e) => { e.preventDefault(); selectCommand(c); }}
                  onMouseEnter={() => setDropdown((d) => d ? { ...d, activeIdx: i } : d)}
                >
                  <span className="crm-ai-dropdown-item__type">command</span>
                  <span className="crm-ai-dropdown-item__label">/{c.token}</span>
                  <span className="crm-ai-dropdown-item__sub">{c.description}</span>
                </button>
              ))}
            </div>
          )}

          <div className="crm-ai-textarea-wrap">
            {input && (
              <div className="crm-ai-input-highlight" aria-hidden="true">
                {renderInputHighlights(input)}
              </div>
            )}
            <textarea
              ref={textareaRef}
              className={"crm-ai-textarea" + (input ? " crm-ai-textarea--highlighted" : "")}
              rows={hasMessages ? 2 : 3}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={loading || loadingConversation}
            />
          </div>
          <div className="crm-ai-input-foot">
            <div className="crm-ai-mode-icons" aria-label="AI generation mode">
              {AI_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={"crm-ai-mode-icon" + (mode === m.id ? " active" : "")}
                  onClick={() => setMode(m.id)}
                  title={m.label}
                  aria-label={m.label}
                >
                  {renderModeIcon(m.icon)}
                </button>
              ))}
            </div>
            <span className="crm-ai-selected-mode">{AI_MODES.find((m) => m.id === mode)?.short}</span>
            <div className="crm-ai-model-menu">
              <button className="crm-ai-model-btn" onClick={() => setModelOpen((o) => !o)}>
                {selectedModel.label}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {modelOpen && (
                <div className="crm-ai-model-dropdown">
                  {AI_MODELS.map((m) => (
                    <button
                      key={m.id}
                      className={"crm-ai-model-opt" + (model === m.id ? " active" : "")}
                      onClick={() => { setModel(m.id); setModelOpen(false); }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="crm-ai-send-btn" onClick={send} disabled={loading || loadingConversation || !input.trim()}>
              {loading ? "…" : (
                <React.Fragment>
                  Send
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </React.Fragment>
              )}
            </button>
            {sendError && (
              <div className="crm-ai-send-error" role="alert">{sendError}</div>
            )}
          </div>
        </div>
        {!hasMessages && (
          <div className="crm-ai-welcome__hint">
            Press Enter to send · Shift+Enter for new line
            <span className="crm-ai-welcome__hint-sep"> · </span>
            <span className="crm-ai-welcome__hint-cmd">Use <code>@</code> to reference records, <code>/</code> to run commands</span>
          </div>
        )}
        {!hasMessages && (
          <div className="crm-ai-welcome__examples">
            <span>e.g.</span>
            <code>@Talent: John Smith /analyze</code>
            <code>@Lead: 12 /agent follow up until resolved</code>
            <code>@SocialPost: 5 /post-now</code>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Automation status badge ───────────────────────────────────────────────────

function AutoBadge({ status }) {
  return <span className={`crm-badge crm-badge--${status}`}>{status.replace("-", " ")}</span>;
}

// ── CRM Automations control room ──────────────────────────────────────────────

function CrmAutomations() {
  const [section,      setSection]      = React.useState("agents");
  const [summary,      setSummary]      = React.useState(null);
  const [agents,       setAgents]       = React.useState([]);
  const [posts,        setPosts]        = React.useState([]);
  const [voiceProfiles,setVoiceProfiles]= React.useState([]);
  const [leads,        setLeads]        = React.useState([]);
  const [loading,      setLoading]      = React.useState(true);
  const [toast,        setToast]        = React.useState(null);
  const [modal,        setModal]        = React.useState(null); // { type: "agent"|"post"|"lead"|"voice", data? }

  const api = window.HEYA_API;

  React.useEffect(() => { loadAll(); }, []);

  function showToast(msg, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function loadAll() {
    setLoading(true);
    try {
      const [s, a, p, v, l] = await Promise.allSettled([
        api.getAutomationsSummary(),
        api.getAutomationAgents(),
        api.getSocialPosts(),
        api.getVoiceProfiles(),
        api.getLeadFollowups(),
      ]);
      if (s.status === "fulfilled") setSummary(s.value?.summary || null);
      if (a.status === "fulfilled") setAgents(a.value?.agents || []);
      if (p.status === "fulfilled") setPosts(p.value?.posts || []);
      if (v.status === "fulfilled") setVoiceProfiles(v.value?.profiles || []);
      if (l.status === "fulfilled") setLeads(l.value?.leads || []);
    } finally {
      setLoading(false);
    }
  }

  async function handleAgentAction(agent, action) {
    if (action === "view") { setModal({ type: "agent-detail", data: agent }); return; }
    try {
      let r;
      if (action === "stop")    r = await api.stopAutomationAgent(agent.id);
      else if (action === "restart") r = await api.restartAutomationAgent(agent.id);
      if (r?.agent) setAgents((prev) => prev.map((a) => a.id === agent.id ? r.agent : a));
      const s = await api.getAutomationsSummary();
      setSummary(s.summary);
      showToast(`Agent ${action === "restart" ? "restarted" : "stopped"}.`);
    } catch { showToast("Action failed.", false); }
  }

  async function handlePostAction(post, action) {
    try {
      let updated;
      if (action === "approve") {
        const r = await api.approveSocialPost(post.id);
        updated = r.post;
        showToast("Post approved and scheduled.");
      } else if (action === "cancel") {
        const r = await api.updateSocialPost(post.id, { status: "draft" });
        updated = r.post;
        showToast("Post moved to draft.");
      } else if (action === "post-now") {
        const r = await api.postSocialPostNow(post.id);
        if (r.ok) {
          updated = r.post;
          showToast("Post published!");
        } else if (r.code === "reauth_required") {
          showToast(`${post.platform} reconnection required — reconnect in Settings.`, false);
          updated = r.post;
        } else {
          showToast(r.error || "Post failed.", false);
          updated = r.post;
        }
      }
      if (updated) setPosts((prev) => prev.map((p) => p.id === post.id ? updated : p));
    } catch { showToast("Action failed.", false); }
  }

  async function handleLeadAction(lead, action) {
    try {
      if (action === "contacted") {
        const r = await api.markLeadContacted(lead.id);
        setLeads((prev) => prev.map((l) => l.id === lead.id ? (r.lead || l) : l));
        showToast("Marked as contacted.");
      } else if (action === "open") {
        const payload = {
          sourceType:    "lead",
          leadId:        lead.id,
          contactName:   lead.contactName,
          contactEmail:  lead.contactEmail,
          serviceNeeded: lead.serviceNeeded,
          prompt:        `Follow up with ${lead.contactName || "this lead"} about ${lead.serviceNeeded || "their enquiry"}.`,
        };
        try { sessionStorage.setItem("heya.pendingCrmAgentContext", JSON.stringify(payload)); } catch { /* ignore */ }
        window.dispatchEvent(new CustomEvent("heya:crm-agent-context", { detail: payload }));
      } else if (action === "agent") {
        const r = await api.startLeadAgent(lead.id);
        if (r.agent) setAgents((prev) => [r.agent, ...prev]);
        if (r.lead)  setLeads((prev) => prev.map((l) => l.id === lead.id ? r.lead : l));
        showToast("Agent created and linked to lead.");
        setSection("agents");
      }
    } catch { showToast("Action failed.", false); }
  }

  async function handleSyncLeads() {
    try {
      const r = await api.syncServiceRequestLeads();
      if (r.ok) {
        const { created, updated, skipped } = r.result;
        const l = await api.getLeadFollowups();
        setLeads(l.leads || []);
        const s = await api.getAutomationsSummary();
        setSummary(s.summary);
        showToast(`Synced: ${created} new, ${updated} updated, ${skipped} skipped.`);
      } else {
        showToast("Sync failed.", false);
      }
    } catch { showToast("Sync failed.", false); }
  }

  async function handleCreateAgent(form) {
    try {
      const r = await api.createAutomationAgent(form);
      setAgents((prev) => [r.agent, ...prev]);
      const s = await api.getAutomationsSummary();
      setSummary(s.summary);
      setModal(null);
      showToast("Agent created.");
    } catch { showToast("Failed to create agent.", false); }
  }

  async function handleCreatePost(form) {
    try {
      const r = await api.createSocialPost(form);
      setPosts((prev) => [r.post, ...prev]);
      setModal(null);
      showToast("Post drafted.");
    } catch { showToast("Failed to create post.", false); }
  }

  async function handleCreateLead(form) {
    try {
      const r = await api.createLeadFollowup(form);
      setLeads((prev) => [r.lead, ...prev]);
      const s = await api.getAutomationsSummary();
      setSummary(s.summary);
      setModal(null);
      showToast("Lead added.");
    } catch { showToast("Failed to add lead.", false); }
  }

  async function handleCreateVoice(form) {
    try {
      const r = await api.createVoiceProfile({
        name:             form.name,
        tone:             form.tone,
        audience:         form.audience,
        sample:           form.sample,
        avoidPhrases:     form.avoidPhrases,
        ctaStyle:         form.ctaStyle,
        lengthPreference: form.lengthPreference,
      });
      setVoiceProfiles((prev) => [...prev, r.profile]);
      setModal(null);
      showToast("Voice profile created.");
    } catch { showToast("Failed to create profile.", false); }
  }

  const fmt = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
  };

  return (
    <div className="crm-ctrl-root">

      {/* Toast */}
      {toast && (
        <div className={`crm-ctrl-toast${toast.ok ? "" : " crm-ctrl-toast--err"}`}>{toast.msg}</div>
      )}

      {/* Summary strip */}
      <div className="crm-ctrl-summary">
        {[
          { label: "Active Agents",    value: summary?.activeAgents   ?? "—" },
          { label: "Scheduled Posts",  value: summary?.scheduledPosts  ?? "—" },
          { label: "Leads Due Today",  value: summary?.leadsDueToday   ?? "—" },
          { label: "Failed Actions",   value: summary?.failedActions   ?? "—" },
        ].map((s) => (
          <div key={s.label} className="crm-ctrl-stat">
            <div className="crm-ctrl-stat__value">{s.value}</div>
            <div className="crm-ctrl-stat__label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Sub-nav */}
      <div className="crm-ctrl-sub-nav">
        {[
          { id: "agents", label: "AI Agents" },
          { id: "social", label: "Social Planner" },
          { id: "leads",  label: "Leads & Follow-ups" },
        ].map((tab) => (
          <button key={tab.id} className={`crm-ctrl-sub-tab${section === tab.id ? " active" : ""}`} onClick={() => setSection(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      {loading && <div className="crm-empty" style={{ padding: "48px 0" }}>Loading…</div>}

      {/* ── Agents section ───────────────────────────────────────────────────── */}
      {!loading && section === "agents" && (
        <div>
          <div className="crm-ctrl-toolbar">
            <span className="crm-ctrl-toolbar__title">AI Agents ({agents.length})</span>
            <button className="crm-sr-action-btn" onClick={() => setModal({ type: "agent" })}>+ New Agent</button>
          </div>
          {agents.length === 0 ? (
            <div className="crm-empty">No agents yet. Create one to get started.</div>
          ) : (
            <div className="crm-tbl">
              <table>
                <thead>
                  <tr>
                    <th>Agent</th><th>Goal</th><th>Target</th><th>Status</th>
                    <th>Last Action</th><th>Tokens</th><th>Started</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a) => (
                    <tr key={a.id}>
                      <td><span className="crm-tbl__name">{a.name}</span></td>
                      <td><span className="crm-tbl__muted">{a.goal || "—"}</span></td>
                      <td><span className="crm-tbl__muted">{a.target || "—"}</span></td>
                      <td><AutoBadge status={a.status} /></td>
                      <td><span className="crm-tbl__muted">{a.lastAction || "—"}</span></td>
                      <td><span className="crm-tbl__muted">{a.tokenUsage > 0 ? a.tokenUsage.toLocaleString() : "—"}</span></td>
                      <td><span className="crm-tbl__muted">{fmt(a.startedAt)}</span></td>
                      <td>
                        <div className="crm-tbl__actions">
                          <button className="crm-sr-action-btn" onClick={() => handleAgentAction(a, "view")}>View</button>
                          {["planning","running","waiting"].includes(a.status) && (
                            <button className="crm-sr-action-btn crm-sr-action-btn--danger" onClick={() => handleAgentAction(a, "stop")}>Stop</button>
                          )}
                          {["stopped","failed","completed"].includes(a.status) && (
                            <button className="crm-sr-action-btn" onClick={() => handleAgentAction(a, "restart")}>Restart</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Social Planner section ───────────────────────────────────────────── */}
      {!loading && section === "social" && (
        <div>
          <div className="crm-ctrl-toolbar">
            <span className="crm-ctrl-toolbar__title">Scheduled Posts ({posts.length})</span>
            <button className="crm-sr-action-btn" onClick={() => setModal({ type: "post" })}>+ Draft Post</button>
          </div>
          {posts.length === 0 ? (
            <div className="crm-empty">No posts drafted yet.</div>
          ) : (
            <div className="crm-tbl" style={{ marginBottom: 24 }}>
              <table>
                <thead>
                  <tr>
                    <th>Platform</th><th>Content</th><th>Voice</th>
                    <th>Scheduled</th><th>Status</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((p) => (
                    <tr key={p.id}>
                      <td><span className="crm-tbl__name" style={{ textTransform: "capitalize" }}>{p.platform}</span></td>
                      <td><span className="crm-tbl__muted" style={{ display: "block", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.content}</span></td>
                      <td><span className="crm-tbl__muted">{p.voiceProfile || "—"}</span></td>
                      <td><span className="crm-tbl__muted">{fmt(p.scheduledFor)}</span></td>
                      <td><AutoBadge status={p.status} /></td>
                      <td>
                        <div className="crm-tbl__actions">
                          {["draft","scheduled","needs-approval"].includes(p.status) && (
                            <button className="crm-sr-action-btn" onClick={() => handlePostAction(p, "post-now")}>Post Now</button>
                          )}
                          {p.status === "needs-approval" && (
                            <button className="crm-sr-action-btn" onClick={() => handlePostAction(p, "approve")}>Approve</button>
                          )}
                          {["draft","needs-approval"].includes(p.status) && (
                            <button className="crm-sr-action-btn" onClick={() => handlePostAction(p, "cancel")}>Reset</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Voice profiles */}
          <div className="crm-ctrl-toolbar" style={{ marginTop: 8 }}>
            <span className="crm-ctrl-toolbar__title">Voice Profiles</span>
            <button className="crm-sr-action-btn" onClick={() => setModal({ type: "voice" })}>+ New Profile</button>
          </div>
          <div className="crm-voice-grid">
            {voiceProfiles.map((v) => (
              <div key={v.id} className={`crm-voice-card${v.isDefault ? " crm-voice-card--default" : ""}`}>
                <div className="crm-voice-card__name">{v.name}{v.isDefault && <span className="crm-badge crm-badge--running" style={{ marginLeft: 6, fontSize: 9 }}>Default</span>}</div>
                <div className="crm-voice-card__meta">{v.tone}</div>
                <div className="crm-voice-card__meta" style={{ color: "#8a98ad" }}>{v.audience}</div>
                {v.sample && <div className="crm-voice-card__meta" style={{ marginTop: 6, fontStyle: "italic", fontSize: 11 }}>&ldquo;{v.sample.slice(0, 90)}&rdquo;</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Leads section ────────────────────────────────────────────────────── */}
      {!loading && section === "leads" && (
        <div>
          <div className="crm-ctrl-toolbar">
            <span className="crm-ctrl-toolbar__title">Lead Follow-ups ({leads.length})</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="crm-sr-action-btn" onClick={handleSyncLeads}>Sync Service Requests</button>
              <button className="crm-sr-action-btn" onClick={() => setModal({ type: "lead" })}>+ Add Lead</button>
            </div>
          </div>
          {leads.length === 0 ? (
            <div className="crm-empty">No leads yet. Add one or import from Service Requests.</div>
          ) : (
            <div className="crm-tbl">
              <table>
                <thead>
                  <tr>
                    <th>Contact</th><th>Service</th><th>Status</th>
                    <th>Priority</th><th>Due</th><th>Contacted</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <span className="crm-tbl__name">{l.contactName || "—"}</span>
                        {l.contactEmail && <div className="crm-tbl__muted">{l.contactEmail}</div>}
                      </td>
                      <td><span className="crm-tbl__muted">{l.serviceNeeded || "—"}</span></td>
                      <td><AutoBadge status={l.status} /></td>
                      <td><span className="crm-tbl__muted" style={{ textTransform: "capitalize" }}>{l.priority}</span></td>
                      <td><span className="crm-tbl__muted">{fmt(l.dueDate)}</span></td>
                      <td><span className="crm-tbl__muted">{fmt(l.contactedAt)}</span></td>
                      <td>
                        <div className="crm-tbl__actions">
                          <button className="crm-sr-action-btn" onClick={() => handleLeadAction(l, "open")}>Open AI</button>
                          <button className="crm-sr-action-btn" onClick={() => handleLeadAction(l, "agent")}>+ Agent</button>
                          {l.status !== "contacted" && (
                            <button className="crm-sr-action-btn" onClick={() => handleLeadAction(l, "contacted")}>Contacted</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      {modal?.type === "agent" && (
        <CrmCtrlModal title="New Agent" onClose={() => setModal(null)}>
          <AgentForm onSubmit={handleCreateAgent} onCancel={() => setModal(null)} />
        </CrmCtrlModal>
      )}
      {modal?.type === "agent-detail" && modal.data && (
        <CrmCtrlModal title={modal.data.name} onClose={() => setModal(null)}>
          <div className="crm-ctrl-form">
            {[
              ["Status",        modal.data.status],
              ["Type",          modal.data.agentType],
              ["Goal",          modal.data.goal],
              ["Target",        modal.data.target],
              ["Target type",   modal.data.targetType],
              ["Target ID",     modal.data.targetId],
              ["Started by",    modal.data.startedBy],
              ["Last action",   modal.data.lastAction],
              ["Tokens used",   modal.data.tokenUsage > 0 ? modal.data.tokenUsage.toLocaleString() : "0"],
              ["Result",        modal.data.resultSummary],
              ["Started",       fmt(modal.data.startedAt)],
              ["Completed",     fmt(modal.data.completedAt)],
              ["Error",         modal.data.error],
            ].map(([k, v]) => v ? (
              <div key={k} style={{ marginBottom: 8 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--muted)", marginBottom: 2 }}>{k}</label>
                <span style={{ fontSize: 13, color: "var(--ink)" }}>{v}</span>
              </div>
            ) : null)}
          </div>
        </CrmCtrlModal>
      )}
      {modal?.type === "post" && (
        <CrmCtrlModal title="Draft Social Post" onClose={() => setModal(null)}>
          <PostForm voiceProfiles={voiceProfiles} onSubmit={handleCreatePost} onCancel={() => setModal(null)} />
        </CrmCtrlModal>
      )}
      {modal?.type === "lead" && (
        <CrmCtrlModal title="Add Lead" onClose={() => setModal(null)}>
          <LeadForm onSubmit={handleCreateLead} onCancel={() => setModal(null)} />
        </CrmCtrlModal>
      )}
      {modal?.type === "voice" && (
        <CrmCtrlModal title="New Voice Profile" onClose={() => setModal(null)}>
          <VoiceForm onSubmit={handleCreateVoice} onCancel={() => setModal(null)} />
        </CrmCtrlModal>
      )}
    </div>
  );
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────

function CrmCtrlModal({ title, onClose, children }) {
  return (
    <div className="crm-ctrl-modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="crm-ctrl-modal__scrim" onClick={onClose} />
      <div className="crm-ctrl-modal__panel">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div className="crm-ctrl-modal__head">{title}</div>
          <button className="crm-sr-action-btn" onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Create forms ──────────────────────────────────────────────────────────────

function AgentForm({ onSubmit, onCancel }) {
  const [f, setF] = React.useState({ name: "", goal: "", target: "" });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <div className="crm-ctrl-form">
      <label>Name *</label>
      <input value={f.name} onChange={set("name")} placeholder="e.g. Follow-up Recruiter" />
      <label>Goal</label>
      <input value={f.goal} onChange={set("goal")} placeholder="What should this agent do?" />
      <label>Target</label>
      <input value={f.target} onChange={set("target")} placeholder="Email, contact name, or audience" />
      <div className="crm-ctrl-form__actions">
        <button className="crm-sr-action-btn" onClick={onCancel}>Cancel</button>
        <button className="crm-mail-compose-btn" disabled={!f.name.trim()} onClick={() => onSubmit(f)}>Create Agent</button>
      </div>
    </div>
  );
}

function PostForm({ voiceProfiles, onSubmit, onCancel }) {
  const [f, setF] = React.useState({ platform: "facebook", content: "", scheduledFor: "", voiceProfile: "", status: "draft" });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <div className="crm-ctrl-form">
      <label>Platform *</label>
      <select value={f.platform} onChange={set("platform")}>
        <option value="facebook">Facebook</option>
        <option value="linkedin">LinkedIn</option>
      </select>
      <label>Content *</label>
      <textarea value={f.content} onChange={set("content")} rows={4} placeholder="Post text…" />
      <label>Voice Profile</label>
      <select value={f.voiceProfile} onChange={set("voiceProfile")}>
        <option value="">— None —</option>
        {voiceProfiles.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
      </select>
      <label>Schedule for</label>
      <input type="datetime-local" value={f.scheduledFor} onChange={set("scheduledFor")} />
      <div className="crm-ctrl-form__actions">
        <button className="crm-sr-action-btn" onClick={onCancel}>Cancel</button>
        <button className="crm-mail-compose-btn" disabled={!f.content.trim()} onClick={() => onSubmit({ ...f, status: f.scheduledFor ? "scheduled" : "draft" })}>Save Draft</button>
      </div>
    </div>
  );
}

function LeadForm({ onSubmit, onCancel }) {
  const [f, setF] = React.useState({ contactName: "", contactEmail: "", contactPhone: "", contactMethod: "", serviceNeeded: "", priority: "normal", dueDate: "", notes: "", nextAction: "" });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <div className="crm-ctrl-form">
      <label>Contact name</label>
      <input value={f.contactName} onChange={set("contactName")} placeholder="Full name" />
      <label>Email</label>
      <input type="email" value={f.contactEmail} onChange={set("contactEmail")} placeholder="email@example.com" />
      <label>Phone</label>
      <input type="tel" value={f.contactPhone} onChange={set("contactPhone")} placeholder="+675 xxx xxxx" />
      <label>Preferred contact method</label>
      <select value={f.contactMethod} onChange={set("contactMethod")}>
        <option value="">— Any —</option>
        <option value="email">Email</option>
        <option value="phone">Phone</option>
        <option value="whatsapp">WhatsApp</option>
      </select>
      <label>Service needed</label>
      <input value={f.serviceNeeded} onChange={set("serviceNeeded")} placeholder="e.g. Recruitment, Training" />
      <label>Priority</label>
      <select value={f.priority} onChange={set("priority")}>
        <option value="low">Low</option>
        <option value="normal">Normal</option>
        <option value="high">High</option>
      </select>
      <label>Due date</label>
      <input type="date" value={f.dueDate} onChange={set("dueDate")} />
      <label>Next action</label>
      <input value={f.nextAction} onChange={set("nextAction")} placeholder="e.g. Send quote, Schedule call" />
      <label>Notes</label>
      <textarea value={f.notes} onChange={set("notes")} rows={2} placeholder="Any context…" />
      <div className="crm-ctrl-form__actions">
        <button className="crm-sr-action-btn" onClick={onCancel}>Cancel</button>
        <button className="crm-mail-compose-btn" onClick={() => onSubmit(f)}>Add Lead</button>
      </div>
    </div>
  );
}

function VoiceForm({ onSubmit, onCancel }) {
  const [f, setF] = React.useState({ name: "", tone: "", audience: "", sample: "", avoidPhrases: "", ctaStyle: "", lengthPreference: "" });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <div className="crm-ctrl-form">
      <label>Name *</label>
      <input value={f.name} onChange={set("name")} placeholder="e.g. PNG Youth Voice" />
      <label>Tone</label>
      <input value={f.tone} onChange={set("tone")} placeholder="e.g. Upbeat, casual, encouraging" />
      <label>Audience</label>
      <input value={f.audience} onChange={set("audience")} placeholder="Who does this voice speak to?" />
      <label>Sample phrase</label>
      <textarea value={f.sample} onChange={set("sample")} rows={2} placeholder="A short example sentence in this voice…" />
      <label>Phrases to avoid</label>
      <input value={f.avoidPhrases} onChange={set("avoidPhrases")} placeholder="e.g. jargon, buzzwords to avoid" />
      <label>CTA style</label>
      <input value={f.ctaStyle} onChange={set("ctaStyle")} placeholder='e.g. "Apply now", "Learn more", subtle' />
      <label>Length preference</label>
      <select value={f.lengthPreference} onChange={set("lengthPreference")}>
        <option value="">— Any —</option>
        <option value="short">Short (1–2 sentences)</option>
        <option value="medium">Medium (1 paragraph)</option>
        <option value="long">Long (2+ paragraphs)</option>
      </select>
      <div className="crm-ctrl-form__actions">
        <button className="crm-sr-action-btn" onClick={onCancel}>Cancel</button>
        <button className="crm-mail-compose-btn" disabled={!f.name.trim()} onClick={() => onSubmit(f)}>Create Profile</button>
      </div>
    </div>
  );
}

// ─── Main CRM Workspace ───────────────────────────────────────────────────────

function CRMWorkspace({
  initialTab = "overview",
  messages = [],
  messageSummary = {},
  positions = [],
  applicants = [],
  talentPool = [],
  employerSubmissions = [],
  onMessagesChanged,
  onTabChange,
}) {
  const [tab, setTab] = React.useState(initialTab);
  const [serviceRequests, setServiceRequests] = React.useState([]);
  const [srLoading, setSrLoading]             = React.useState(true);
  const [srError, setSrError]                 = React.useState(null);

  // Sync if parent changes initialTab (e.g. sidebar nav click)
  React.useEffect(() => {
    if (initialTab && initialTab !== tab) setTab(initialTab);
  }, [initialTab]);

  function handleTabChange(id) {
    setTab(id);
    if (onTabChange) onTabChange(id);
  }

  // Fetch service requests once on mount
  function loadServiceRequests() {
    setSrLoading(true);
    setSrError(null);
    window.HEYA_API.getCrmServiceRequests()
      .then((d) => { setServiceRequests(d.serviceRequests || []); setSrLoading(false); })
      .catch((err) => { setSrError(err.message || "Could not load service requests."); setSrLoading(false); });
  }

  React.useEffect(() => { loadServiceRequests(); }, []);

  React.useEffect(() => {
    function onAgentContext() {
      setTab("ai-chat");
      if (onTabChange) onTabChange("ai-chat");
    }
    window.addEventListener("heya:crm-agent-context", onAgentContext);
    return () => window.removeEventListener("heya:crm-agent-context", onAgentContext);
  }, [onTabChange]);

  return (
    <div className="crm-workspace">
      <div className={"crm-body" + (tab === "inbox" ? " crm-body--mail" : "")}>
        {tab === "overview" && (
          <CrmOverview
            messages={messages}
            serviceRequests={serviceRequests}
            talentPool={talentPool}
            applicants={applicants}
            employerSubmissions={employerSubmissions}
          />
        )}
        {tab === "inbox" && (
          <CrmInbox
            messages={messages}
            positions={positions}
            onMessagesChanged={onMessagesChanged}
          />
        )}
        {tab === "service-requests" && (
          <CrmServiceRequests
            requests={serviceRequests}
            loading={srLoading}
            error={srError}
            reload={loadServiceRequests}
          />
        )}
        {tab === "email-lists" && (
          <CrmEmailLists
            talentPool={talentPool}
            applicants={applicants}
            employerSubmissions={employerSubmissions}
          />
        )}
        {tab === "ai-chat" && <CrmAiChat />}
        {tab === "website-bots" && (
          window.PublicBotWorkspace
            ? <window.PublicBotWorkspace />
            : <div className="crm-empty">Website Bots module failed to load.</div>
        )}
        {tab === "automations" && <CrmAutomations />}
      </div>
    </div>
  );
}

window.CRMWorkspace = CRMWorkspace;
