/**
 * crmAiOrchestrator.js
 *
 * Drives the CRM AI chat loop:
 *   1. Sends user message to OpenAI with MCP tools defined as functions.
 *   2. If OpenAI calls a tool → return confirmation request to the frontend.
 *   3. On confirmed → execute the MCP tool, return result.
 *   4. If OpenAI just replies with text → return that directly.
 *
 * Conversation history is stored in-memory keyed by conversationUid.
 * No npm packages — pure Node.js fetch.
 */

const crypto     = require('crypto');
const { listTools, getTool } = require('../crm-tools/crmToolRegistry');
const facebook   = require('../social/facebookService');
const linkedin   = require('../social/linkedInService');

const OPENAI_KEY   = () => process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = () => process.env.CHATBOT_MODEL  || 'gpt-4.1-mini';
const OPENAI_URL   = 'https://api.openai.com/v1/chat/completions';

// ── In-memory stores ──────────────────────────────────────────────────────────
const conversations = new Map(); // uid → { uid, mode, model, title, messages[], createdAt, archivedAt }
const pendingConfirmations = new Map(); // token → { tool, params, conversationUid, expiresAt }

function getOrCreateConversation(uid, { mode, model } = {}) {
  if (uid && conversations.has(uid)) return conversations.get(uid);
  const newUid = uid || crypto.randomUUID();
  const conv = {
    uid:        newUid,
    mode:       mode || 'marketing-copy',
    model:      model || 'default',
    title:      null,
    messages:   [],
    createdAt:  new Date().toISOString(),
    archivedAt: null,
  };
  conversations.set(newUid, conv);
  return conv;
}

function buildSystemPrompt(mode) {
  const base = `You are an expert CRM assistant for HEYA Talent Solutions, a staffing and recruitment company based in Papua New Guinea. You help the team craft compelling content, manage communications, and engage with clients and talent across social media and email.`;

  const modeInstructions = {
    'email-draft':     'Focus on drafting professional, warm emails for client or candidate communication.',
    'service-reply':   'Help compose clear, empathetic replies to client service requests.',
    'marketing-copy':  'Create engaging marketing copy for social media posts, campaigns, and announcements.',
    'image-prompt':    'Generate detailed, vivid image generation prompts suitable for professional marketing materials.',
    'video-prompt':    'Write concise, compelling video scripts or creative briefs for short-form social media videos.',
  };

  const modeGuide = modeInstructions[mode] || modeInstructions['marketing-copy'];

  return `${base}\n\n${modeGuide}\n\nWhen the user asks you to post to Facebook or LinkedIn, use the appropriate tool. When asked to send an email, use the send_email tool. Always confirm write actions with clear details before executing.`;
}

function buildOpenAiTools() {
  return listTools().map((tool) => ({
    type: 'function',
    function: {
      name:        tool.id,
      description: tool.description,
      parameters: {
        type:       'object',
        properties: tool.parameters,
        required:   Object.keys(tool.parameters),
      },
    },
  }));
}

async function callOpenAi(messages, tools) {
  const key = OPENAI_KEY();
  if (!key) throw new Error('OPENAI_API_KEY is not configured.');

  const body = {
    model:    OPENAI_MODEL(),
    messages,
    tools,
    tool_choice: 'auto',
    max_tokens: 1024,
  };

  const res  = await fetch(OPENAI_URL, {
    method:  'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `OpenAI error: HTTP ${res.status}`);
  return data.choices?.[0]?.message || null;
}

function storeConfirmation(tool, params, conversationUid) {
  const token = crypto.randomUUID();
  pendingConfirmations.set(token, {
    tool,
    params,
    conversationUid,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 min TTL
  });
  return token;
}

function consumeConfirmation(token) {
  const pending = pendingConfirmations.get(token);
  if (!pending) return null;
  if (Date.now() > pending.expiresAt) {
    pendingConfirmations.delete(token);
    return null;
  }
  pendingConfirmations.delete(token);
  return pending;
}

// ── Main entry points ─────────────────────────────────────────────────────────

async function runCrmAiChat({ message, history = [], mode, model, conversationUid }) {
  const conv = getOrCreateConversation(conversationUid, { mode, model });

  // Auto-title on first message
  if (!conv.title && message) {
    conv.title = message.slice(0, 80);
  }

  // Build full message list for OpenAI
  const systemMessage = { role: 'system', content: buildSystemPrompt(conv.mode) };
  const openAiHistory = (history.length ? history : conv.messages).map((m) => ({
    role:    m.role === 'ai' ? 'assistant' : m.role,
    content: m.content,
  }));

  conv.messages.push({ role: 'user', content: message, createdAt: new Date().toISOString() });

  const openAiMessages = [systemMessage, ...openAiHistory, { role: 'user', content: message }];
  const tools          = buildOpenAiTools();

  const aiMessage = await callOpenAi(openAiMessages, tools);

  // ── Tool call path ────────────────────────────────────────────────────────
  if (aiMessage.tool_calls?.length) {
    const call   = aiMessage.tool_calls[0]; // handle first tool call
    const toolId = call.function.name;
    const params = JSON.parse(call.function.arguments || '{}');
    const tool   = getTool(toolId);

    if (!tool) {
      return { ok: false, status: 400, content: `Unknown tool: ${toolId}`, type: 'error', conversationUid: conv.uid };
    }

    // Check connection requirement
    if (tool.requiresConnection) {
      const statusFn = toolId.startsWith('facebook') ? facebook.getStatus : linkedin.getStatus;
      const status   = statusFn();
      if (!status.connected) {
        const provider   = tool.provider;
        const authUrl    = toolId.startsWith('facebook') ? facebook.getAuthUrl('reconnect') : linkedin.getAuthUrl('reconnect');
        const assistantContent = `To post to ${tool.name}, you need to connect your ${provider} account first.`;
        conv.messages.push({ role: 'ai', content: assistantContent, type: 'auth_required', provider, authUrl, createdAt: new Date().toISOString() });
        return {
          ok:              true,
          content:         assistantContent,
          type:            'auth_required',
          provider,
          authUrl,
          conversationUid: conv.uid,
        };
      }
    }

    // Build a human-readable confirmation message
    const toolLabel   = tool.name;
    const detail      = params.content || params.body || JSON.stringify(params);
    const confirmText = aiMessage.content || `Ready to ${toolLabel.toLowerCase()}. Please confirm:`;
    const token       = storeConfirmation(toolId, params, conv.uid);

    conv.messages.push({ role: 'ai', content: confirmText, type: 'confirmation', action: toolId, confirmationToken: token, createdAt: new Date().toISOString() });

    return {
      ok:                true,
      content:           confirmText,
      type:              'confirmation',
      label:             toolLabel,
      detail,
      action:            toolId,
      confirmationToken: token,
      conversationUid:   conv.uid,
    };
  }

  // ── Plain text path ───────────────────────────────────────────────────────
  const content = aiMessage.content || '';
  conv.messages.push({ role: 'ai', content, type: 'text', createdAt: new Date().toISOString() });

  return {
    ok:              true,
    content,
    type:            'text',
    conversationUid: conv.uid,
  };
}

async function confirmCrmAiAction({ confirmationToken, confirmed, conversationUid }) {
  const pending = consumeConfirmation(confirmationToken);
  if (!pending) {
    return { ok: false, status: 400, content: 'Confirmation token is invalid or has expired.', type: 'error' };
  }

  const conv = conversations.get(pending.conversationUid || conversationUid);

  if (!confirmed) {
    const cancelText = 'Action cancelled.';
    if (conv) conv.messages.push({ role: 'ai', content: cancelText, type: 'cancelled', createdAt: new Date().toISOString() });
    return { ok: true, content: cancelText, type: 'cancelled', conversationUid: pending.conversationUid };
  }

  // Execute the tool
  const tool = getTool(pending.tool);
  if (!tool) {
    return { ok: false, status: 400, content: `Tool not found: ${pending.tool}`, type: 'error' };
  }

  try {
    const result  = await tool.execute(pending.params);
    const content = buildSuccessMessage(pending.tool, result);
    if (conv) conv.messages.push({ role: 'ai', content, type: 'tool_result', createdAt: new Date().toISOString() });
    return { ok: true, content, type: 'tool_result', result, conversationUid: pending.conversationUid };
  } catch (err) {
    const content = `Action failed: ${err.message}`;
    if (conv) conv.messages.push({ role: 'ai', content, type: 'error', createdAt: new Date().toISOString() });
    const needsReauth = err.code === 'NOT_CONNECTED';
    return { ok: false, status: 400, content, type: 'error', requiresReAuth: needsReauth, conversationUid: pending.conversationUid };
  }
}

function buildSuccessMessage(toolId, result) {
  if (toolId === 'facebook_post') return `Posted to Facebook Page "${result.pageName}" successfully.`;
  if (toolId === 'linkedin_post') return `Posted to LinkedIn as "${result.name}" successfully.`;
  if (toolId === 'send_email')    return `Email sent to ${result.to} with subject "${result.subject}".`;
  return 'Action completed successfully.';
}

// ── Conversation management ───────────────────────────────────────────────────

function listConversations({ limit = 25, archived = false } = {}) {
  return Array.from(conversations.values())
    .filter((c) => archived ? Boolean(c.archivedAt) : !c.archivedAt)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit)
    .map(({ uid, title, mode, model, createdAt, archivedAt, messages }) => ({
      uid, title, mode, model, createdAt, archivedAt,
      messageCount: messages.length,
    }));
}

function getConversation(uid) {
  return conversations.get(uid) || null;
}

function createConversation({ mode, model, title } = {}) {
  const conv = getOrCreateConversation(null, { mode, model });
  if (title) conv.title = title;
  return conv;
}

function archiveConversation(uid) {
  const conv = conversations.get(uid);
  if (!conv) return null;
  conv.archivedAt = new Date().toISOString();
  return conv;
}

module.exports = {
  runCrmAiChat,
  confirmCrmAiAction,
  listConversations,
  getConversation,
  createConversation,
  archiveConversation,
};
