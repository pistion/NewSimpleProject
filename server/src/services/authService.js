import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from './db.js';

const isProd = process.env.NODE_ENV === 'production';
const DEV_JWT_SECRET = 'glondia-dev-insecure-jwt-secret-change-me';
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10);
// The first N registered users are eligible for the K50 launch promo.
const PROMO_SIGNUP_LIMIT = Number(process.env.DEPLOYMENT_PROMO_SIGNUP_LIMIT || process.env.DEPLOYMENT_PROMO_LIMIT || 20);

/**
 * Resolve the JWT signing secret. In production a real secret MUST be supplied;
 * we refuse to fall back to the insecure dev default there.
 *
 * Accepts JWT_SECRET (canonical) or JWT_ACCESS_SECRET (common alternate name)
 * so a naming mismatch can't silently take down auth in production.
 */
export function getJwtSecret() {
  const secret = process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET;
  if (secret) return secret;
  if (isProd) {
    throw httpError('JWT_SECRET (or JWT_ACCESS_SECRET) is not configured.', 500);
  }
  return DEV_JWT_SECRET;
}

// ─── Password hashing ─────────────────────────────────────────────────────────

export async function hashPassword(plain) {
  return bcrypt.hash(String(plain), BCRYPT_ROUNDS);
}

export async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(String(plain), hash);
}

// ─── Access tokens (JWT) ───────────────────────────────────────────────────────

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role || 'owner', name: user.name || null },
    getJwtSecret(),
    { expiresIn: ACCESS_TOKEN_TTL },
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, getJwtSecret());
}

// ─── Refresh tokens (opaque, DB-backed, hashed + rotated) ──────────────────────

function hashToken(raw) {
  return createHash('sha256').update(String(raw)).digest('hex');
}

export async function issueRefreshToken(userId) {
  const raw = randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: { userId, tokenHash: hashToken(raw), expiresAt },
  });
  return raw;
}

/** Validate + rotate a refresh token. Returns the owning user or throws. */
async function rotateRefreshToken(rawToken) {
  if (!rawToken) throw httpError('A refresh token is required.', 401);
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true },
  });
  if (!record || record.revokedAt || record.expiresAt.getTime() < Date.now()) {
    throw httpError('Invalid or expired refresh token.', 401);
  }
  // Rotate: revoke the presented token so it cannot be reused.
  await prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
  const refreshToken = await issueRefreshToken(record.userId);
  return { user: record.user, refreshToken };
}

// ─── Session shape returned to the frontend ─────────────────────────────────────

// Authenticated-route hint for the caller's own avatar. The browser fetches it
// as a blob (Authorization header required) — it is NOT a public URL, and the
// raw avatarPath/idPhotoPath SSD paths are never exposed.
const OWN_AVATAR_URL = '/api/v1/auth/profile/avatar';

function toPublicUser(user) {
  const details = safeJson(user.profileDetails);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    organizationName: details.organizationName || null,
    role: user.role,
    planId: user.planId,
    phone: user.phone || null,
    accountStatus: user.accountStatus || 'active',
    hasAvatar: Boolean(user.avatarPath),
    avatarUrl: user.avatarPath ? OWN_AVATAR_URL : null,
    hasIdPhoto: Boolean(user.idPhotoPath),
  };
}

async function buildSession(user) {
  const accessToken = signAccessToken(user);
  const refreshToken = await issueRefreshToken(user.id);
  return {
    user: toPublicUser(user),
    tokens: { accessToken, refreshToken, tokenType: 'Bearer' },
  };
}

// ─── Public operations ──────────────────────────────────────────────────────────

export async function registerUser({ email, password, name, organizationName }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
    throw httpError('A valid email address is required.', 400);
  }
  if (!password || String(password).length < 8) {
    throw httpError('Password must be at least 8 characters.', 400);
  }
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) throw httpError('An account with this email already exists.', 409);

  const passwordHash = await hashPassword(password);

  // Compute the signup rank and promo eligibility inside a transaction to keep
  // the rank consistent under concurrent registrations. Promo eligibility is a
  // registration-order property — the first PROMO_SIGNUP_LIMIT users qualify —
  // NOT a function of paid orders.
  const user = await prisma.$transaction(async (tx) => {
    const priorCount = await tx.user.count();
    const signupRank = priorCount + 1;
    const promoEligible = signupRank <= PROMO_SIGNUP_LIMIT;
    const orgName = String(organizationName || '').trim() || null;
    return tx.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: String(name || '').trim() || null,
        profileDetails: JSON.stringify({ organizationName: orgName }),
        promoSignupRank: signupRank,
        promoEligible,
      },
    });
  });
  return buildSession(user);
}

export async function loginUser({ email, password }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  // Always run a compare to reduce user-enumeration timing differences.
  const ok = await verifyPassword(password, user?.passwordHash);
  if (!user || !ok) throw httpError('Invalid email or password.', 401);
  // Account lifecycle: disabled/deleted/suspended accounts cannot log in (MVP).
  const status = user.accountStatus || 'active';
  if (status !== 'active') {
    throw httpError('This account is not active. Please contact support.', 403);
  }
  return buildSession(user);
}

export async function refreshSession(rawToken) {
  const { user, refreshToken } = await rotateRefreshToken(rawToken);
  const accessToken = signAccessToken(user);
  return {
    user: toPublicUser(user),
    tokens: { accessToken, refreshToken, tokenType: 'Bearer' },
  };
}

export async function logoutUser(rawToken) {
  if (!rawToken) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getUserById(userId) {
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return user ? toPublicUser(user) : null;
}

// ─── Self-service profile (the signed-in customer) ────────────────────────────

function safeJson(text) {
  try { return JSON.parse(text || '{}'); } catch { return {}; }
}

/** Profile shape returned to the account owner — never exposes the raw idPhotoPath. */
function toProfile(user) {
  const details = safeJson(user.profileDetails);
  return {
    id: user.id,
    email: user.email,
    name: user.name || null,
    organizationName: details.organizationName || null,
    phone: user.phone || null,
    role: user.role,
    planId: user.planId,
    accountStatus: user.accountStatus || 'active',
    profileDetails: details,
    hasAvatar: Boolean(user.avatarPath),
    avatarUrl: user.avatarPath ? OWN_AVATAR_URL : null,
    hasIdPhoto: Boolean(user.idPhotoPath),
    createdAt: user.createdAt,
  };
}

export async function getUserProfile(userId) {
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return user ? toProfile(user) : null;
}

/** Update the caller's own editable profile fields (name, phone, personal details). */
export async function updateUserProfile(userId, patch = {}) {
  if (!userId || userId === 'local-user') throw httpError('A real account is required.', 401);
  const data = {};
  if (patch.name !== undefined) data.name = patch.name ? String(patch.name).slice(0, 200) : null;
  if (patch.phone !== undefined) data.phone = patch.phone ? String(patch.phone).slice(0, 50) : null;
  if (patch.profileDetails !== undefined) {
    const details = typeof patch.profileDetails === 'string' ? safeJson(patch.profileDetails) : patch.profileDetails;
    data.profileDetails = JSON.stringify(details || {});
  }
  const user = await prisma.user.update({ where: { id: userId }, data });
  return toProfile(user);
}

/** Record the SSD path of the caller's own uploaded ID photo. */
export async function setOwnIdPhotoPath(userId, filePath) {
  if (!userId || userId === 'local-user') throw httpError('A real account is required.', 401);
  const user = await prisma.user.update({ where: { id: userId }, data: { idPhotoPath: filePath } });
  return toProfile(user);
}

/** Record the SSD path of the caller's own profile avatar/headshot. */
export async function setOwnAvatarPath(userId, filePath) {
  if (!userId || userId === 'local-user') throw httpError('A real account is required.', 401);
  const user = await prisma.user.update({ where: { id: userId }, data: { avatarPath: filePath } });
  return toProfile(user);
}

/**
 * Lightweight account-status lookup for per-request enforcement in authMiddleware.
 * Returns the accountStatus string, or null when no matching DB row exists
 * (e.g. the dev/local-user fallback, which is intentionally allowed through).
 */
export async function getUserAccountStatus(userId) {
  if (!userId || userId === 'local-user') return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { accountStatus: true } });
  return user ? (user.accountStatus || 'active') : null;
}

function httpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  return error;
}
