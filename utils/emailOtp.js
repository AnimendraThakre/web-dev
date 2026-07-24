const bcrypt = require('bcryptjs');

const EMAIL_OTP_EXPIRY_MS = 5 * 60 * 1000;
const SALT_ROUNDS = 10;

function generateEmailOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function isValidEmailOtp(code) {
  return /^\d{6}$/.test(String(code || '').trim());
}

async function hashEmailOtp(otp) {
  return bcrypt.hash(String(otp), SALT_ROUNDS);
}

async function verifyEmailOtp(code, hash) {
  if (!hash || !isValidEmailOtp(code)) return false;
  return bcrypt.compare(String(code).trim(), hash);
}

function getEmailOtpExpiry() {
  return new Date(Date.now() + EMAIL_OTP_EXPIRY_MS);
}

module.exports = {
  generateEmailOtp,
  isValidEmailOtp,
  hashEmailOtp,
  verifyEmailOtp,
  getEmailOtpExpiry,
  EMAIL_OTP_EXPIRY_MS,
};
