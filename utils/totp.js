const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

const TOTP_OPTIONS = {
  encoding: 'base32',
  algorithm: 'sha1',
  digits: 6,
  step: 30,
  window: 1, // ±30 seconds for clock drift
};

const APP_NAME = require('../config/env').config.totpAppName;

/**
 * Generate a new TOTP secret and QR code for Google Authenticator setup.
 */
async function generateTotpSetup(email) {
  const secret = speakeasy.generateSecret({
    name: `${APP_NAME} (${email})`,
    issuer: APP_NAME,
    length: 20,
  });

  const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url);

  return {
    base32Secret: secret.base32,
    qrCodeDataUrl,
  };
}

/** Build QR from an existing base32 secret (e.g. after email verification). */
async function qrFromSecret(email, base32Secret) {
  const otpauthUrl = speakeasy.otpauthURL({
    secret: base32Secret,
    label: `${APP_NAME} (${email})`,
    issuer: APP_NAME,
    encoding: 'base32',
  });
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
  return qrCodeDataUrl;
}

/**
 * Verify a 6-digit TOTP code against the user's stored base32 secret.
 */
function verifyTotpCode(secret, token) {
  if (!secret || !token) return false;
  return speakeasy.totp.verify({
    secret,
    token: String(token).trim(),
    ...TOTP_OPTIONS,
  });
}

function isValidTotpToken(token) {
  return /^\d{6}$/.test(String(token || '').trim());
}

module.exports = {
  generateTotpSetup,
  qrFromSecret,
  verifyTotpCode,
  isValidTotpToken,
  TOTP_OPTIONS,
};
