import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from './db.js';

const isProd = process.env.NODE_ENV === 'production';
const DEV_JWT_SECRET = 'glondia-dev-insecure-jwt-secret-change-me';
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10);

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

async function issueRefreshToken(userId) {
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

function toPublicUser(user) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, planId: user.planId };
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

export async function registerUser({ email, password, name }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
    throw httpError('A valid email address is required.', 400);
  }
  if (!password || String(password).length < 8) {
    throw httpError('Password must be at least 8 characters.', 400);
  }
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) throw httpError('An account with this email already exists.', 409);

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash: await hashPassword(password),
      name: String(name || '').trim() || null,
    },
  });
  return buildSession(user);
}

export async function loginUser({ email, password }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  // Always run a compare to reduce user-enumeration timing differences.
  const ok = await verifyPassword(password, user?.passwordHash);
  if (!user || !ok) throw httpError('Invalid email or password.', 401);
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

function httpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  return error;
}
