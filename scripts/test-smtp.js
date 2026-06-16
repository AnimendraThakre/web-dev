/**
 * Test SMTP credentials: node scripts/test-smtp.js [recipient@email.com]
 */
require('dotenv').config();
const nodemailer = require('nodemailer');

const user = (process.env.SMTP_USER || '').trim();
const pass = (process.env.SMTP_PASS || '').trim().replace(/^["']|["']$/g, '').replace(/\s+/g, '');
const host = (process.env.SMTP_HOST || '').trim();
const to = process.argv[2] || user;

const missing = [];
if (!host) missing.push('SMTP_HOST');
if (!user) missing.push('SMTP_USER');
if (!pass) missing.push('SMTP_PASS');

if (missing.length) {
  console.error('Missing SMTP config in .env:');
  missing.forEach((k) => console.error(`  - ${k}${k === 'SMTP_PASS' ? ' (Gmail App Password)' : ''}`));
  if (missing.includes('SMTP_PASS') && process.env.SMTP_PASS === '') {
    console.error('\nSMTP_PASS is empty on disk. If you edited .env in the editor, save the file (Ctrl+S) and run again.');
  }
  process.exit(1);
}

const transport = nodemailer.createTransport({
  host,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  requireTLS: process.env.SMTP_SECURE !== 'true',
  auth: { user, pass },
  tls: { minVersion: 'TLSv1.2' },
});

(async () => {
  console.log(`Testing SMTP as ${user} via ${host}...`);
  await transport.verify();
  console.log('SMTP connection OK');

  const info = await transport.sendMail({
    from: (process.env.EMAIL_FROM || user).trim(),
    to,
    subject: 'MFA Auth — SMTP test',
    text: 'If you received this, SMTP is working.',
  });
  console.log('Test email sent:', info.messageId);
  console.log('Recipient:', to);
})().catch((err) => {
  console.error('SMTP test failed:', err.message);
  if (err.code === 'EAUTH') {
    console.error('Tip: Use a Gmail App Password, not your normal Gmail password.');
  }
  process.exit(1);
});
