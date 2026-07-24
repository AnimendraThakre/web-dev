/**
 * Sync .env values to Vercel Production (run: node scripts/sync-vercel-env.js)
 * Skips PORT, NODE_ENV (set NODE_ENV=production explicitly), and comments.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['PORT', 'NODE_ENV']);
const FORCE = new Set([
  'SMTP_PASS', 'SMTP_USER', 'EMAIL_FROM', 'CORS_ORIGIN', 'TOTP_APP_NAME',
  'JWT_SECRET', 'JWT_MFA_SECRET', 'DB_ENCRYPTION_KEY',
]);

const envContent = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const vars = {};

for (const line of envContent.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  let val = trimmed.slice(eq + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!SKIP.has(key)) vars[key] = val;
}

vars.NODE_ENV = 'production';
vars.CORS_ORIGIN = vars.CORS_ORIGIN || 'https://bspproject.vercel.app';
if ((vars.JWT_SECRET || '').length < 16) vars.JWT_SECRET = 'myjwtsecret1234567';
if ((vars.JWT_MFA_SECRET || '').length < 16) vars.JWT_MFA_SECRET = 'mymfasecret123456';

function run(cmd) {
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', shell: true });
}

function removeIfExists(key) {
  try {
    run(`npx vercel env rm ${key} production --yes`);
  } catch {
    /* not set */
  }
}

for (const [key, value] of Object.entries(vars)) {
  if (key === 'MONGODB_URI') {
    console.log(`Skip ${key} (legacy — app uses POSTGRES_URL)`);
    continue;
  }
  if (key === 'POSTGRES_URL' && !value) {
    console.log(`Skip ${key} (add Neon Postgres in Vercel Storage or set manually)`);
    continue;
  }
  if (!value && key !== 'SMTP_SECURE') {
    console.log(`Skip ${key} (empty)`);
    continue;
  }
  console.log(`Set ${key} on Production...`);
  removeIfExists(key);
  const tmp = path.join(ROOT, '.vercel-env-tmp');
  fs.writeFileSync(tmp, value, 'utf8');
  try {
    run(`type "${tmp}" | npx vercel env add ${key} production`);
  } finally {
    fs.unlinkSync(tmp);
  }
}

console.log('\nDone. Redeploy: npx vercel --prod --yes');
