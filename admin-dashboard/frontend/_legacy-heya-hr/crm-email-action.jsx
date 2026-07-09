const HEYA_PENDING_CRM_COMPOSE_KEY = "heya.pendingCrmCompose";

function normalizeCrmEmailRecipients(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value || "")
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function crmEmailErrorMessage(error) {
  const message = String(error?.message || error || "Unable to send email.");
  if (/not configured|email is not configured|EMAIL_FROM|EMAIL_USER|EMAIL_PASS/i.test(message)) {
    return "CRM email is not configured yet. Add EMAIL_FROM, EMAIL_USER, and EMAIL_PASS in the server environment.";
  }
  return message.replace(/^Error:\s*/i, "") || "Unable to send email. Please try again.";
}

function buildCrmEmailContext(input = {}) {
  const recipients = normalizeCrmEmailRecipients(input.email || input.to);
  const sourceLabel = input.sourceLabel || input.sourceType || "CRM record";
  const name = input.name || input.recipientName || "";
  const primary = recipients[0] || "";
  const subject = input.subject || (sourceLabel ? `Glondiasites - ${sourceLabel}` : "Glondiasites");
  const body = input.body || (name
    ? `Hello ${name},\n\n`
    : "");

  return {
    ...input,
    email: primary,
    to: recipients.join(", "),
    recipients,
    name,
    sourceLabel,
    sourceType: input.sourceType || "dashboard-record",
    sourceId: input.sourceId || "",
    subject,
    body,
  };
}

function openCrmMailCompose(context = {}) {
  const detail = buildCrmEmailContext(context);
  const compose = {
    to: detail.to,
    subject: detail.subject,
    body: detail.body,
    sourceType: detail.sourceType,
    sourceId: detail.sourceId,
  };

  try {
    sessionStorage.setItem(HEYA_PENDING_CRM_COMPOSE_KEY, JSON.stringify(compose));
  } catch (_) {}

  window.dispatchEvent(new CustomEvent("heya:crm-compose", { detail: compose }));
}

function CrmEmailActionHost({ onOpenCrmMail }) {
  const [action, setAction] = React.useState(null);
  const [mode, setMode] = React.useState("choice");
  const [form, setForm] = React.useState({ to: "", subject: "", body: "" });
  const [sending, setSending] = React.useState(false);
  const [notice, setNotice] = React.useState(null);

  const close = React.useCallback(() => {
    if (sending) return;
    setAction(null);
    setMode("choice");
    setNotice(null);
  }, [sending]);

  React.useEffect(() => {
    const open = (event) => {
      const detail = buildCrmEmailContext(event.detail || {});
      if (!detail.to) return;
      setAction(detail);
      setForm({ to: detail.to, subject: detail.subject || "", body: detail.body || "" });
      setMode("choice");
      setNotice(null);
      setSending(false);
    };
    const keydown = (event) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("heya:email-action", open);
    window.addEventListener("keydown", keydown);
    return () => {
      window.removeEventListener("heya:email-action", open);
      window.removeEventListener("keydown", keydown);
    };
  }, [close]);

  if (!action) return null;

  const sendHere = async () => {
    if (!form.to.trim() || !form.subject.trim() || !form.body.trim()) {
      setNotice({ type: "error", text: "To, subject, and message are required." });
      return;
    }
    setSending(true);
    setNotice(null);
    try {
      await window.HEYA_API.sendCrmEmail({
        to: form.to,
        subject: form.subject,
        text: form.body,
      });
      setNotice({ type: "success", text: "Email sent and saved in CRM Mail." });
      window.setTimeout(() => {
        setSending(false);
        setAction(null);
        setMode("choice");
        setNotice(null);
      }, 900);
    } catch (error) {
      setNotice({ type: "error", text: crmEmailErrorMessage(error) });
      setSending(false);
    }
  };

  const openInCrm = () => {
    openCrmMailCompose({ ...action, to: form.to, subject: form.subject, body: form.body });
    if (typeof onOpenCrmMail === "function") onOpenCrmMail();
    setAction(null);
    setMode("choice");
    setNotice(null);
  };

  return (
    <div className="crm-email-action" role="dialog" aria-modal="true" aria-labelledby="crm-email-action-title">
      <div className="crm-email-action__scrim" onMouseDown={close} />
      <div className="crm-email-action__panel" onMouseDown={(event) => event.stopPropagation()}>
        <div className="crm-email-action__head">
          <div>
            <div className="crm-email-action__eyebrow">{action.sourceLabel}</div>
            <div id="crm-email-action-title" className="crm-email-action__title">
              {mode === "compose" ? "Send email here" : "Email contact"}
            </div>
          </div>
          <button type="button" className="crm-email-action__close" onClick={close} aria-label="Close email action" disabled={sending}>x</button>
        </div>

        <div className="crm-email-action__recipient">
          <span>{action.name || "Recipient"}</span>
          <strong>{action.to}</strong>
        </div>

        {mode === "choice" && (
          <div className="crm-email-action__choices">
            <button type="button" className="crm-email-action__primary" onClick={() => setMode("compose")}>
              Send Email Here
            </button>
            <button type="button" className="crm-email-action__secondary" onClick={openInCrm}>
              Open in CRM Mail
            </button>
            <button type="button" className="crm-email-action__ghost" onClick={close}>Cancel</button>
          </div>
        )}

        {mode === "compose" && (
          <div className="crm-email-compose">
            <label>
              <span>To</span>
              <input value={form.to} onChange={(event) => setForm({ ...form, to: event.target.value })} />
            </label>
            <label>
              <span>Subject</span>
              <input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} />
            </label>
            <label>
              <span>Message</span>
              <textarea rows="7" value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} />
            </label>
            {notice && <div className={"crm-email-action__notice crm-email-action__notice--" + notice.type}>{notice.text}</div>}
            <div className="crm-email-action__foot">
              <button type="button" className="crm-email-action__ghost" onClick={() => setMode("choice")} disabled={sending}>Back</button>
              <button type="button" className="crm-email-action__secondary" onClick={openInCrm} disabled={sending}>Open in CRM Mail</button>
              <button type="button" className="crm-email-action__primary" onClick={sendHere} disabled={sending || !form.to.trim() || !form.subject.trim() || !form.body.trim()}>
                {sending ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function openCrmEmailAction(context = {}) {
  window.dispatchEvent(new CustomEvent("heya:email-action", { detail: context }));
}

function CrmEmailActionButton({
  email,
  to,
  name,
  sourceType,
  sourceLabel,
  sourceId,
  subject,
  body,
  className = "",
  title,
  disabled,
  children,
}) {
  const recipients = normalizeCrmEmailRecipients(email || to);
  const unavailable = disabled || recipients.length === 0;
  return (
    <button
      type="button"
      className={className}
      title={unavailable ? "No email on file" : (title || `Email ${recipients.join(", ")}`)}
      disabled={unavailable}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (unavailable) return;
        openCrmEmailAction({ email: recipients, name, sourceType, sourceLabel, sourceId, subject, body });
      }}
    >
      {children || "Email"}
    </button>
  );
}

window.HEYA_PENDING_CRM_COMPOSE_KEY = HEYA_PENDING_CRM_COMPOSE_KEY;
window.openCrmEmailAction = openCrmEmailAction;
window.openCrmMailCompose = openCrmMailCompose;
window.CrmEmailActionHost = CrmEmailActionHost;
window.CrmEmailActionButton = CrmEmailActionButton;
