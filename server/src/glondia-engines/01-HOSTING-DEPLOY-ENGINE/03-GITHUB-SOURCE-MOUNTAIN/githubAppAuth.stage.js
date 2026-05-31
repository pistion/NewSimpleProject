/**
 * githubAppAuth.stage.js - 03-GITHUB-SOURCE-MOUNTAIN
 *
 * GitHub App private-key token exchange for generated-sites publishing.
 */

import { createSign } from 'node:crypto';

export async function getGithubInstallationToken({ appId, clientId, privateKey, owner, repo }) {
  const issuer = appId || clientId;
  if (!issuer) throw new Error('GITHUB_APP_ID is required for GitHub App private-key publishing. GITHUB_CLIENT_ID is accepted only as a legacy fallback.');
  const normalizedKey = String(privateKey || '').replace(/\\n/g, '\n');
  const jwt = makeAppJwt(issuer, normalizedKey);
  const installation = owner && repo ? await findRepoInstallation(jwt, owner, repo) : await findFirstInstallation(jwt);
  return exchangeForToken(jwt, installation.id);
}

function makeAppJwt(issuer, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: issuer }));
  const unsigned = `${header}.${payload}`;
  const sign = createSign('RSA-SHA256');
  sign.update(unsigned);
  const sig = sign.sign(privateKey, 'base64url');
  return `${unsigned}.${sig}`;
}

async function findRepoInstallation(jwt, owner, repo) {
  const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/installation`, { headers: appHeaders(jwt) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub App is not installed on ${owner}/${repo} or lacks access (${res.status}): ${body}`);
  }
  return res.json();
}

async function findFirstInstallation(jwt) {
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
