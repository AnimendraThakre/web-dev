/**
 * Quick SMTP test — run: node scripts/test-email.js
 * Does not print your password.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { verifySmtpConnection, isSmtpConfigured } = require('../utils/mailer');

async function main() {
  if (!isSmtpConfigured()) {
    console.error('SMTP not configured. Set SMTP_USER and SMTP_PASS in .env');
    process.exit(1);
  }
  const user = (process.env.SMTP_USER || '').trim();
  const passLen = (process.env.SMTP_PASS || '').replace(/\s+/g, '').length;
  console.log(`Testing SMTP as ${user} (password length: ${passLen} chars)`);
  const ok = await verifySmtpConnection();
  process.exit(ok ? 0 : 1);
}

main();
