import { prisma } from './db.js';
import { signAccessToken, issueRefreshToken } from './authService.js';
import { randomBytes } from 'node:crypto';

const GITHUB_CLIENT_ID     = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_REDIRECT_URI  = process.env.GITHUB_REDIRECT_URI;

export function getGitHubAuthUrl(state) {
  const params = new URLSearchParams({
    client_id:    GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_REDIRECT_URI,
    scope:        'read:user user:email',
    state,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

async function exchangeCode(code) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
      redirect_uri:  GITHUB_REDIRECT_URI,
    }),
  });
  const data = await res.json();
  if (data.error || !data.access_token) {
    throw Object.assign(new Error(data.error_description || 'GitHub token exchange failed.'), { status: 400 });
  }
  return data.access_token;
}

async function getGitHubUser(accessToken) {
  const [userRes, emailsRes] = await Promise.all([
    fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' } }),
    fetch('https://api.github.com/user/emails', { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' } }),
  ]);
  if (!userRes.ok) throw Object.assign(new Error('Failed to fetch GitHub user.'), { status: 502 });
  const ghUser = await userRes.json();
  const emails = emailsRes.ok ? await emailsRes.json() : [];
  const primary = emails.find(e => e.primary && e.verified)?.email || ghUser.email;
  return { id: String(ghUser.id), login: ghUser.login, name: ghUser.name || ghUser.login, email: primary };
}

export async function handleGitHubCallback(code) {
  const ghToken = await exchangeCode(code);
  const ghUser  = await getGitHubUser(ghToken);

  if (!ghUser.email) {
    throw Object.assign(new Error('Your GitHub account has no verified public email. Please add one and retry.'), { status: 400 });
  }

  // Find or create the user by GitHub ID stored in profileDetails, falling back to email.
  let user = await prisma.user.findFirst({ where: { profileDetails: { contains: `"githubId":"${ghUser.id}"` } } })
          ?? await prisma.user.findUnique({ where: { email: ghUser.email } });

  if (user) {
    // Merge GitHub ID into profileDetails if not already there.
    const details = safeJson(user.profileDetails);
    if (!details.githubId) {
      await prisma.user.update({
        where: { id: user.id },
        data: { profileDetails: JSON.stringify({ ...details, githubId: ghUser.id, githubLogin: ghUser.login }) },
      });
    }
  } else {
    // New user — create account. No password set for OAuth-only users.
    const details = JSON.stringify({ githubId: ghUser.id, githubLogin: ghUser.login });
    user = await prisma.user.create({
      data: {
        email:        ghUser.email,
        name:         ghUser.name,
        passwordHash: randomBytes(32).toString('hex'), // unusable random hash
        profileDetails: details,
      },
    });
  }

  const accessToken  = signAccessToken(user);
  const refreshToken = await issueRefreshToken(user.id);

  return {
    user:   { id: user.id, email: user.email, name: user.name, role: user.role },
    tokens: { accessToken, refreshToken, tokenType: 'Bearer' },
    githubLogin: ghUser.login,
  };
}

function safeJson(str) {
  try { return JSON.parse(str || '{}'); } catch { return {}; }
}
