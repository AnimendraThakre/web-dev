const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const PREFIX = 'enc:v1:';

/**
 * Application-level encryption for sensitive DB fields (e.g. mfaSecret).
 * Uses AES-256-GCM with a key from DB_ENCRYPTION_KEY (64-char hex = 32 bytes).
 * MongoDB Atlas also encrypts data at rest and in transit (TLS).
 */
function getEncryptionKey() {
  const raw = (process.env.DB_ENCRYPTION_KEY || '').trim();
  if (!raw) return null;
  if (/^[0-9a-f]{64}$/i.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  return crypto.createHash('sha256').update(raw).digest();
}

function encryptField(plaintext) {
  if (plaintext == null || plaintext === '') return null;
  const key = getEncryptionKey();
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DB_ENCRYPTION_KEY is required in production.');
    }
    return plaintext;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptField(stored) {
  if (stored == null || stored === '') return null;
  if (!String(stored).startsWith(PREFIX)) {
    return stored;
  }
  const key = getEncryptionKey();
  if (!key) {
    throw new Error('DB_ENCRYPTION_KEY is required to decrypt stored secrets.');
  }
  const payload = String(stored).slice(PREFIX.length);
  const [ivHex, tagHex, dataHex] = payload.split(':');
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}

function isEncryptionConfigured() {
  return Boolean(getEncryptionKey());
}

module.exports = {
  encryptField,
  decryptField,
  generateEncryptionKey,
  isEncryptionConfigured,
};
