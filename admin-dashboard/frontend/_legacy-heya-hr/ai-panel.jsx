const ROXANNE_AI_LOGO = "/dashboard-assets/assets/glondia-icon.jpg";

const CATALOG_ITEMS = [
  { icon: "📋", label: "Job Postings", detail: "View, create, update and delete positions" },
  { icon: "👥", label: "Applications", detail: "Browse, screen, shortlist and rank applicants" },
  { icon: "🏊", label: "Talent Pool", detail: "Manage candidate profiles and talent pipeline" },
  { icon: "📊", label: "Screenings", detail: "AI scoring, tie-breaking and ranking tools" },
  { icon: "💼", label: "Offers", detail: "Track and manage job offers and offer status" },
  { icon: "🔔", label: "Notifications", detail: "System alerts and dashboard notifications" },
  { icon: "📨", label: "Messages", detail: "Inbox, archive and message management" }
];

function formatRoxanneResult(response) {
  const summary = response?.planSummary || {};

  // ── Image generation ────────────────────────────────────────────────
  if (response?.parserMode === "image-generation" || response?.parserMode === "image-edit") {
    return response?.message || (response?.ok ? "Image ready." : "Image request failed.");
  }

  // ── Direct OpenAI / agent AI response — return clean text ──────────
  const isAiResponse = ["direct-openai", "openai", "agent", "fallback"].includes(response?.parserMode);
  if (isAiResponse) {
    if (response?.raw) return response.raw;
    if (response?.message) return response.message;
    return response?.ok ? "Done." : "Something went wrong. Please try again.";
  }

  // ── Social post (MCP /execute) ──────────────────────────────────────
  if (summary.type === "social_post") {
    if (response?.reauthRequired) {
      return `${response.provider || "Provider"} authentication is required. Use the reconnect button — it will retry your post automatically once you're connected.`;
    }
    if (response?.confirmationRequired) {
      return "Review the draft below. I will only publish after you press **Confirm Post**.";
    }
    if (response?.ok) {
      return response?.message || `Posted to ${summary.provider || "social"} successfully.`;
    }
    return response?.message || "Post failed. Please try again.";
  }

  // ── Generic MCP result ──────────────────────────────────────────────
  const data = response?.data || null;
  if (data) {
    const pretty = JSON.stringify(data, null, 2).slice(0, 900);
    return (response?.message ? response.message + "\n\n" : "") + pretty;
  }
  if (response?.raw) return response.raw;
  return response?.message || "GlondiaAI request completed.";
}

const ROXANNE_IMAGE_MAX_EDGE = 1280;
const ROXANNE_IMAGE_TARGET_BYTES = 650 * 1024;

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function readBlobAsBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result.split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(blob);
  });
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load image."));
    };
    img.src = url;
  });
}

async function compressImageForRoxanne(file) {
  const img = await loadImageFromFile(file);
  const scale = Math.min(1, ROXANNE_IMAGE_MAX_EDGE / Math.max(img.width, img.height));
  let width = Math.max(1, Math.round(img.width * scale));
  let height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  let quality = 0.76;
  let blob = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    canvas.width = width;
    canvas.height = height;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    blob = await canvasToBlob(canvas, "image/jpeg", quality);
    if (!blob || blob.size <= ROXANNE_IMAGE_TARGET_BYTES) break;
    quality = Math.max(0.52, quality - 0.08);
    if (quality <= 0.52) {
      width = Math.max(640, Math.round(width * 0.86));
      height = Math.max(640, Math.round(height * 0.86));
    }
  }

  if (!blob) throw new Error("Could not compress image.");
  const baseName = String(file.name || "image").replace(/\.[^.]+$/, "").replace(/[^\w.\-]/g, "_");
  return {
    name: `${baseName || "image"}-roxanne.jpg`,
    type: "image/jpeg",
    contentBase64: await readBlobAsBase64(blob),
    originalName: file.name,
    compressed: true
  };
}

function readFileForRoxanne(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (String(file.type || "").toLowerCase().startsWith("image/")) {
      compressImageForRoxanne(file).then(resolve).catch(reject);
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result.split(",")[1] || "";
      resolve({ name: file.name, type: file.type, contentBase64: base64 });
    };
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

/* ── Markdown Renderer ─────────────────────────────────────────────── */

/**
 * Converts inline markdown tokens within a single line of text into
 * an array of strings and React elements.
 * Handles: **bold**, *italic*, `inline code`
 */
function renderInline(text) {
  if (!text) return [];
  const result = [];
  // Match **bold**, *italic*, `code` — in that priority order
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let cursor = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      result.push(text.slice(cursor, match.index));
    }
    if (match[2] !== undefined) {
      result.push(React.createElement("strong", { key: match.index }, match[2]));
    } else if (match[3] !== undefined) {
      result.push(React.createElement("em", { key: match.index }, match[3]));
    } else if (match[4] !== undefined) {
      result.push(React.createElement("code", { key: match.index, className: "roxanne-md-code" }, match[4]));
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) result.push(text.slice(cursor));
  return result;
}

/**
 * Splits raw text into an array of typed block objects ready to render.
 * Block types: code | header | hr | ul | ol | para
 */
function parseMarkdownBlocks(raw) {
  const lines = String(raw || "").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Fenced code block ───────────────────────────────────────────
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: "code", lang, content: codeLines.join("\n") });
      i++; // skip closing ```
      continue;
    }

    // ── ATX heading (# ## ###) ──────────────────────────────────────
    const headMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headMatch) {
      blocks.push({ type: "header", level: headMatch[1].length, content: headMatch[2] });
      i++;
      continue;
    }

    // ── Horizontal rule ─────────────────────────────────────────────
    if (/^[-*]{3,}$/.test(line.trim())) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // ── Unordered list ──────────────────────────────────────────────
    if (/^[\-\*\•]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[\-\*\•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[\-\*\•]\s+/, ""));
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // ── Ordered list ────────────────────────────────────────────────
    if (/^\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+[.)]\s+/, ""));
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // ── Blank line ──────────────────────────────────────────────────
    if (line.trim() === "") {
      i++;
      continue;
    }

    // ── Paragraph — gather consecutive non-special lines ───────────
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("#") &&
      !lines[i].startsWith("```") &&
      !/^[\-\*\•]\s+/.test(lines[i]) &&
      !/^\d+[.)]\s+/.test(lines[i]) &&
      !/^[-*]{3,}$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "para", lines: paraLines });
    }
  }

  return blocks;
}

/**
 * Renders a single bot message as structured markdown.
 * Code blocks include a copy-to-clipboard button.
 */
function MarkdownMessage({ text }) {
  const [copiedIdx, setCopiedIdx] = React.useState(null);
  const blocks = parseMarkdownBlocks(text);

  function copyCode(content, idx) {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(content).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1600);
    });
  }

  if (blocks.length === 0) {
    return React.createElement("div", { className: "ai-msg__text roxanne-md" }, text);
  }

  return React.createElement(
    "div",
    { className: "ai-msg__text roxanne-md" },
    blocks.map((block, idx) => {
      switch (block.type) {
        case "code":
          return React.createElement(
            "div",
            { key: idx, className: "roxanne-md-codeblock" },
            block.lang && React.createElement("span", { className: "roxanne-md-lang" }, block.lang),
            React.createElement(
              "button",
              {
                className: "roxanne-md-copy" + (copiedIdx === idx ? " is-copied" : ""),
                onClick: () => copyCode(block.content, idx),
                title: "Copy code"
              },
              copiedIdx === idx
                ? React.createElement(React.Fragment, null,
                    React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", width: "11", height: "11", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round" },
                      React.createElement("polyline", { points: "20 6 9 17 4 12" })
                    ),
                    " Copied"
                  )
                : React.createElement(React.Fragment, null,
                    React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", width: "11", height: "11", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
                      React.createElement("rect", { x: "9", y: "9", width: "13", height: "13", rx: "2", ry: "2" }),
                      React.createElement("path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" })
                    ),
                    " Copy"
                  )
            ),
            React.createElement("pre", null,
              React.createElement("code", null, block.content)
            )
          );

        case "header": {
          const tag = `h${Math.min(block.level + 2, 6)}`;
          return React.createElement(
            tag,
            { key: idx, className: `roxanne-md-h${block.level}` },
            renderInline(block.content)
          );
        }

        case "hr":
          return React.createElement("hr", { key: idx, className: "roxanne-md-hr" });

        case "ul":
          return React.createElement(
            "ul",
            { key: idx, className: "roxanne-md-ul" },
            block.items.map((item, j) =>
              React.createElement("li", { key: j }, renderInline(item))
            )
          );

        case "ol":
          return React.createElement(
            "ol",
            { key: idx, className: "roxanne-md-ol" },
            block.items.map((item, j) =>
              React.createElement("li", { key: j }, renderInline(item))
            )
          );

        case "para": {
          // Render each line with inline formatting; inject <br> between lines
          const children = block.lines.reduce((acc, line, j) => {
            if (j > 0) acc.push(React.createElement("br", { key: `br${j}` }));
            acc.push(...renderInline(line));
            return acc;
          }, []);
          return React.createElement("p", { key: idx, className: "roxanne-md-p" }, children);
        }

        default:
          return null;
      }
    })
  );
}

/* ── Typewriter streaming effect ───────────────────────────────────── */

const STREAM_CHUNK = 3;   // characters revealed per tick
const STREAM_SPEED = 20;  // ms per tick  →  ~150 chars / sec

/**
 * Streams `fullText` character-by-character, then hands off to MarkdownMessage
 * once every character has been revealed.
 * `scrollRef` — the .ai-body ref; we scroll it directly on each tick
 * so the user tracks the bottom without causing extra React re-renders.
 */
function StreamingMessage({ fullText, scrollRef }) {
  const [displayed, setDisplayed] = React.useState("");
  const [done, setDone] = React.useState(!fullText);

  React.useEffect(() => {
    if (!fullText) { setDone(true); return; }
    let pos = 0;
    setDisplayed("");
    setDone(false);

    const id = setInterval(() => {
      pos = Math.min(pos + STREAM_CHUNK, fullText.length);
      setDisplayed(fullText.slice(0, pos));
      // Scroll body without triggering parent re-render
      if (scrollRef?.current) {
        const el = scrollRef.current;
        el.scrollTop = el.scrollHeight;
      }
      if (pos >= fullText.length) {
        clearInterval(id);
        setDone(true);
      }
    }, STREAM_SPEED);

    return () => clearInterval(id);
  }, [fullText]);

  if (done) return React.createElement(MarkdownMessage, { text: fullText });

  return (
    <div className="ai-msg__text roxanne-stream">
      <span className="roxanne-stream-text">{displayed}</span>
      <span className="roxanne-stream-cursor" aria-hidden="true">▋</span>
    </div>
  );
}

/* ── Utility helpers ────────────────────────────────────────────────── */

function formatMessageTime(ts) {
  if (!ts) return "";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60)   return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const BADGE_MAP = [
  { test: (l) => l.includes("error") || l.includes("reconnect error"), label: "Error",      cls: "is-error"   },
  { test: (l) => l.includes("posted") || l.includes("posting"),        label: "Posted",     cls: "is-success" },
  { test: (l) => l.includes("cancelled"),                               label: "Cancelled",  cls: "is-muted"   },
  { test: (l) => l.includes("retrying") || l.includes("connecting"),   label: "Connecting", cls: "is-warn"    },
  { test: (l) => l.includes("auth") || l.includes("reauth"),           label: "Auth",       cls: "is-warn"    },
];

function getMessageBadge(label = "") {
  const l = label.toLowerCase();
  return BADGE_MAP.find((b) => b.test(l)) || null;
}

const SCORE_RE = /(?:score|match|suitability|rating)[:\s]+(\d+)\s*[\/]\s*(\d+)|(\d+)\s*\/\s*(100|10)\b/i;

function extractScore(text) {
  const m = SCORE_RE.exec(String(text || ""));
  if (!m) return null;
  const score = Number(m[1] ?? m[3]);
  const max   = Number(m[2] ?? m[4]);
  if (!max || score > max) return null;
  return { score, max };
}

function ScoreWidget({ score, max }) {
  const pct = Math.min(Math.round((score / max) * 100), 100);
  const color = pct >= 75 ? "#4ade80" : pct >= 50 ? "#D4AF55" : "#f87171";
  return (
    <div className="roxanne-score-widget">
      <div className="roxanne-score-header">
        <span className="roxanne-score-label">Match Score</span>
        <span className="roxanne-score-value" style={{ color }}>
          {score}<span>/{max}</span>
        </span>
      </div>
      <div className="roxanne-score-track">
        <div
          className="roxanne-score-fill"
          style={{ width: pct + "%", background: color }}
        ></div>
      </div>
    </div>
  );
}

/* ── Thinking bubble shown while AI is processing ── */
const THINKING_STEPS = [
  { bg: "DIGESTING",  label: "Digesting your request…" },
  { bg: "THINKING",   label: "Thinking it through…"    },
  { bg: "CRAFTING",   label: "Crafting a reply…"        },
  { bg: "SCANNING",   label: "Scanning the context…"   },
  { bg: "ALMOST",     label: "Almost ready…"            }
];

function ThinkingBubble() {
  const [step, setStep] = React.useState(0);
  const [fading, setFading] = React.useState(false);

  React.useEffect(() => {
    const id = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setStep((s) => (s + 1) % THINKING_STEPS.length);
        setFading(false);
      }, 260);
    }, 1700);
    return () => clearInterval(id);
  }, []);

  const current = THINKING_STEPS[step];

  return (
    <div className="ai-msg bot roxanne-thinking-msg">
      <div className="roxanne-typing-dots">
        <span></span><span></span><span></span>
      </div>
      <div className={"roxanne-thinking-phrase" + (fading ? " is-fading" : " is-visible")}>
        {current.label}
      </div>
    </div>
  );
}

function RoxanneImageResult({ src, onReady }) {
  const [loaded, setLoaded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [src]);

  return (
    <div className={"roxanne-img-result" + (loaded ? " is-loaded" : " is-loading")}>
      <div className="roxanne-img-frame">
        {!loaded && !failed && (
          <div className="roxanne-img-rendering" aria-live="polite">
            <span className="roxanne-img-loader" aria-hidden="true"></span>
            <span>Rendering image...</span>
          </div>
        )}
        {failed ? (
          <div className="roxanne-img-error">Image could not be rendered.</div>
        ) : (
          <img
            src={src}
            alt="Generated image"
            className={"roxanne-img-preview" + (loaded ? " is-loaded" : " is-loading")}
            onLoad={() => {
              setLoaded(true);
              onReady?.();
            }}
            onError={() => setFailed(true)}
          />
        )}
      </div>
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="roxanne-img-open"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
          <polyline points="15 3 21 3 21 9"></polyline>
          <line x1="10" y1="14" x2="21" y2="3"></line>
        </svg>
        Open full size
      </a>
    </div>
  );
}

const WELCOME_MSG = {
  kind: "bot",
  text: "GlondiaAI is ready. Ask for a LinkedIn/Facebook post, attach a document for analysis, or describe what you need.",
  label: "GlondiaAI - ready",
  timestamp: Date.now()
};

function AIPanel({ open, onClose, role }) {
  const [messages, setMessages] = React.useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("roxanne-messages") || "null");
      if (Array.isArray(saved) && saved.length) {
        // Never re-stream saved messages
        return saved.map((m) => ({ ...m, isStreaming: false }));
      }
    } catch {}
    return [WELCOME_MSG];
  });
  const [input, setInput] = React.useState("");
  const [theme, setTheme] = React.useState("dark");
  const [sending, setSending] = React.useState(false);
  const [actionBusy, setActionBusy] = React.useState("");
  const [attachedFile, setAttachedFile] = React.useState(null);
  const [showCatalog, setShowCatalog] = React.useState(false);
  const [copiedIdx, setCopiedIdx] = React.useState(null);
  const [reactions, setReactions] = React.useState({});
  const [dragging, setDragging] = React.useState(false);
  const [showScrollBtn, setShowScrollBtn] = React.useState(false);
  const [isListening, setIsListening] = React.useState(false);
  const fileInputRef = React.useRef(null);
  const bodyRef = React.useRef(null);
  const recognitionRef = React.useRef(null);

  /* Persist messages to localStorage */
  React.useEffect(() => {
    try { localStorage.setItem("roxanne-messages", JSON.stringify(messages)); } catch {}
  }, [messages]);

  /* Auto-scroll to bottom whenever messages change or thinking starts */
  React.useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  /* Show/hide scroll-to-bottom button */
  React.useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const onScroll = () => setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 80);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  /* ── Drag & drop ── */
  function handleDragOver(e) { e.preventDefault(); setDragging(true); }
  function handleDragLeave(e) { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }
  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setAttachedFile(file);
  }

  /* ── Voice input ── */
  function startVoiceInput() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setMessages((prev) => [...prev, { kind: "bot", text: "Voice input isn't supported in this browser. Try Chrome or Edge.", label: "GlondiaAI - info", isStreaming: true, timestamp: Date.now() }]);
      return;
    }
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";
    recognitionRef.current = rec;
    rec.onresult = (e) => setInput(Array.from(e.results).map((r) => r[0].transcript).join(""));
    rec.onend = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);
    rec.start();
    setIsListening(true);
  }

  /* ── Export conversation ── */
  function exportConversation() {
    const lines = messages.map((m) => {
      const who  = m.kind === "user" ? "You" : "GlondiaAI";
      const time = m.timestamp ? ` [${new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}]` : "";
      return `${who}${time}:\n${m.text}\n`;
    }).join("\n---\n\n");
    const blob = new Blob([lines], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `roxanne-chat-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── Clear history ── */
  function clearHistory() {
    try { localStorage.removeItem("roxanne-messages"); } catch {}
    setMessages([{ ...WELCOME_MSG, timestamp: Date.now() }]);
    setReactions({});
  }

  /* ── Reactions ── */
  function handleReaction(idx, type) {
    setReactions((prev) => ({ ...prev, [idx]: prev[idx] === type ? null : type }));
  }

  /* ── Scroll to bottom ── */
  function scrollToBottom() {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }

  function copyMessage(text, idx) {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(String(text || "")).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx((prev) => prev === idx ? null : prev), 1600);
    });
  }

  function buildAction(response) {
    return null;
  }

  function appendBot(response, labelSuffix = "") {
    setMessages((prev) => [...prev, {
      kind: "bot",
      text: formatRoxanneResult(response),
      label: `GlondiaAI - ${labelSuffix || response.parserMode || "parsed"}`,
      action: buildAction(response),
      isStreaming: !response?.imageUrl,
      imageUrl: response?.imageUrl || null,
      timestamp: Date.now()
    }]);
  }

  async function runMcpPrompt(payload) {
    setSending(true);
    try {
      return {
        ok: false,
        parserMode: "disabled",
        message: "MCP Tool access has moved to the CRM workspace. Open CRM and use the MCP Tool button there."
      };
    } finally {
      setSending(false);
    }
  }

  async function send(text, options = {}) {
    const prompt = String(text || input || "").trim();
    if (!prompt || sending) return;

    const fileToSend = attachedFile;

    if (!options.silentUserMessage) {
      setMessages((prev) => [...prev, {
        kind: "user",
        text: fileToSend ? `${prompt}\n📎 ${fileToSend.name}` : prompt,
        timestamp: Date.now()
      }]);
    }
    if (!options.keepInput) setInput("");
    if (fileToSend) setAttachedFile(null);

    let filePayload = null;
    if (fileToSend) {
      try {
        filePayload = await readFileForRoxanne(fileToSend);
      } catch {
        /* continue without file */
      }
    }

    try {
      const response = await runMcpPrompt({
        message: prompt,
        confirmed: Boolean(options.confirmed),
        ...(filePayload ? { file: filePayload } : {})
      });
      appendBot(response);
    } catch (error) {
      setMessages((prev) => [...prev, {
        kind: "bot",
        text: error.message || "GlondiaAI could not run this request.",
        label: "GlondiaAI - error",
        isStreaming: true
      }]);
    }
  }

  async function confirmPost(message) {
    if (!message?.action?.request || actionBusy) return;
    setActionBusy("confirm");
    setMessages((prev) => [...prev, { kind: "user", text: "Confirm post", timestamp: Date.now() }]);
    try {
      appendBot({ ok: false, parserMode: "disabled", message: "MCP Tool actions now run from CRM only." }, "disabled");
    } catch (error) {
      setMessages((prev) => [...prev, {
        kind: "bot",
        text: error.message || "GlondiaAI could not confirm this post.",
        label: "GlondiaAI - error",
        isStreaming: true
      }]);
    } finally {
      setActionBusy("");
    }
  }

  async function retryAfterReconnect(retryRequest) {
    if (!retryRequest) return;
    setSending(true);
    try {
      appendBot({ ok: false, parserMode: "disabled", message: "MCP Tool retry actions now run from CRM only." }, "disabled");
    } catch (error) {
      setMessages((prev) => [...prev, {
        kind: "bot",
        text: error.message || "Auto-retry failed. Please try posting again.",
        label: "GlondiaAI - error",
        isStreaming: true
      }]);
    } finally {
      setSending(false);
    }
  }

  function cancelAction() {
    setMessages((prev) => [...prev, {
      kind: "bot",
      text: "Cancelled. Nothing was posted.",
      label: "GlondiaAI - cancelled",
      isStreaming: true
    }]);
  }

  async function reconnectProvider(provider, knownAuthUrl, retryRequest) {
    const safeProvider = String(provider || "").trim().toLowerCase();
    if (!safeProvider) {
      setMessages((prev) => [...prev, {
        kind: "bot",
        text: "Could not determine which platform to reconnect. Please try your post again.",
        label: "GlondiaAI - reconnect error",
        isStreaming: true, timestamp: Date.now()
      }]);
      return;
    }
    setMessages((prev) => [...prev, {
      kind: "bot",
      text: `${safeProvider} reconnect now runs from the CRM MCP Tool panel.`,
      label: "GlondiaAI - MCP Tool moved",
      isStreaming: true, timestamp: Date.now()
    }]);
    return;

    // Always request a fresh OAuth start from the MCP server via the dashboard
    // proxy — never redirect users directly to the MCP server.
    let authUrl = "";

    try {
      const oauthResponse = { authUrl: "" };
      authUrl = oauthResponse.authUrl || knownAuthUrl || "";

      const width = 720;
      const height = 780;
      const left = Math.max(0, Math.round((window.screen.width - width) / 2));
      const top = Math.max(0, Math.round((window.screen.height - height) / 2));
      const popup = window.open(
        authUrl,
        `roxanne-ai-${safeProvider}`,
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );

      if (!popup) {
        setMessages((prev) => [...prev, {
          kind: "bot",
          text: `Popup was blocked. Open this link to connect ${safeProvider}: ${authUrl}`,
          label: `GlondiaAI - ${safeProvider} connect`,
          isStreaming: true, timestamp: Date.now()
        }]);
        setActionBusy("");
        return;
      }

      setMessages((prev) => [...prev, {
        kind: "bot",
        text: `${safeProvider} login window is open. Complete the login - your post will retry automatically once connected.`,
        label: `GlondiaAI - ${safeProvider} connecting`,
        isStreaming: true, timestamp: Date.now()
      }]);

      setActionBusy("");

      const pollTimer = setInterval(() => {
        if (!popup.closed) return;
        clearInterval(pollTimer);
        setMessages((prev) => [...prev, {
          kind: "bot",
          text: `${safeProvider} window closed. Retrying your post...`,
          label: `GlondiaAI - retrying`,
          isStreaming: true, timestamp: Date.now()
        }]);
        retryAfterReconnect(retryRequest);
      }, 600);

    } catch (error) {
      setMessages((prev) => [...prev, {
        kind: "bot",
        text: error.message || `Unable to start ${safeProvider} reconnection.`,
        label: "GlondiaAI - reconnect error",
        isStreaming: true, timestamp: Date.now()
      }]);
      setActionBusy("");
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    send();
  }

  function handleTextareaKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  }

  function handleFileChange(event) {
    const file = event.target.files && event.target.files[0];
    if (file) setAttachedFile(file);
    event.target.value = "";
  }

  if (!open) {
    return (
      <button className="ai-fab" onClick={() => onClose(false)} title="GlondiaAI">
        <span className="pulse"></span>
        <img src={ROXANNE_AI_LOGO} alt="" />
      </button>
    );
  }

  const inputLower = input.toLowerCase();

  return (
    <div
      className={"ai-panel roxanne-ai-panel roxanne-ai-panel--" + theme + (dragging ? " is-dragging" : "")}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragging && (
        <div className="roxanne-drop-overlay">
          <div className="roxanne-drop-label">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 8v8a5 5 0 1 0 10 0V6.5a3.5 3.5 0 1 0-7 0V15a2 2 0 0 0 4 0V8"></path>
            </svg>
            Drop file to attach
          </div>
        </div>
      )}

      <div className="ai-head roxanne-ai-head">
        <div className="ai-logo roxanne-ai-logo">
          <img src={ROXANNE_AI_LOGO} alt="" />
        </div>
        <div style={{ flex: 1 }}>
          <div className="title">GlondiaAI</div>
        </div>
        <button className="roxanne-head-btn" onClick={exportConversation} title="Export conversation">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
        </button>
        <button className="roxanne-head-btn" onClick={clearHistory} title="Clear chat history">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
            <path d="M10 11v6M14 11v6"></path>
          </svg>
        </button>
        <button className="icon-btn" onClick={onClose} style={{ color: "var(--paper)" }}>×</button>
      </div>

      <div className="ai-body" ref={bodyRef} style={{ position: "relative" }}>
        {messages.map((message, index) => {
          const badge = message.kind === "bot" ? getMessageBadge(message.label || "") : null;
          const scoreData = message.kind === "bot" ? extractScore(message.text) : null;
          return (
          <div key={index} className={"ai-msg " + message.kind}>
            {message.label && (
              <div className="label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {message.label}
                {badge && (
                  <span className={"roxanne-msg-badge " + badge.cls}>{badge.label}</span>
                )}
              </div>
            )}
            {message.kind === "bot" && (
              <button
                type="button"
                className={"roxanne-msg-copy-btn" + (copiedIdx === index ? " is-copied" : "")}
                onClick={() => copyMessage(message.text, index)}
                title="Copy message"
                aria-label="Copy message"
              >
                {copiedIdx === index ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                )}
              </button>
            )}
            {message.kind === "bot"
              ? message.isStreaming
                ? <StreamingMessage fullText={message.text} scrollRef={bodyRef} />
                : <MarkdownMessage text={message.text} />
              : <div className="ai-msg__text">{message.text}</div>
            }
            {message.imageUrl && (
              <RoxanneImageResult
                src={message.imageUrl}
                onReady={() => {
                  if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
                }}
              />
            )}
            {scoreData && (
              <ScoreWidget score={scoreData.score} max={scoreData.max} />
            )}
            {message.kind === "bot" && !message.isStreaming && (
              <div className="roxanne-msg-footer">
                {message.timestamp && (
                  <span className="roxanne-msg-time">{formatMessageTime(message.timestamp)}</span>
                )}
                <div className="roxanne-reactions">
                  <button
                    type="button"
                    className={"roxanne-reaction-btn" + (reactions[index] === "up" ? " is-active is-up" : "")}
                    onClick={() => handleReaction(index, "up")}
                    title="Helpful"
                  >
                    <i className="fa-regular fa-thumbs-up"></i>
                  </button>
                  <button
                    type="button"
                    className={"roxanne-reaction-btn" + (reactions[index] === "down" ? " is-active is-down" : "")}
                    onClick={() => handleReaction(index, "down")}
                    title="Not helpful"
                  >
                    <i className="fa-regular fa-thumbs-down"></i>
                  </button>
                </div>
              </div>
            )}
            {message.kind === "user" && message.timestamp && (
              <div className="roxanne-msg-footer">
                <span className="roxanne-msg-time">{formatMessageTime(message.timestamp)}</span>
              </div>
            )}
            {message.action?.type === "confirm-post" && (
              <div className="roxanne-action-row">
                <button
                  type="button"
                  className="roxanne-action-btn is-primary"
                  onClick={() => confirmPost(message)}
                  disabled={Boolean(actionBusy) || sending}
                >
                  {actionBusy === "confirm" ? "Posting..." : "Confirm Post"}
                </button>
                <button
                  type="button"
                  className="roxanne-action-btn"
                  onClick={cancelAction}
                  disabled={Boolean(actionBusy) || sending}
                >
                  Cancel
                </button>
              </div>
            )}
            {message.action?.type === "reauth" && (
              <div className="roxanne-action-row">
                <button
                  type="button"
                  className="roxanne-action-btn is-primary"
                  onClick={() => reconnectProvider(message.action.provider, message.action.authUrl, message.action.retryRequest)}
                  disabled={Boolean(actionBusy) || sending}
                >
                  {actionBusy.startsWith("reauth") ? "Opening..." : `Reconnect ${message.action.provider}`}
                </button>
              </div>
            )}
          </div>
          );
        })}
        {sending && <ThinkingBubble />}
        {showScrollBtn && (
          <button className="roxanne-scroll-btn" onClick={scrollToBottom} title="Scroll to latest">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
            New reply
          </button>
        )}
      </div>

      {showCatalog && (
        <div className="roxanne-catalog-panel">
          <div className="roxanne-catalog-head">
            <span>Database Capabilities</span>
            <button type="button" className="icon-btn" onClick={() => setShowCatalog(false)} style={{ color: "var(--paper)", fontSize: "14px" }}>×</button>
          </div>
          <ul className="roxanne-catalog-list">
            {CATALOG_ITEMS.map((item) => (
              <li key={item.label}>
                <span className="roxanne-catalog-icon">{item.icon}</span>
                <span><strong>{item.label}</strong> — {item.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form className={"container_chat_bot roxanne-chat-input " + (theme === "light" ? "is-light" : "")} onSubmit={handleSubmit}>
        {attachedFile && (
          <div className="roxanne-attached-file">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 8v8a5 5 0 1 0 10 0V6.5a3.5 3.5 0 1 0-7 0V15a2 2 0 0 0 4 0V8"></path>
            </svg>
            <span>{attachedFile.name}</span>
            <button type="button" onClick={() => setAttachedFile(null)} title="Remove attachment">×</button>
          </div>
        )}
        <div className="container-chat-options">
          <div className="chat">
            <div className="chat-bot">
              <textarea
                id="roxanne_ai_prompt"
                name="roxanne_ai_prompt"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleTextareaKeyDown}
                placeholder="Ask GlondiaAI to post, analyse, or compare..."
              ></textarea>
            </div>
            <div className="options">
              <div className="btns-add">
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                  accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                />
                {/* Attach */}
                <button
                  type="button"
                  title="Attach file"
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                  className={attachedFile ? "roxanne-tool-btn is-active" : "roxanne-tool-btn"}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                    <path d="M7 8v8a5 5 0 1 0 10 0V6.5a3.5 3.5 0 1 0-7 0V15a2 2 0 0 0 4 0V8"></path>
                  </svg>
                </button>
                {/* Voice input */}
                <button
                  type="button"
                  title={isListening ? "Stop listening" : "Voice input"}
                  className={"roxanne-tool-btn" + (isListening ? " is-active roxanne-mic-active" : "")}
                  onClick={startVoiceInput}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                  </svg>
                </button>
                {/* Convert PDF */}
                <button
                  type="button"
                  title="Convert PDF to text"
                  className={"roxanne-tool-btn" + (inputLower.includes("pdf") || inputLower.includes("convert") ? " is-glow" : "")}
                  onClick={() => setInput("Convert the attached document to plain text and summarise key points.")}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                </button>
                {/* Analyse Applicant */}
                <button
                  type="button"
                  title="Analyse applicant"
                  className={"roxanne-tool-btn" + (inputLower.includes("analys") ? " is-glow" : "")}
                  onClick={() => setInput("Analyse the attached applicant profile. Score their suitability against the position requirements and provide a structured assessment.")}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    <line x1="11" y1="8" x2="11" y2="14"></line>
                    <line x1="8" y1="11" x2="14" y2="11"></line>
                  </svg>
                </button>
                {/* Compare */}
                <button
                  type="button"
                  title="Compare candidates"
                  className={"roxanne-tool-btn" + (inputLower.includes("compar") ? " is-glow" : "")}
                  onClick={() => setInput("Compare the attached candidate profiles. Rank them by suitability and explain the differences.")}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10"></line>
                    <line x1="12" y1="20" x2="12" y2="4"></line>
                    <line x1="6" y1="20" x2="6" y2="14"></line>
                  </svg>
                </button>
                {/* Theme toggle */}
                <button
                  type="button"
                  onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
                  title={theme === "dark" ? "Light mode" : "Dark mode"}
                  className="roxanne-tool-btn"
                >
                  <svg viewBox="0 0 24 24" height="18" width="18" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 3v2m0 14v2M5.64 5.64l1.41 1.41m9.9 9.9 1.41 1.41M3 12h2m14 0h2M5.64 18.36l1.41-1.41m9.9-9.9 1.41-1.41M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                  </svg>
                </button>
              </div>
              <button className="btn-submit" type="submit" disabled={sending} title="Send to GlondiaAI">
                <i>
                  <svg viewBox="0 0 512 512">
                    <path fill="currentColor" d="M473 39.05a24 24 0 0 0-25.5-5.46L47.47 185h-.08a24 24 0 0 0 1 45.16l.41.13l137.3 58.63a16 16 0 0 0 15.54-3.59L422 80a7.07 7.07 0 0 1 10 10L226.66 310.26a16 16 0 0 0-3.59 15.54l58.65 137.38c.06.2.12.38.19.57c3.2 9.27 11.3 15.81 21.09 16.25h1a24.63 24.63 0 0 0 23-15.46L478.39 64.62A24 24 0 0 0 473 39.05"></path>
                  </svg>
                </i>
              </button>
            </div>
          </div>
        </div>
        <div className="tags">
          {/* LinkedIn */}
          <span
            title="Post to LinkedIn"
            onClick={() => send("Post to LinkedIn: Glondiasites is supporting employers with workforce hiring needs this week.")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
          </span>
          {/* Facebook */}
          <span
            title="Post to Facebook"
            onClick={() => send("Post to Facebook: Glondiasites can help advertise vacancies and source qualified candidates.")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
          </span>
          {/* Email */}
          <span
            title="Draft an email"
            onClick={() => setInput("Draft a professional recruitment email: ")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
              <polyline points="22,6 12,13 2,6"></polyline>
            </svg>
          </span>
          {/* Catalog / DB capabilities */}
          <span
            title="Database capabilities"
            onClick={() => setShowCatalog((v) => !v)}
            className={showCatalog ? "roxanne-tag-active" : ""}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
            </svg>
          </span>
        </div>
      </form>
    </div>
  );
}

window.AIPanel = AIPanel;
