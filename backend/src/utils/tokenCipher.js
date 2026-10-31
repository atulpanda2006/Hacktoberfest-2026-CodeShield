import crypto from 'crypto';
import env from '../config/env.js';

/**
 * Authenticated encryption for per-user GitHub access tokens.
 *
 * AES-256-GCM with a random 12-byte IV per encryption. The stored value is
 * `v1.<iv>.<authTag>.<ciphertext>` (all base64url), so the format can evolve
 * without breaking existing rows. Tokens are never logged.
 */

const VERSION = 'v1';
const IV_BYTES = 12;
const ALGORITHM = 'aes-256-gcm';

let cachedKey = null;

function getKey() {
  if (cachedKey) return cachedKey;

  const raw = env.github.tokenEncryptionKey;

  if (!raw || raw.startsWith('your-')) {
    throw new Error(
      'GITHUB_TOKEN_ENCRYPTION_KEY is not configured. Generate one with: openssl rand -hex 32'
    );
  }

  // Accept 64-char hex or any sufficiently long passphrase, always deriving a
  // 32-byte key so misconfiguration surfaces as a clear startup error.
  const buffer = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : null;
  cachedKey = buffer ?? crypto.createHash('sha256').update(raw).digest();

  return cachedKey;
}

export function isCipherConfigured() {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Encrypt a plaintext token.
 * @param {string} plaintext
 * @returns {string} `v1.<iv>.<tag>.<ciphertext>`
 */
export function encryptToken(plaintext) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('Cannot encrypt an empty token');
  }

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

/**
 * Decrypt a stored token. Throws when the payload was tampered with or the
 * encryption key changed (both are authentication failures).
 * @param {string} payload
 * @returns {string} plaintext token
 */
export function decryptToken(payload) {
  if (typeof payload !== 'string') {
    throw new Error('Invalid encrypted token payload');
  }

  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Unsupported encrypted token format');
  }

  const [, ivPart, tagPart, dataPart] = parts;
  const iv = Buffer.from(ivPart, 'base64url');
  const authTag = Buffer.from(tagPart, 'base64url');
  const ciphertext = Buffer.from(dataPart, 'base64url');

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Mask a token for safe display: keeps the prefix and last 4 characters only.
 */
export function maskToken(token) {
  if (!token || token.length < 12) return '••••••••';
  const prefix = token.slice(0, 4);
  const suffix = token.slice(-4);
  return `${prefix}…${suffix}`;
}

export default { encryptToken, decryptToken, maskToken, isCipherConfigured };
