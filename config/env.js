/**
 * Centralized environment configuration and validation.
 * All secrets are read from process.env — never hard-coded.
 */

const isProduction = process.env.NODE_ENV === 'production';
const isVercel = Boolean(process.env.VERCEL);

const config = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction,
  isVercel,

  jwtSecret: process.env.JWT_SECRET || '',
  jwtMfaSecret: process.env.JWT_MFA_SECRET || '',
  cookieMaxAgeMs: Number(process.env.COOKIE_MAX_AGE_MS) || 86400000,

  mongodbUri: (process.env.MONGODB_URI || '').trim(),
  dbEncryptionKey: (process.env.DB_ENCRYPTION_KEY || '').trim(),

  totpAppName: (process.env.TOTP_APP_NAME || 'MFA Auth').trim(),
  corsOrigin: (process.env.CORS_ORIGIN || '').trim(),
};

function isLocalMongoUri(uri) {
  return !uri || uri.includes('127.0.0.1') || uri.includes('localhost');
}

function isAtlasUri(uri) {
  return uri.startsWith('mongodb+srv://') || uri.startsWith('mongodb://');
}

/**
 * Validate required environment variables.
 * Production/Vercel enforces stricter rules (Atlas + encryption key).
 */
function validateEnv({ exitOnError = false } = {}) {
  const errors = [];
  const warnings = [];

  const minLen = isProduction || isVercel ? 16 : 8;

  if (!config.jwtSecret || config.jwtSecret.length < minLen) {
    errors.push(`JWT_SECRET must be set and at least ${minLen} characters.`);
  }
  if (!config.jwtMfaSecret || config.jwtMfaSecret.length < minLen) {
    errors.push(`JWT_MFA_SECRET must be set and at least ${minLen} characters.`);
  }

  if (isProduction || isVercel) {
    if (!config.dbEncryptionKey) {
      errors.push('DB_ENCRYPTION_KEY is required in production (64-char hex recommended).');
    } else if (!/^[0-9a-f]{64}$/i.test(config.dbEncryptionKey)) {
      warnings.push('DB_ENCRYPTION_KEY should be a 64-character hex string (32 bytes).');
    }

    if (isLocalMongoUri(config.mongodbUri)) {
      if (isVercel) {
        warnings.push(
          'MONGODB_URI not set on Vercel — using in-memory store (data resets between invocations). Add Atlas URI for persistence.'
        );
      } else {
        errors.push(
          'MONGODB_URI must be a MongoDB Atlas connection string in production (mongodb+srv://...).'
        );
      }
    } else if (!isAtlasUri(config.mongodbUri)) {
      errors.push('MONGODB_URI format is invalid.');
    }
  } else {
    if (isLocalMongoUri(config.mongodbUri)) {
      warnings.push('MONGODB_URI not set — using in-memory database (dev only).');
    }
    if (!config.dbEncryptionKey) {
      warnings.push('DB_ENCRYPTION_KEY not set — mfaSecret stored without field encryption (dev only).');
    }
  }

  if (errors.length) {
    console.error('[Config] Environment validation failed:');
    errors.forEach((e) => console.error(`  - ${e}`));
    if (exitOnError) process.exit(1);
  }
  if (warnings.length) {
    console.warn('[Config] Warnings:');
    warnings.forEach((w) => console.warn(`  - ${w}`));
  }

  return { valid: errors.length === 0, errors, warnings, config };
}

module.exports = {
  config,
  validateEnv,
  isLocalMongoUri,
  isAtlasUri,
};
