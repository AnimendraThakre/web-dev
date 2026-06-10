const nodemailer = require('nodemailer');

let transporter = null;
let verified = false;

/** Gmail app passwords are 16 chars; Google often displays them with spaces. */
function normalizeSmtpPass(pass) {
  return (pass || '').trim().replace(/\s+/g, '');
}

function getSmtpUser() {
  return (process.env.SMTP_USER || '').trim();
}

function getSmtpPass() {
  return normalizeSmtpPass(process.env.SMTP_PASS);
}

function isSmtpConfigured() {
  const user = getSmtpUser();
  const pass = getSmtpPass();
  const service = (process.env.SMTP_SERVICE || '').trim();
  const host = (process.env.SMTP_HOST || '').trim();
  return Boolean(user && pass && (service || host));
}

function createTransporter() {
  const user = getSmtpUser();
  const pass = getSmtpPass();

  // Explicit host/port is more reliable for Gmail than the "service" shorthand
  const host = (process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === 'true';

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { minVersion: 'TLSv1.2' },
  });
}

function getTransporter() {
  if (!isSmtpConfigured()) return null;
  if (!transporter) {
    transporter = createTransporter();
    verified = false;
  }
  return transporter;
}

async function verifySmtpConnection() {
  if (!isSmtpConfigured()) {
    console.warn('[Mail] SMTP not configured — OTP will print in the server console (dev only).');
    return false;
  }

  try {
    const transport = getTransporter();
    await transport.verify();
    verified = true;
    console.log(`[Mail] SMTP ready — emails will be sent from ${process.env.EMAIL_FROM || process.env.SMTP_USER}`);
    return true;
  } catch (err) {
    verified = false;
    console.error('[Mail] SMTP connection failed:', err.message);
    if (String(err.message).includes('535') || String(err.message).includes('BadCredentials')) {
      console.error('[Mail] Gmail rejected the login. Fix:');
      console.error('  1. Enable 2-Step Verification on your Google account');
      console.error('  2. Create a new App Password: https://myaccount.google.com/apppasswords');
      console.error('  3. Put the 16-character password in .env as SMTP_PASS (spaces are OK)');
    }
    return false;
  }
}

function buildOtpEmailContent(otp, fullName, isResend) {
  const subject = isResend ? 'Your new verification code' : 'Your verification code';
  const greeting = fullName ? `Hello ${fullName}` : 'Hello';

  const text = `${greeting},

Your MFA verification code is: ${otp}

This code expires in 5 minutes.

If you did not request this, you can safely ignore this email.`;

  const html = `
    <div style="font-family:Segoe UI,Tahoma,sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#333;margin-top:0">Two-Factor Verification</h2>
      <p>${greeting},</p>
      <p>Your verification code is:</p>
      <p style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#007bff;margin:16px 0">${otp}</p>
      <p style="color:#666">This code expires in <strong>5 minutes</strong>.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
      <p style="color:#999;font-size:12px">If you did not request this code, ignore this email.</p>
    </div>
  `;

  return { subject, text, html };
}

function getEmailFrom() {
  let from = (process.env.EMAIL_FROM || getSmtpUser()).trim();
  if ((from.startsWith('"') && from.endsWith('"')) || (from.startsWith("'") && from.endsWith("'"))) {
    from = from.slice(1, -1);
  }
  return from;
}

async function sendOtpEmail(to, otp, fullName, { isResend = false } = {}) {
  const from = getEmailFrom();
  const { subject, text, html } = buildOtpEmailContent(otp, fullName, isResend);

  if (!isSmtpConfigured()) {
    console.log(`[DEV] OTP for ${to}: ${otp} (SMTP not configured)`);
    return { sent: false, devOtp: process.env.NODE_ENV !== 'production' ? otp : undefined };
  }

  const transport = getTransporter();

  try {
    await transport.sendMail({ from, to, subject, text, html });
    console.log(`[Mail] OTP sent to ${to}`);
    return { sent: true };
  } catch (err) {
    console.error(`[Mail] Failed to send OTP to ${to}:`, err.message);
    throw new Error('Could not send verification email. Check SMTP settings and try again.');
  }
}

module.exports = {
  isSmtpConfigured,
  verifySmtpConnection,
  sendOtpEmail,
};
