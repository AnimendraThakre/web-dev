const { encryptField, decryptField } = require('../utils/fieldCrypto');
const db = require('../db/client');

const memoryUsers = new Map();

const USER_COLUMNS = `
  id, full_name, email, password, role, is_disabled, is_email_verified, mfa_enabled,
  totp_secret, email_otp_hash, email_otp_expires_at, reset_otp_hash, reset_otp_expires_at,
  created_at, updated_at
`;

function decryptUserSecrets(user) {
  if (!user) return user;
  if (user.totpSecret) user.totpSecret = decryptField(user.totpSecret);
  return user;
}

function prepareTotpForStorage(secret) {
  if (secret == null) return null;
  return encryptField(secret);
}

function rowToUser(row) {
  if (!row) return null;
  return {
    _id: row.id,
    fullName: row.full_name,
    email: row.email,
    password: row.password,
    role: row.role || 'user',
    isDisabled: row.is_disabled,
    isEmailVerified: row.is_email_verified,
    mfaEnabled: row.mfa_enabled,
    totpSecret: row.totp_secret,
    emailOtpHash: row.email_otp_hash,
    emailOtpExpiresAt: row.email_otp_expires_at,
    resetOtpHash: row.reset_otp_hash,
    resetOtpExpiresAt: row.reset_otp_expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function stripSecrets(user, flags = {}) {
  if (!user) return user;
  const copy = { ...user };
  if (!flags.includeTotpSecret) delete copy.totpSecret;
  if (!flags.includeEmailOtp) {
    delete copy.emailOtpHash;
    delete copy.emailOtpExpiresAt;
  }
  if (!flags.includeResetOtp) {
    delete copy.resetOtpHash;
    delete copy.resetOtpExpiresAt;
  }
  return copy;
}

async function findByEmail(email, flags = {}) {
  const normalized = email.toLowerCase().trim();

  if (db.isMemoryMode()) {
    const user = memoryUsers.get(normalized) || null;
    const needsSecrets = flags.includeTotpSecret || flags.includeEmailOtp || flags.includeResetOtp;
    return needsSecrets ? decryptUserSecrets(user) : stripSecrets(user, flags);
  }

  const { rows } = await db.query(
    `SELECT ${USER_COLUMNS} FROM users WHERE email = $1 LIMIT 1`,
    [normalized]
  );
  const user = rowToUser(rows[0]);
  if (!user) return null;
  if (flags.includeTotpSecret) return decryptUserSecrets(user);
  return stripSecrets(user, flags);
}

async function findById(id, flags = {}) {
  if (db.isMemoryMode()) {
    for (const user of memoryUsers.values()) {
      if (String(user._id) === String(id)) {
        const needsSecrets = flags.includeTotpSecret || flags.includeEmailOtp || flags.includeResetOtp;
        return needsSecrets ? decryptUserSecrets(user) : stripSecrets(user, flags);
      }
    }
    return null;
  }

  const { rows } = await db.query(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = $1 LIMIT 1`,
    [id]
  );
  const user = rowToUser(rows[0]);
  if (!user) return null;
  if (flags.includeTotpSecret) return decryptUserSecrets(user);
  return stripSecrets(user, flags);
}

async function createUser(data) {
  const payload = { ...data };
  if (payload.totpSecret) payload.totpSecret = prepareTotpForStorage(payload.totpSecret);
  const email = payload.email.toLowerCase().trim();

  if (db.isMemoryMode()) {
    if (memoryUsers.has(email)) {
      const err = new Error('Email already registered');
      err.code = 11000;
      throw err;
    }
    const user = {
      _id: String(Date.now()) + Math.random().toString(36).slice(2),
      fullName: payload.fullName,
      email,
      password: payload.password,
      role: payload.role ?? 'user',
      isDisabled: payload.isDisabled ?? false,
      isEmailVerified: payload.isEmailVerified ?? false,
      mfaEnabled: payload.mfaEnabled ?? false,
      totpSecret: payload.totpSecret ?? null,
      emailOtpHash: payload.emailOtpHash ?? null,
      emailOtpExpiresAt: payload.emailOtpExpiresAt ?? null,
      resetOtpHash: payload.resetOtpHash ?? null,
      resetOtpExpiresAt: payload.resetOtpExpiresAt ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    memoryUsers.set(email, user);
    return user;
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO users (
        full_name, email, password, role, is_disabled, is_email_verified, mfa_enabled,
        totp_secret, email_otp_hash, email_otp_expires_at, reset_otp_hash, reset_otp_expires_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING ${USER_COLUMNS}`,
      [
        payload.fullName,
        email,
        payload.password,
        payload.role ?? 'user',
        payload.isDisabled ?? false,
        payload.isEmailVerified ?? false,
        payload.mfaEnabled ?? false,
        payload.totpSecret ?? null,
        payload.emailOtpHash ?? null,
        payload.emailOtpExpiresAt ?? null,
        payload.resetOtpHash ?? null,
        payload.resetOtpExpiresAt ?? null,
      ]
    );
    return rowToUser(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      const dup = new Error('Email already registered');
      dup.code = 11000;
      throw dup;
    }
    throw err;
  }
}

async function updateUser(user, updates) {
  const payload = { ...updates };
  if (Object.prototype.hasOwnProperty.call(payload, 'totpSecret')) {
    payload.totpSecret = prepareTotpForStorage(payload.totpSecret);
  }
  Object.assign(user, payload);
  user.updatedAt = new Date();

  if (db.isMemoryMode()) {
    memoryUsers.set(user.email, user);
    return decryptUserSecrets(user);
  }

  const { rows } = await db.query(
    `UPDATE users SET
      full_name = $1,
      email = $2,
      password = $3,
      role = $4,
      is_disabled = $5,
      is_email_verified = $6,
      mfa_enabled = $7,
      totp_secret = $8,
      email_otp_hash = $9,
      email_otp_expires_at = $10,
      reset_otp_hash = $11,
      reset_otp_expires_at = $12,
      updated_at = NOW()
    WHERE id = $13
    RETURNING ${USER_COLUMNS}`,
    [
      user.fullName,
      user.email,
      user.password,
      user.role || 'user',
      Boolean(user.isDisabled),
      Boolean(user.isEmailVerified),
      Boolean(user.mfaEnabled),
      user.totpSecret ?? null,
      user.emailOtpHash ?? null,
      user.emailOtpExpiresAt ?? null,
      user.resetOtpHash ?? null,
      user.resetOtpExpiresAt ?? null,
      user._id,
    ]
  );
  return decryptUserSecrets(rowToUser(rows[0]));
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    _id: user._id,
    fullName: user.fullName,
    email: user.email,
    role: user.role || 'user',
    isDisabled: Boolean(user.isDisabled),
    isEmailVerified: Boolean(user.isEmailVerified),
    mfaEnabled: Boolean(user.mfaEnabled),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function listUsers() {
  if (db.isMemoryMode()) {
    return Array.from(memoryUsers.values()).map(sanitizeUser);
  }

  const { rows } = await db.query(
    `SELECT id, full_name, email, role, is_disabled, is_email_verified, mfa_enabled, created_at, updated_at
     FROM users ORDER BY created_at DESC`
  );
  return rows.map((row) => sanitizeUser(rowToUser(row)));
}

module.exports = {
  connectDB: db.connectDB,
  setMemoryMode: db.setMemoryMode,
  isMemoryMode: db.isMemoryMode,
  isDbConnected: db.isDbConnected,
  getDbStatus: db.getDbStatus,
  findByEmail,
  findById,
  createUser,
  updateUser,
  listUsers,
};
