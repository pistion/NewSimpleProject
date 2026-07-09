/**
 * facebookService.js
 * Facebook Page OAuth flow + Graph API posting.
 * Pure Node.js — no npm packages.
 *
 * Flow:
 *   1. getAuthUrl(state)        → redirect user to Facebook consent screen
 *   2. handleCallback(code,state) → exchange code → get page token → persist
 *   3. post(content)            → publish to connected Facebook Page
 *   4. getStatus()              → connected flag + page name
 */

const tokenStore = require('./socialTokenStore');

const APP_ID      = () => process.env.FACEBOOK_APP_ID       || '';
const APP_SECRET  = () => process.env.FACEBOOK_CLIENT_SECRET || '';
const REDIRECT    = () => process.env.FACEBOOK_REDIRECT_URI  || 'http://localhost:9000/api/admin/crm/integrations/facebook/callback';
const GRAPH_VER   = () => process.env.META_GRAPH_VERSION     || 'v19.0';
const SCOPES      = () => (process.env.META_OAUTH_SCOPES     || 'pages_show_list,pages_manage_posts,pages_read_engagement');

function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_id:     APP_ID(),
    redirect_uri:  REDIRECT(),
    scope:         SCOPES(),
    state,
    response_type: 'code',
  });
  return `https://www.facebook.com/dialog/oauth?${params}`;
}

async function exchangeCode(code) {
  const params = new URLSearchParams({
    client_id:     APP_ID(),
    client_secret: APP_SECRET(),
    redirect_uri:  REDIRECT(),
    code,
  });
  const res  = await fetch(`https://graph.facebook.com/${GRAPH_VER()}/oauth/access_token?${params}`);
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error?.message || 'Facebook token exchange failed');
  }
  return data.access_token;
}

async function getLongLivedToken(shortToken) {
  const params = new URLSearchParams({
    grant_type:        'fb_exchange_token',
    client_id:         APP_ID(),
    client_secret:     APP_SECRET(),
    fb_exchange_token: shortToken,
  });
  const res  = await fetch(`https://graph.facebook.com/${GRAPH_VER()}/oauth/access_token?${params}`);
  const data = await res.json();
  return data.access_token || shortToken;
}

async function fetchPages(userToken) {
  const res  = await fetch(`https://graph.facebook.com/${GRAPH_VER()}/me/accounts?access_token=${userToken}&fields=id,name,access_token`);
  const data = await res.json();
  return data.data || [];
}

async function handleCallback(code) {
  const shortToken = await exchangeCode(code);
  const userToken  = await getLongLivedToken(shortToken);
  const pages      = await fetchPages(userToken);

  if (!pages.length) {
    throw new Error('No Facebook Pages found for this account. You must manage at least one Page to post.');
  }

  // Store first page (user can switch pages later if needed)
  const page = pages[0];
  tokenStore.setToken('facebook', {
    pageId:          page.id,
    pageName:        page.name,
    pageAccessToken: page.access_token,
    userToken,
    connectedAt:     new Date().toISOString(),
  });

  return { pageId: page.id, pageName: page.name };
}

async function post(content) {
  const token = tokenStore.getToken('facebook');
  if (!token) throw Object.assign(new Error('Facebook not connected. Please connect first.'), { code: 'NOT_CONNECTED' });

  const res  = await fetch(`https://graph.facebook.com/${GRAPH_VER()}/${token.pageId}/feed`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ message: content, access_token: token.pageAccessToken }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message || 'Facebook post failed');
  return { postId: data.id, pageName: token.pageName };
}

function getStatus() {
  const token = tokenStore.getToken('facebook');
  if (!token) return { connected: false, configured: Boolean(APP_ID() && APP_SECRET()) };
  return {
    connected:    true,
    configured:   true,
    accountName:  token.pageName,
    connectedAt:  token.connectedAt,
  };
}

function disconnect() {
  tokenStore.clearToken('facebook');
}

module.exports = { getAuthUrl, handleCallback, post, getStatus, disconnect };
