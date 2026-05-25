const TOKEN_STORAGE_KEY = "glondia.accessToken";
const ORGANIZATION_STORAGE_KEY = "glondia.organizationId";
const USER_STORAGE_KEY = "glondia.user";

export const AUTH_CHANGED_EVENT = "glondia:auth-changed";

export function getStoredAuth() {
  const userJson = window.localStorage.getItem(USER_STORAGE_KEY);
  return {
    accessToken: window.localStorage.getItem(TOKEN_STORAGE_KEY),
    organizationId: window.localStorage.getItem(ORGANIZATION_STORAGE_KEY),
    user: userJson ? safeParseJson(userJson) : null,
  };
}

export function storeAuthSession(session) {
  if (session?.tokens?.accessToken) window.localStorage.setItem(TOKEN_STORAGE_KEY, session.tokens.accessToken);
  if (session?.organization?.id) window.localStorage.setItem(ORGANIZATION_STORAGE_KEY, session.organization.id);
  if (session?.user) window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(session.user));
  window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
}

export function clearAuthSession() {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(ORGANIZATION_STORAGE_KEY);
  window.localStorage.removeItem(USER_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
}

export async function login(email, password) {
  const session = makeSession({ email });
  storeAuthSession(session);
  return session;
}

export async function register({ name, email, password, organizationName }) {
  const session = makeSession({ name, email, organizationName });
  storeAuthSession(session);
  return session;
}

export function makeSession(input = {}) {
  const user = {
    id: 'local-user',
    name: input.name || input.email?.split('@')[0] || 'Glondia User',
    email: input.email || 'local@glondia.app',
  };
  return {
    user,
    organization: { id: 'local-org', name: input.organizationName || 'Local Workspace', slug: 'local-workspace' },
    membership: { id: 'local-member', roleId: 'owner' },
    session: { id: 'local-session', expiresAt: new Date(Date.now() + 86400000).toISOString() },
    tokens: { accessToken: 'local-demo-token', refreshToken: 'local-refresh-token', tokenType: 'Bearer' },
  };
}

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
