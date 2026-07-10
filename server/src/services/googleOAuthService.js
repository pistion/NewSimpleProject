import { prisma } from './db.js';
import { signAccessToken, issueRefreshToken, ensureClientId } from './authService.js';
import { randomBytes } from 'node:crypto';

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI;

export function getGoogleAuthUrl(state) {
  const params = new URLSearchParams({
    client_id:     GOOGLE_CLIENT_ID,
    redirect_uri:  GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'offline',
    prompt:        'select_account',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function exchangeCode(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri:  GOOGLE_REDIRECT_URI,
      grant_type:    'authorization_code',
    }),
  });
  const data = await res.json();
  if (data.error || !data.access_token) {
    throw Object.assign(new Error(data.error_description || 'Google token exchange failed.'), { status: 400 });
  }
  return data.access_token;
}

async function getGoogleUser(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw Object.assign(new Error('Failed to fetch Google user info.'), { status: 502 });
  const u = await res.json();
  // sub is Google's stable user ID
  return { id: u.sub, email: u.email, name: u.name || u.given_name || u.email.split('@')[0], emailVerified: u.email_verified };
}

export async function handleGoogleCallback(code) {
  const gToken = await exchangeCode(code);
  const gUser  = await getGoogleUser(gToken);

  if (!gUser.email || !gUser.emailVerified) {
    throw Object.assign(new Error('Your Google account has no verified email address.'), { status: 400 });
  }

  // Store emails the same way as password register: trim + lowercase.
  const email = String(gUser.email || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw Object.assign(new Error('A valid Google email address is required.'), { status: 400 });
  }

  let user = await prisma.user.findFirst({ where: { profileDetails: { contains: `"googleId":"${gUser.id}"` } } })
          ?? await prisma.user.findUnique({ where: { email } });

  if (user) {
    const details = safeJson(user.profileDetails);
    const patch = {};
    if (!details.googleId) {
      patch.profileDetails = JSON.stringify({ ...details, googleId: gUser.id });
    }
    // Heal legacy mixed-case emails so uniqueness/login stay consistent.
    if (user.email !== email) patch.email = email;
    if (Object.keys(patch).length) {
      user = await prisma.user.update({ where: { id: user.id }, data: patch });
    }
  } else {
    const details = JSON.stringify({ googleId: gUser.id });
    user = await prisma.user.create({
      data: {
        email,
        name:         gUser.name,
        passwordHash: randomBytes(32).toString('hex'),
        profileDetails: details,
      },
    });
  }

  // Assign the glondiac-XXXX client reference (no-op when already set).
  user = await ensureClientId(user);

  // Capture OAuth account email into CRM Client Accounts (name + database id).
  try {
    const { captureContactEmail } = await import('./crmContactsService.js');
    await captureContactEmail({
      email: user.email,
      name: user.name || user.email?.split('@')[0],
      userId: user.id,
      source: 'google_oauth',
      listType: 'client_accounts',
      role: user.role,
      accountStatus: user.accountStatus || 'active',
    });
  } catch (err) {
    console.warn('[google-oauth] CRM contact capture skipped:', err.message);
  }

  const accessToken  = signAccessToken(user);
  const refreshToken = await issueRefreshToken(user.id);

  return {
    user:   { id: user.id, email: user.email, name: user.name, role: user.role },
    tokens: { accessToken, refreshToken, tokenType: 'Bearer' },
  };
}

function safeJson(str) {
  try { return JSON.parse(str || '{}'); } catch { return {}; }
}
