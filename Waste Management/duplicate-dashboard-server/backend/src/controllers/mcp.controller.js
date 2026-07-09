/**
 * mcp.controller.js
 *
 * Handles:
 *   GET   /api/admin/dashboard/settings  — return stored settings
 *   PATCH /api/admin/dashboard/settings  — update stored settings (client-safe fields only)
 *   POST  /api/admin/mcp/test            — ping Roxanne MCP health endpoint
 *   POST  /api/admin/mcp/disconnect      — clear connected state, wipe token flags, force re-OAuth
 *   POST  /api/admin/mcp/oauth/start     — proxy OAuth start to Roxanne MCP, return authUrl
 *
 * SECURITY RULES enforced here:
 *   1. The dashboard NEVER stores OAuth tokens. Tokens live exclusively on Roxanne MCP.
 *   2. `connected`, `apiKeyConfigured`, and `permissions` are server-controlled only —
 *      the client cannot set them via PATCH.
 *   3. Default permissions are 'read-only'. Write permissions must be explicitly granted
 *      server-side via env var (ROXANNE_MCP_PERMISSIONS=read-write).
 *   4. Before any social-media write operation (Facebook / LinkedIn post), the dashboard
 *      verifies live token validity with Roxanne MCP. If tokens are missing or revoked,
 *      the request is blocked with 401 — the connected flag is also cleared.
 *   5. If MCP is disconnected, startOauth re-initiates the full OAuth flow so a user
 *      can connect (or switch) their account without any residual token state.
 */

// ── In-memory settings store ──────────────────────────────────────────────────
// Survives the process lifetime only — never written to disk by this module.
// Seeded from env vars so the first boot works without any manual save.
let _settings = {
  mcp: {
    enabled: true,
    connected: false,
    endpoint: (process.env.ROXANNE_MCP_URL || '').replace(/\/+$/, ''),
    apiKey: process.env.ROXANNE_MCP_API_KEY || '',
    apiKeyConfigured: Boolean(process.env.ROXANNE_MCP_API_KEY),
    // Default is read-only. Set ROXANNE_MCP_PERMISSIONS=read-write in .env
    // only when Roxanne MCP has been explicitly granted write access by the user.
    permissions: process.env.ROXANNE_MCP_PERMISSIONS === 'read-write' ? 'read-write' : 'read-only',
    facebookAuthPath: '/facebook/auth',
    linkedinAuthPath: '/linkedin/auth',
    proxyPath: '/api/mcp/proxy',
  },
  profile: {
    displayName: '',
    email: '',
  },
  accountSettings: {},
};

// Fields the client is NEVER allowed to set via PATCH — server-controlled only.
const CLIENT_BLOCKED_MCP_FIELDS = new Set([
  'connected',
  'apiKeyConfigured',
  'permissions',
]);

function getMcpEndpoint() {
  return (_settings.mcp.endpoint || '').replace(/\/+$/, '');
}

function getMcpApiKey() {
  return _settings.mcp.apiKey || process.env.ROXANNE_MCP_API_KEY || '';
}

function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Strip server-controlled MCP fields from a client PATCH payload.
 * The client can update endpoint, apiKey, serverLabel, proxyPath, auth paths —
 * but never connected, apiKeyConfigured, or permissions.
 */
function sanitiseMcpPatch(mcpPatch) {
  if (!mcpPatch || typeof mcpPatch !== 'object') return mcpPatch;
  const safe = { ...mcpPatch };
  for (const blocked of CLIENT_BLOCKED_MCP_FIELDS) {
    delete safe[blocked];
  }
  return safe;
}

async function callMcp(path, { method = 'GET', body, apiKey } = {}) {
  const endpoint = getMcpEndpoint();
  if (!endpoint) {
    throw Object.assign(
      new Error('Roxanne MCP endpoint is not configured. Set ROXANNE_MCP_URL or save it in Settings → MCP.'),
      { status: 503 }
    );
  }

  const key = apiKey || getMcpApiKey();
  const url = `${endpoint}${path}`;

  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(key ? { 'x-api-key': key, 'Authorization': `Bearer ${key}` } : {}),
    },
  };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

/**
 * Verify that Roxanne MCP still holds valid OAuth tokens for a provider.
 * Called before any write operation (post to Facebook / LinkedIn).
 *
 * Returns { valid: true } if tokens exist and are not expired/revoked.
 * Returns { valid: false, reason } if tokens are missing, revoked, or MCP is unreachable.
 * Also clears _settings.mcp.connected if tokens are confirmed gone.
 */
async function verifyProviderTokens(provider) {
  try {
    const { ok, status, data } = await callMcp(`/${provider}/token-status`, { method: 'GET' });

    if (!ok) {
      // 401 / 403 → tokens definitely gone
      if (status === 401 || status === 403) {
        _settings.mcp.connected = false;
        return { valid: false, reason: `${provider} tokens have been revoked or removed on the MCP server.` };
      }
      return { valid: false, reason: `Roxanne MCP returned HTTP ${status} for ${provider} token check.` };
    }

    const hasTokens = Boolean(data?.hasToken || data?.tokenValid || data?.connected);
    if (!hasTokens) {
      _settings.mcp.connected = false;
      return { valid: false, reason: `Roxanne MCP reports no valid ${provider} session token.` };
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, reason: `Could not reach Roxanne MCP to verify ${provider} tokens: ${err.message}` };
  }
}

// ── Controller ────────────────────────────────────────────────────────────────

function createMcpController() {
  return {

    // GET /api/admin/dashboard/settings
    getSettings: async (_req) => {
      return {
        ok: true,
        ..._settings,
        mcp: {
          ..._settings.mcp,
          // Never expose the raw API key to the frontend — send only a configured flag
          apiKey: '',
          apiKeyConfigured: Boolean(_settings.mcp.apiKey || process.env.ROXANNE_MCP_API_KEY),
        },
      };
    },

    // PATCH /api/admin/dashboard/settings
    // Client may update: endpoint, apiKey, serverLabel, proxyPath, facebookAuthPath,
    //                    linkedinAuthPath, profile, accountSettings, preferences, plugins.
    // Client may NOT set: connected, apiKeyConfigured, permissions.
    updateSettings: async (req) => {
      const patch = req.body || {};

      // Sanitise the mcp portion — strip server-controlled fields
      if (patch.mcp) {
        patch.mcp = sanitiseMcpPatch(patch.mcp);
      }

      _settings = deepMerge(_settings, patch);

      // Normalise endpoint (strip trailing slash)
      if (_settings.mcp?.endpoint) {
        _settings.mcp.endpoint = _settings.mcp.endpoint.replace(/\/+$/, '');
      }

      // If a new apiKey was provided, mark it configured — but do NOT flip connected
      if (patch.mcp?.apiKey) {
        _settings.mcp.apiKeyConfigured = true;
        // A new key means the previous connection state is unknown — require re-test
        _settings.mcp.connected = false;
      }

      return {
        ok: true,
        ..._settings,
        mcp: {
          ..._settings.mcp,
          apiKey: '',
          apiKeyConfigured: Boolean(_settings.mcp.apiKey || process.env.ROXANNE_MCP_API_KEY),
        },
      };
    },

    // POST /api/admin/mcp/test
    testConnection: async (_req) => {
      const endpoint = getMcpEndpoint();
      if (!endpoint) {
        return {
          ok: false,
          message: 'MCP endpoint not configured. Add your Roxanne MCP URL in Settings → MCP Configurations.',
        };
      }
      try {
        const { ok, status, data } = await callMcp('/healthz');
        if (ok) {
          _settings.mcp.connected = true;
          return {
            ok: true,
            connected: true,
            message: data?.message || 'Roxanne MCP is reachable.',
            endpoint,
            data,
          };
        }
        _settings.mcp.connected = false;
        return {
          ok: false,
          connected: false,
          message: `Roxanne MCP returned HTTP ${status}. Check the endpoint URL and API key.`,
          endpoint,
          data,
        };
      } catch (err) {
        _settings.mcp.connected = false;
        return {
          ok: false,
          connected: false,
          message: `Could not reach Roxanne MCP at ${endpoint}: ${err.message}`,
          endpoint,
        };
      }
    },

    // POST /api/admin/mcp/disconnect
    // Clears the connected flag and any locally-held connection state.
    // Does NOT touch tokens on Roxanne MCP — those are owned by Roxanne.
    // After this, the next action must be startOauth to re-establish the connection.
    disconnectMcp: async (_req) => {
      _settings.mcp.connected = false;
      return {
        ok: true,
        message: 'MCP connection cleared. Use Connect MCP to re-authenticate.',
        connected: false,
      };
    },

    // POST /api/admin/mcp/oauth/start
    // Asks Roxanne MCP to start a fresh OAuth flow for the given provider.
    // Works regardless of current connected state — this IS the reconnect mechanism.
    // The dashboard never sees or stores any tokens from this flow.
    startOauth: async (req) => {
      const provider = String(req.body?.provider || 'facebook').toLowerCase();
      const endpoint = getMcpEndpoint();
      if (!endpoint) {
        return {
          ok: false,
          status: 503,
          message: 'Roxanne MCP endpoint is not configured. Set ROXANNE_MCP_URL or save it in Settings → MCP Configurations.',
        };
      }

      const providerPaths = {
        facebook:  '/facebook/auth',
        linkedin:  '/linkedin/auth',
        google:    '/auth/google',
        gmail:     '/auth/gmail',
        tiktok:    '/tiktok/auth',
        netlify:   '/netlify/auth',
        canva:     '/canva/auth',
      };

      const authPath = providerPaths[provider];
      if (!authPath) {
        return { ok: false, status: 400, message: `Unsupported provider: ${provider}` };
      }

      try {
        const { ok, status, data } = await callMcp(authPath, {
          method: 'POST',
          body: {
            provider,
            // Pass user/context from the request but never echo back tokens
            user:    req.body?.user    || null,
            context: req.body?.context || null,
            source:  req.body?.source  || 'heya-dashboard',
            // Never send 'read-write' permissions unless explicitly configured server-side
            permissions: _settings.mcp.permissions === 'read-write' ? 'read-write' : 'read-only',
          },
        });

        const authUrl = data?.authUrl || data?.oauthUrl || data?.authorizeUrl || data?.redirectUrl || null;

        if (!ok || !authUrl) {
          console.error(`[MCP OAuth Start] Roxanne MCP did not return an OAuth URL for ${provider}:`, JSON.stringify(data));
          return {
            ok: false,
            status: status || 502,
            message: data?.message || data?.error || `Roxanne MCP did not return an OAuth URL for ${provider}.`,
            raw: data,
          };
        }

        // Return only the auth URL — no tokens, no session data stored here
        return { ok: true, provider, authUrl };
      } catch (err) {
        console.error(`[MCP OAuth Start] Failed to reach Roxanne MCP for ${provider}:`, err.message);
        return {
          ok: false,
          status: 503,
          message: `Could not reach Roxanne MCP: ${err.message}`,
        };
      }
    },

    /**
     * POST /api/admin/mcp/social/post
     *
     * Gate for any social media post (Facebook / LinkedIn).
     * REQUIRES a live token check against Roxanne MCP before proceeding.
     * If Roxanne MCP has destroyed or revoked the session tokens, this
     * endpoint returns 401 and the post is blocked — no exceptions.
     */
    socialPost: async (req) => {
      const provider = String(req.body?.provider || '').toLowerCase();

      if (!['facebook', 'linkedin'].includes(provider)) {
        return { ok: false, status: 400, message: 'Provider must be facebook or linkedin.' };
      }

      // Hard gate — verify live tokens before any write action
      const tokenCheck = await verifyProviderTokens(provider);
      if (!tokenCheck.valid) {
        return {
          ok: false,
          status: 401,
          message: `Blocked: ${tokenCheck.reason} Re-authenticate via Settings → MCP Configurations.`,
          requiresReAuth: true,
        };
      }

      // Permissions gate — only proceed if read-write was explicitly configured
      if (_settings.mcp.permissions !== 'read-write') {
        return {
          ok: false,
          status: 403,
          message: 'Blocked: MCP permissions are set to read-only. Set ROXANNE_MCP_PERMISSIONS=read-write in the server environment to enable posting.',
        };
      }

      // Forward the post request to Roxanne MCP
      try {
        const { ok, status, data } = await callMcp(`/${provider}/post`, {
          method: 'POST',
          body: req.body,
        });
        return { ok, status: status || 200, ...data };
      } catch (err) {
        return { ok: false, status: 503, message: `Could not reach Roxanne MCP: ${err.message}` };
      }
    },

  };
}

module.exports = { createMcpController };
