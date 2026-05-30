import { createSign } from 'node:crypto';

export async function getGithubInstallationToken({ clientId, privateKey }) {
  const normalizedKey = String(privateKey || '').replace(/\\n/g, '\n');
  const jwt = makeAppJwt(clientId, normalizedKey);
  const installation = await findInstallation(jwt);
  return exchangeForToken(jwt, installation.id);
}

function makeAppJwt(clientId, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: clientId }));
  const unsigned = `${header}.${payload}`;
  const sign = createSign('RSA-SHA256');
  sign.update(unsigned);
  const sig = sign.sign(privateKey, 'base64url');
  return `${unsigned}.${sig}`;
}

async function findInstallation(jwt) {
  const res = await fetch('https://api.github.com/app/installations', { headers: appHeaders(jwt) });
  if (!res.ok) throw new Error(`GitHub App installations lookup failed ${res.status}: ${await res.text().catch(() => '')}`);
  const list = await res.json();
  if (!list.length) throw new Error('GitHub App has no installations. Install it on the target account first.');
  return list[0];
}

async function exchangeForToken(jwt, installationId) {
  const res = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, { method: 'POST', headers: appHeaders(jwt) });
  if (!res.ok) throw new Error(`GitHub App token exchange failed ${res.status}: ${await res.text().catch(() => '')}`);
  const data = await res.json();
  return data.token;
}

function appHeaders(jwt) {
  return { Accept: 'application/vnd.github+json', Authorization: `Bearer ${jwt}`, 'User-Agent': 'glondiasites-render-deploy-lab' };
}

function b64url(str) {
  return Buffer.from(str).toString('base64url');
}
