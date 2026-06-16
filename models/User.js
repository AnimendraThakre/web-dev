const mongoose = require('mongoose');
const { encryptField, decryptField } = require('../utils/fieldCrypto');
const { config, isLocalMongoUri } = require('../config/env');

/**
 * User schema
 * - isEmailVerified: account activated after email OTP
 * - mfaEnabled: Google Authenticator confirmed
 * - totpSecret: encrypted TOTP secret (select: false)
 * - emailOtpHash / emailOtpExpiresAt: registration email OTP (select: false)
 */
const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    password: { type: String, required: true },
    isEmailVerified: { type: Boolean, default: false },
    mfaEnabled: { type: Boolean, default: false },
    totpSecret: { type: String, default: null, select: false },
    emailOtpHash: { type: String, default: null, select: false },
    emailOtpExpiresAt: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

const UserModel = mongoose.models.User || mongoose.model('User', userSchema);

const memoryUsers = new Map();
let useMemory = false;
let dbConnected = false;

function setMemoryMode(enabled) {
  useMemory = enabled;
  if (enabled) console.warn('[DB] Using in-memory user store (data lost on restart).');
}

function isMemoryMode() { return useMemory; }
function isDbConnected() { return dbConnected && mongoose.connection.readyState === 1; }

function decryptUserSecrets(user) {
  if (!user) return user;
  if (user.totpSecret) user.totpSecret = decryptField(user.totpSecret);
  return user;
}

function prepareTotpForStorage(secret) {
  if (secret == null) return null;
  return encryptField(secret);
}

function buildSelectFlags({ includeTotpSecret = false, includeEmailOtp = false } = {}) {
  const fields = [];
  if (includeTotpSecret) fields.push('+totpSecret');
  if (includeEmailOtp) fields.push('+emailOtpHash', '+emailOtpExpiresAt');
  return fields;
}

function applySelect(query, flags) {
  const fields = buildSelectFlags(flags);
  fields.forEach((f) => query.select(f));
  return query;
}

async function findByEmail(email, flags = {}) {
  const normalized = email.toLowerCase().trim();
  if (useMemory) {
    const user = memoryUsers.get(normalized) || null;
    return flags.includeTotpSecret || flags.includeEmailOtp ? decryptUserSecrets(user) : user;
  }
  const user = await applySelect(UserModel.findOne({ email: normalized }), flags);
  return flags.includeTotpSecret ? decryptUserSecrets(user) : user;
}

async function findById(id, flags = {}) {
  if (useMemory) {
    for (const user of memoryUsers.values()) {
      if (String(user._id) === String(id)) {
        return flags.includeTotpSecret || flags.includeEmailOtp ? decryptUserSecrets(user) : user;
      }
    }
    return null;
  }
  const user = await applySelect(UserModel.findById(id), flags);
  return flags.includeTotpSecret ? decryptUserSecrets(user) : user;
}

async function createUser(data) {
  const payload = { ...data };
  if (payload.totpSecret) payload.totpSecret = prepareTotpForStorage(payload.totpSecret);

  if (useMemory) {
    const email = payload.email.toLowerCase().trim();
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
      isEmailVerified: payload.isEmailVerified ?? false,
      mfaEnabled: payload.mfaEnabled ?? false,
      totpSecret: payload.totpSecret ?? null,
      emailOtpHash: payload.emailOtpHash ?? null,
      emailOtpExpiresAt: payload.emailOtpExpiresAt ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      async save() {
        this.updatedAt = new Date();
        memoryUsers.set(this.email, { ...this, save: this.save });
        return this;
      },
    };
    memoryUsers.set(email, user);
    return user;
  }
  const user = new UserModel(payload);
  await user.save();
  return user;
}

async function updateUser(user, updates) {
  const payload = { ...updates };
  if (Object.prototype.hasOwnProperty.call(payload, 'totpSecret')) {
    payload.totpSecret = prepareTotpForStorage(payload.totpSecret);
  }
  Object.assign(user, payload);
  user.updatedAt = new Date();
  if (useMemory) {
    memoryUsers.set(user.email, user);
    return decryptUserSecrets(user);
  }
  await user.save();
  return user;
}

let connectPromise = null;

async function connectDB(uri = config.mongodbUri) {
  if (isLocalMongoUri(uri)) {
    if (config.isProduction && config.isVercel) {
      console.error('[DB] MONGODB_URI not set on Vercel — using in-memory store.');
    }
    setMemoryMode(true);
    dbConnected = false;
    return false;
  }
  if (mongoose.connection.readyState === 1) {
    setMemoryMode(false);
    dbConnected = true;
    return true;
  }
  if (connectPromise) return connectPromise;

  const options = {
    serverSelectionTimeoutMS: 8000,
    ...(uri.startsWith('mongodb+srv') && { tls: true, retryWrites: true, w: 'majority' }),
  };

  connectPromise = mongoose.connect(uri, options)
    .then(() => {
      console.log('[DB] Connected to MongoDB (TLS in transit)');
      setMemoryMode(false);
      dbConnected = true;
      return true;
    })
    .catch((err) => {
      console.warn('[DB] MongoDB unavailable:', err.message);
      setMemoryMode(true);
      dbConnected = false;
      connectPromise = null;
      return false;
    });

  return connectPromise;
}

function getDbStatus() {
  return {
    mode: useMemory ? 'memory' : 'mongodb',
    connected: isDbConnected(),
    encryptionAtRest: useMemory ? false : 'mongodb-atlas-default',
    fieldEncryption: require('../utils/fieldCrypto').isEncryptionConfigured(),
  };
}

module.exports = {
  UserModel,
  connectDB,
  setMemoryMode,
  isMemoryMode,
  isDbConnected,
  getDbStatus,
  findByEmail,
  findById,
  createUser,
  updateUser,
};
