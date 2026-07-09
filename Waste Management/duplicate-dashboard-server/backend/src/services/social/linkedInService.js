/**
 * linkedInService.js
 * LinkedIn OAuth 2.0 flow + Posts API.
 * Pure Node.js — no npm packages.
 *
 * Flow:
 *   1. getAuthUrl(state)          → redirect user to LinkedIn consent screen
 *   2. handleCallback(code,state) → exchange code → get profile → persist token
 *   3. post(content)              → publish to connected LinkedIn member feed
 *   4. getStatus()                → connected flag + member name
 */

const tokenStore = require('./socialTokenStore');

const CLIENT_ID     = () => process.env.LINKEDIN_CLIENT_ID     || '';
const CLIENT_SECRET = () => process.env.LINKEDIN_CLIENT_SECRET || '';
const REDIRECT      = () => process.env.LINKEDIN_REDIRECT_URI  || 'http://localhost:9000/api/admin/crm/integrations/linkedin/callback';
const SCOPES        = 'openid profile w_member_social';

function getAuthUrl(state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     CLIENT_ID(),
    redirect_uri:  REDIRECT(),
    state,
    scope:         SCOPES,
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
}

async function exchangeCode(code) {
  const params = new URLSearchParams({
    grant_type:    'authorization_code',
    code,
    redirect_uri:  REDIRECT(),
    client_id:     CLIENT_ID(),
    client_secret: CLIENT_SECRET(),
  });
  const res  = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params.toString(),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'LinkedIn token exchange failed');
  }
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

async function fetchProfile(accessToken) {
  const res  = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Failed to fetch LinkedIn profile');
  // userinfo returns: sub (person URN id), name, given_name, family_name, email, picture
  return {
    personId: data.sub,            // urn:li:person:<id> — sub is the raw id
    name:     data.name || `${data.given_name || ''} ${data.family_name || ''}`.trim(),
    email:    data.email || '',
  };
}

async function handleCallback(code) {
  const { accessToken, expiresIn } = await exchangeCode(code);
  const profile = await fetchProfile(accessToken);

  tokenStore.setToken('linkedin', {
    accessToken,
    expiresIn,
    personId:    profile.personId,
    name:        profile.name,
    email:       profile.email,
    connectedAt: new Date().toISOString(),
  });

  return { name: profile.name };
}

async function post(content) {
  const token = tokenStore.getToken('linkedin');
  if (!token) throw Object.assign(new Error('LinkedIn not connected. Please connect first.'), { code: 'NOT_CONNECTED' });

  const authorUrn = `urn:li:person:${token.personId}`;

  const body = {
    author:         authorUrn,
    commentary:     content,
    visibility:     'PUBLIC',
    distribution: {
      feedDistribution:             'MAIN_FEED',
      targetEntities:               [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState:            'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };

  const res  = await fetch('https://api.linkedin.com/rest/posts', {
    method:  'POST',
    headers: {
      Authorization:    `Bearer ${token.accessToken}`,
      'Content-Type':   'application/json',
      'LinkedIn-Version': '202407',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `LinkedIn post failed (HTTP ${res.status})`);
  }

  const postId = res.headers.get('x-restli-id') || res.headers.get('location') || null;
  return { postId, name: token.name };
}

function getStatus() {
  const token = tokenStore.getToken('linkedin');
  if (!token) return { connected: false, configured: Boolean(CLIENT_ID() && CLIENT_SECRET()) };
  return {
    connected:   true,
    configured:  true,
    accountName: token.name,
    connectedAt: token.connectedAt,
  };
}

function disconnect() {
  tokenStore.clearToken('linkedin');
}

module.exports = { getAuthUrl, handleCallback, post, getStatus, disconnect };
