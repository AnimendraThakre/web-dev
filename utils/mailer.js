const nodemailer = require('nodemailer');

/** Strip wrapping quotes Vercel/users sometimes include in env values. */
function cleanEnv(value) {
  let v = (value || '').trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

/** Gmail app passwords are 16 chars; Google often displays them with spaces. */
function normalizeSmtpPass(pass) {
  return cleanEnv(pass).replace(/\s+/g, '');
}

function getSmtpUser() {
  return cleanEnv(process.env.SMTP_USER);
}

function getSmtpPass() {
  return normalizeSmtpPass(process.env.SMTP_PASS);
}

function isSmtpConfigured() {
  const user = getSmtpUser();
  const pass = getSmtpPass();
  const host = cleanEnv(process.env.SMTP_HOST);
  const service = cleanEnv(process.env.SMTP_SERVICE);
  return Boolean(user && pass && (host || service));
}

function createTransporter() {
  const user = getSmtpUser();
  const pass = getSmtpPass();
  const host = cleanEnv(process.env.SMTP_HOST) || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === 'true';

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
    tls: { minVersion: 'TLSv1.2' },
  });
}

function getTransporter() {
  // Fresh transporter on Vercel — cached connections often fail across invocations
  if (process.env.VERCEL) {
    return createTransporter();
  }
  if (!global._mailTransporter) {
    global._mailTransporter = createTransporter();
  }
  return global._mailTransporter;
}

async function verifySmtpConnection() {
  if (!isSmtpConfigured()) {
    console.warn('[Mail] SMTP not configured — OTP will print in the server console (dev only).');
    return false;
  }

  try {
    const transport = getTransporter();
    await transport.verify();
    console.log(`[Mail] SMTP ready — sending from ${getEmailFrom()}`);
    return true;
  } catch (err) {
    console.error('[Mail] SMTP connection failed:', err.message);
    if (String(err.message).includes('535') || String(err.message).includes('BadCredentials')) {
      console.error('[Mail] Gmail rejected credentials. Use a Google App Password (not your normal password).');
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
  return cleanEnv(process.env.EMAIL_FROM) || getSmtpUser();
}

function smtpStatus() {
  const user = getSmtpUser();
  return {
    configured: isSmtpConfigured(),
    host: cleanEnv(process.env.SMTP_HOST) || 'smtp.gmail.com',
    user: user ? user.replace(/(.{2}).*(@.*)/, '$1***$2') : null,
    onVercel: Boolean(process.env.VERCEL),
  };
}

async function sendOtpEmail(to, otp, fullName, { isResend = false } = {}) {
  const from = getEmailFrom();
  const { subject, text, html } = buildOtpEmailContent(otp, fullName, isResend);

  if (!isSmtpConfigured()) {
    console.log(`[DEV] OTP for ${to}: ${otp} (SMTP not configured)`);
    return { sent: false, devOtp: process.env.NODE_ENV !== 'production' ? otp : undefined };
  }

  try {
    const transport = getTransporter();
    await transport.sendMail({ from, to, subject, text, html });
    console.log(`[Mail] OTP sent to ${to}`);
    return { sent: true };
  } catch (err) {
    console.error(`[Mail] Failed to send OTP to ${to}:`, err.message);
    console.error('[Mail] SMTP status:', JSON.stringify(smtpStatus()));

    if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
      console.log(`[DEV] Fallback OTP for ${to}: ${otp}`);
      return { sent: false, devOtp: otp };
    }

    if (String(err.message).includes('535') || String(err.message).includes('BadCredentials')) {
      throw new Error(
        'Gmail rejected SMTP login. On Vercel, set SMTP_USER and SMTP_PASS (App Password) in Environment Variables — no quotes.'
      );
    }

    throw new Error(
      'Could not send verification email. Add SMTP variables in Vercel Settings → Environment Variables, then redeploy.'
    );
  }
}

module.exports = {
  isSmtpConfigured,
  verifySmtpConnection,
  sendOtpEmail,
  smtpStatus,
};
