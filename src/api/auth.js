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

/**
 * Merge a patch into the stored auth user and notify listeners. Lets pages
 * (e.g. ProfilePage) reflect saved name/phone/avatar in the topbar immediately
 * without a full re-login. No-op when there is no stored user.
 */
export function updateStoredAuthUser(patch = {}) {
  const current = getStoredAuth().user;
  if (!current) return null;
  const merged = { ...current, ...patch };
  window.localStorage.setItem(USER_KEY, JSON.stringify(merged));
  window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
  return merged;
}

// ─── Auth API calls ───────────────────────────────────────────────────────────

export async function login(email, password) {
  if (!isLiveMode()) {
    const session = makeSession({ email });
    storeAuthSession(session);
    return session;
  }
  const session = await authPost('/v1/auth/login', { email, password });
  storeAuthSession(session);
  return session;
}

export async function register({ name, email, password, organizationName }) {
  if (!isLiveMode()) {
    const session = makeSession({ name, email, organizationName });
    storeAuthSession(session);
    return session;
  }
  const session = await authPost('/v1/auth/register', { name, email, password });
  storeAuthSession(session);
  return session;
}

export async function refreshAccessToken() {
  const { refreshToken } = getStoredAuth();
  if (!refreshToken) throw new Error('No refresh token stored.');
  const data = await authPost('/v1/auth/refresh-token', { refreshToken });
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

// ─── Social auth ──────────────────────────────────────────────────────────────

export function socialAuthUrl(provider) {
  const base = liveApiBase();
  if (provider === 'github') return `${base}/v1/auth/github`;
  if (provider === 'google') return `${base}/v1/auth/google`;
  return null;
}

export const SOCIAL_PROVIDERS = [
  { id: 'google', label: 'Continue with Google', icon: 'Google' },
  { id: 'github', label: 'Continue with GitHub', icon: 'Github' },
];

// ─── Auth header helper (used by API clients) ─────────────────────────────────

export function authHeaders() {
  const { accessToken } = getStoredAuth();
  if (!accessToken) return {};
  return { Authorization: `Bearer ${accessToken}` };
}

export async function authFetch(input, options = {}) {
  const response = await fetch(input, withFreshAuthHeaders(options));
  if (response.status !== 401) return response;

  const { refreshToken } = getStoredAuth();
  if (!refreshToken) {
    clearAuthSession();
    return response;
  }

  try {
    await refreshAccessToken();
  } catch {
    clearAuthSession();
    return response;
  }

  const retry = await fetch(input, withFreshAuthHeaders(options));
  if (retry.status === 401) clearAuthSession();
  return retry;
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
  const base = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
  return base || '/api';
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

function withFreshAuthHeaders(options = {}) {
  return {
    ...options,
    headers: {
      ...plainHeaders(options.headers),
      ...authHeaders(),
    },
  };
}

function plainHeaders(headers) {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  return { ...headers };
}
