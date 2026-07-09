/**
 * socialTokenStore.js
 * Persists OAuth tokens to data/social-tokens.json using AES-256-GCM encryption.
 * No npm dependencies — pure Node.js crypto + fs.
 */

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const STORE_PATH = path.resolve(__dirname, '../../../../../data/social-tokens.json');
const ALGO       = 'aes-256-gcm';

function getKey() {
  const raw = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY || process.env.SESSION_SECRET || 'fallback-insecure-key-please-set-env';
  return crypto.createHash('sha256').update(raw).digest(); // 32 bytes
}

function encrypt(plaintext) {
  const iv         = crypto.randomBytes(12);
  const key        = getKey();
  const cipher     = crypto.createCipheriv(ALGO, key, iv);
  const encrypted  = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag        = cipher.getAuthTag();
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
}

function decrypt(ciphertext) {
  const [ivHex, tagHex, dataHex] = ciphertext.split(':');
  const key     = getKey();
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(dataHex, 'hex')) + decipher.final('utf8');
}

function loadStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return {};
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveStore(store) {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function setToken(provider, tokenData) {
  const store = loadStore();
  store[provider] = encrypt(JSON.stringify(tokenData));
  saveStore(store);
}

function getToken(provider) {
  const store = loadStore();
  if (!store[provider]) return null;
  try {
    return JSON.parse(decrypt(store[provider]));
  } catch {
    return null;
  }
}

function clearToken(provider) {
  const store = loadStore();
  delete store[provider];
  saveStore(store);
}

function hasToken(provider) {
  return getToken(provider) !== null;
}

module.exports = { setToken, getToken, clearToken, hasToken };
