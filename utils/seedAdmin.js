const bcrypt = require('bcryptjs');
const { findByEmail, createUser, updateUser } = require('../models/User');

const SALT_ROUNDS = 10;

/**
 * Create or promote default admin from ADMIN_EMAIL / ADMIN_PASSWORD env vars.
 */
async function ensureDefaultAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = (process.env.ADMIN_PASSWORD || '').trim();
  const fullName = (process.env.ADMIN_FULL_NAME || 'System Admin').trim();

  if (!email || !password) return;

  const existing = await findByEmail(email);
  if (existing) {
    const updates = {};
    if (existing.role !== 'admin') updates.role = 'admin';
    if (existing.isDisabled) updates.isDisabled = false;
    if (Object.keys(updates).length) {
      await updateUser(existing, updates);
      console.log(`[Admin] Promoted ${email} to admin.`);
    }
    return;
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  await createUser({
    fullName,
    email,
    password: hashedPassword,
    role: 'admin',
    isEmailVerified: true,
    mfaEnabled: false,
    totpSecret: null,
    isDisabled: false,
  });
  console.log(`[Admin] Created default admin: ${email} (complete MFA setup on first login).`);
}

module.exports = { ensureDefaultAdmin };
