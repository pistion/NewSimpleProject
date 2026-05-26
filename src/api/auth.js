import { isLiveMode } from '../app/config.js';

const TOKEN_KEY     = 'glondia.accessToken';
const REFRESH_KEY   = 'glondia.refreshToken';
const SESSION_KEY   = 'glondia.sessionId';
const ORG_KEY       = 'glondia.organizationId';
const USER_KEY      = 'glondia.user';

export const AUTH_CHANGED_EVENT = 'glondia:auth-changed';

// ─── Storage helpers ──────────────────────────────────────────────────────────

export function getStoredAuth() {
  const userJson = window.localStorage.getItem(USER_KEY);
  return {
    accessToken:    window.localStorage.getItem(TOKEN_KEY),
    refreshToken:   window.localStorage.getItem(REFRESH_KEY),
    sessionId:      window.localStorage.getItem(SESSION_KEY),
    organizationId: window.localStorage.getItem(ORG_KEY),
    user: userJson ? safeParseJson(userJson) : null,
  };
}

export function isAuthenticated() {
  return Boolean(window.localStorage.getItem(TOKEN_KEY));
}

export function storeAuthSession(session) {
  if (session?.tokens?.accessToken)  window.localStorage.setItem(TOKEN_KEY, session.tokens.accessToken);
  if (session?.tokens?.refreshToken) window.localStorage.setItem(REFRESH_KEY, session.tokens.refreshToken);
  if (session?.session?.id)          window.localStorage.setItem(SESSION_KEY, session.session.id);
  if (session?.organization?.id)     window.localStorage.setItem(ORG_KEY, session.organization.id);
  if (session?.user)                 window.localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
}

export function clearAuthSession() {
  [TOKEN_KEY, REFRESH_KEY, SESSION_KEY, ORG_KEY, USER_KEY].forEach(k => window.localStorage.removeItem(k));
  window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
}

// ─── Auth API calls ───────────────────────────────────────────────────────────

export async function login(email, password) {
  if (isLiveMode()) {
    const data = await authPost('/v1/auth/login', { email, password });
    storeAuthSession(data);
    return data;
  }
  const session = makeSession({ email });
  storeAuthSession(session);
  return session;
}

export async function register({ name, email, password, organizationName }) {
  if (isLiveMode()) {
    const data = await authPost('/v1/auth/register', { name, email, password, organizationName });
    storeAuthSession(data);
    return data;
  }
  const session = makeSession({ name, email, organizationName });
  storeAuthSession(session);
  return session;
}

export async function refreshAccessToken() {
  const { refreshToken, sessionId } = getStoredAuth();
  if (!refreshToken) throw new Error('No refresh token stored.');
  const data = await authPost('/v1/auth/refresh', { refreshToken, sessionId });
  storeAuthSession(data);
  return data;
}

export async function logout() {
  try {
    const { refreshToken, sessionId } = getStoredAuth();
    if (isLiveMode() && refreshToken) {
      await authPost('/v1/auth/logout', { refreshToken, sessionId });
    }
  } finally {
    clearAuthSession();
  }
}

export async function getMe() {
  const { accessToken } = getStoredAuth();
  if (!accessToken) return null;
  const base = liveApiBase();
  const res = await fetch(`${base}/v1/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (res.status === 401) {
    await refreshAccessToken();
    return getMe();
  }
  if (!res.ok) return null;
  const envelope = await res.json();
  return envelope?.data ?? envelope;
}

// ─── Social auth placeholders ─────────────────────────────────────────────────

export function socialAuthUrl(provider) {
  // Placeholder — SDKs not installed yet. Backend routes will be wired when
  // GITHUB_CLIENT_ID / GOOGLE_CLIENT_ID are configured.
  return null;
}

export const SOCIAL_PROVIDERS = [
  { id: 'google', label: 'Continue with Google',  icon: 'Google'  },
  { id: 'github', label: 'Continue with GitHub',  icon: 'Github'  },
];

// ─── Auth header helper (used by API clients) ─────────────────────────────────

export function authHeaders() {
  const { accessToken } = getStoredAuth();
  if (!accessToken) return {};
  return { Authorization: `Bearer ${accessToken}` };
}

// ─── Demo session factory (kept for non-live mode) ────────────────────────────

export function makeSession(input = {}) {
  const user = {
    id:    'local-user',
    name:  input.name || input.email?.split('@')[0] || 'Glondia User',
    email: input.email || 'local@glondia.app',
  };
  return {
    user,
    organization: { id: 'local-org', name: input.organizationName || 'Local Workspace', slug: 'local-workspace' },
    membership:   { id: 'local-member', roleId: 'owner' },
    session:      { id: 'local-session', expiresAt: new Date(Date.now() + 86400_000).toISOString() },
    tokens: {
      accessToken:  'local-demo-token',
      refreshToken: 'local-refresh-token',
      tokenType:    'Bearer',
    },
  };
}

// ─── Internals ────────────────────────────────────────────────────────────────

function liveApiBase() {
  return String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '') || '';
}

async function authPost(path, body) {
  const base = liveApiBase();
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || json?.error?.message || `Auth request failed (${res.status}).`);
  }
  return json?.data ?? json;
}

function safeParseJson(value) {
  try { return JSON.parse(value); } catch { return null; }
}
