const nodemailer = require('nodemailer');
const { config } = require('../config/env');

function isSmtpConfigured() {
  const user = (process.env.SMTP_USER || '').trim();
  const pass = normalizeSmtpPass(process.env.SMTP_PASS);
  const host = (process.env.SMTP_HOST || '').trim();
  return Boolean(user && pass && host);
}

function normalizeSmtpPass(pass) {
  return (pass || '').trim().replace(/^["']|["']$/g, '').replace(/\s+/g, '');
}

function getTransporter() {
  if (!isSmtpConfigured()) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST.trim(),
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    requireTLS: process.env.SMTP_SECURE !== 'true',
    auth: {
      user: process.env.SMTP_USER.trim(),
      pass: normalizeSmtpPass(process.env.SMTP_PASS),
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: { minVersion: 'TLSv1.2' },
  });
}

function formatSmtpError(err) {
  const code = err.code || err.responseCode;
  if (code === 'EAUTH' || String(err.response || '').includes('535')) {
    return 'SMTP authentication failed. Use a Gmail App Password (not your normal password).';
  }
  if (code === 'ECONNECTION' || code === 'ETIMEDOUT') {
    return 'Could not connect to SMTP server. Check SMTP_HOST and SMTP_PORT.';
  }
  return err.message || 'Failed to send email.';
}

async function sendEmailOtp(to, otp, fullName) {
  const from = (process.env.EMAIL_FROM || process.env.SMTP_USER || '').trim().replace(/^["']|["']$/g, '');
  const greeting = fullName ? `Hello ${fullName}` : 'Hello';

  const text = `${greeting},

Your email verification code is: ${otp}

This code expires in 5 minutes.

If you did not create an account, ignore this email.`;

  const html = `
    <div style="font-family:Segoe UI,sans-serif;max-width:480px;padding:24px">
      <h2>Verify your email</h2>
      <p>${greeting},</p>
      <p>Your verification code is:</p>
      <p style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#007bff">${otp}</p>
      <p style="color:#666">Expires in <strong>5 minutes</strong>.</p>
    </div>
  `;

  if (!isSmtpConfigured()) {
    console.warn('[SMTP] Not configured — OTP logged to console instead of email.');
    console.log(`[DEV] Email OTP for ${to}: ${otp}`);
    return { sent: false, devOtp: config.isProduction ? undefined : otp };
  }

  const transport = getTransporter();
  try {
    await transport.sendMail({ from, to, subject: 'Verify your email address', text, html });
    console.log(`[SMTP] Verification email sent to ${to}`);
    return { sent: true };
  } catch (err) {
    console.error('[SMTP] Send failed:', err.message);
    const smtpError = new Error(formatSmtpError(err));
    smtpError.cause = err;
    throw smtpError;
  }
}

function logSmtpStatus() {
  if (isSmtpConfigured()) {
    console.log(`[SMTP] Configured (${process.env.SMTP_HOST}, user: ${process.env.SMTP_USER.trim()})`);
  } else {
    console.warn('[SMTP] Not configured — add SMTP_USER and SMTP_PASS to .env to send real emails.');
  }
}

module.exports = { sendEmailOtp, isSmtpConfigured, logSmtpStatus };
