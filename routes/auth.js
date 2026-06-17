const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { config } = require('../config/env');
const { respondWithError } = require('../middleware/errorHandler');
const { findByEmail, findById, createUser, updateUser } = require('../models/User');
const { sendEmailOtp } = require('../utils/mailer');
const {
  generateEmailOtp,
  isValidEmailOtp,
  hashEmailOtp,
  verifyEmailOtp,
  getEmailOtpExpiry,
} = require('../utils/emailOtp');
const { generateTotpSetup } = require('../utils/totp');
const { logActivity } = require('../models/AuthActivity');

const router = express.Router();
const SALT_ROUNDS = 10;
const ROLES = { USER: 'user', ADMIN: 'admin' };

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 6 && password.length <= 128;
}

function isValidName(name) {
  return typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 100;
}

function getAuthUserId(req) {
  const token = req.cookies?.token;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (payload.type !== 'auth') return null;
    return payload.sub;
  } catch {
    return null;
  }
}

function signToken(userId, type, expiresIn, extra = {}) {
  return jwt.sign({ sub: userId, type, ...extra }, config.jwtMfaSecret, { expiresIn });
}

function signMfaPendingToken(userId, portal = ROLES.USER) {
  return signToken(userId, 'mfa_pending', '10m', { portal });
}

function signVerifyEmailToken(userId) {
  return signToken(userId, 'verify_email_pending', '15m');
}

function signSetupMfaToken(userId) {
  return signToken(userId, 'setup_mfa_pending', '15m');
}

function signAuthToken(user) {
  return jwt.sign(
    {
      sub: user._id,
      email: user.email,
      fullName: user.fullName,
      role: user.role || ROLES.USER,
      type: 'auth',
    },
    config.jwtSecret,
    { expiresIn: '24h' }
  );
}

function getMfaSession(req) {
  const token = req.cookies?.mfa_token;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtMfaSecret);
    if (payload.type !== 'mfa_pending') return null;
    return { userId: payload.sub, portal: payload.portal || ROLES.USER };
  } catch {
    return null;
  }
}

function setCookie(res, name, token, maxAge) {
  res.cookie(name, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    maxAge,
  });
}

function setAuthCookie(res, token) {
  setCookie(res, 'token', token, config.cookieMaxAgeMs);
}

function setMfaPendingCookie(res, token) {
  setCookie(res, 'mfa_token', token, 10 * 60 * 1000);
}

function setVerifyEmailCookie(res, token) {
  setCookie(res, 'verify_email_token', token, 15 * 60 * 1000);
}

function setSetupMfaCookie(res, token) {
  setCookie(res, 'setup_mfa_token', token, 15 * 60 * 1000);
}

function getTokenUserId(req, cookieName, expectedType) {
  const token = req.cookies?.[cookieName];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtMfaSecret);
    if (payload.type !== expectedType) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

/**
 * POST /api/auth/signup
 * Creates inactive account, sends email OTP, redirects to email verification.
 */
router.post('/signup', async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    if (!isValidName(fullName)) {
      return res.status(400).json({ error: 'Full name must be 2–100 characters.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address.' });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: 'Password must be 6–128 characters.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await findByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    const otp = generateEmailOtp();
    const otpHash = await hashEmailOtp(otp);
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await createUser({
      fullName: fullName.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: ROLES.USER,
      isDisabled: false,
      isEmailVerified: false,
      mfaEnabled: false,
      totpSecret: null,
      emailOtpHash: otpHash,
      emailOtpExpiresAt: getEmailOtpExpiry(),
    });

    const mailResult = await sendEmailOtp(user.email, otp, user.fullName);
    setVerifyEmailCookie(res, signVerifyEmailToken(user._id));

    const response = {
      message: mailResult.sent
        ? 'Verification code sent to your email.'
        : 'Account created. Check server console for OTP (dev mode).',
      redirect: '/verify-email.html',
    };
    if (mailResult.devOtp) response.devOtp = mailResult.devOtp;
    res.status(201).json(response);
  } catch (err) {
    respondWithError(res, err, 'Server error during sign up.');
  }
});

/**
 * POST /api/auth/verify-email
 * Verifies email OTP, activates account, generates Google Authenticator QR.
 */
router.post('/verify-email', async (req, res) => {
  try {
    const userId = getTokenUserId(req, 'verify_email_token', 'verify_email_pending');
    if (!userId) {
      return res.status(401).json({ error: 'Verification session expired. Sign up again.' });
    }

    const { code } = req.body;
    if (!isValidEmailOtp(code)) {
      return res.status(400).json({ error: 'Enter a valid 6-digit code.' });
    }

    const user = await findById(userId, { includeEmailOtp: true, includeTotpSecret: true });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    if (user.isEmailVerified) {
      return res.status(400).json({ error: 'Email already verified.' });
    }
    if (!user.emailOtpHash || !user.emailOtpExpiresAt) {
      return res.status(400).json({ error: 'No active code. Request a new one.' });
    }
    if (new Date() > new Date(user.emailOtpExpiresAt)) {
      return res.status(400).json({ error: 'Code expired. Request a new one.' });
    }

    const valid = await verifyEmailOtp(code, user.emailOtpHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid verification code.' });
    }

    const { base32Secret, qrCodeDataUrl } = await generateTotpSetup(user.email);

    await updateUser(user, {
      isEmailVerified: true,
      emailOtpHash: null,
      emailOtpExpiresAt: null,
      totpSecret: base32Secret,
      mfaEnabled: false,
    });

    res.clearCookie('verify_email_token');
    setSetupMfaCookie(res, signSetupMfaToken(user._id));

    res.json({
      message: 'Email verified! Set up Google Authenticator to finish registration.',
      qrCodeDataUrl,
      redirect: '/setup-auth.html',
    });
  } catch (err) {
    respondWithError(res, err, 'Email verification failed.');
  }
});

/** POST /api/auth/resend-email-otp */
router.post('/resend-email-otp', async (req, res) => {
  try {
    const userId = getTokenUserId(req, 'verify_email_token', 'verify_email_pending');
    if (!userId) {
      return res.status(401).json({ error: 'Verification session expired. Sign up again.' });
    }

    const user = await findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.isEmailVerified) {
      return res.status(400).json({ error: 'Email already verified.' });
    }

    const otp = generateEmailOtp();
    const otpHash = await hashEmailOtp(otp);
    await updateUser(user, { emailOtpHash: otpHash, emailOtpExpiresAt: getEmailOtpExpiry() });

    const mailResult = await sendEmailOtp(user.email, otp, user.fullName);
    const response = {
      message: mailResult.sent ? 'New code sent to your email.' : 'New code generated (dev mode).',
    };
    if (mailResult.devOtp) response.devOtp = mailResult.devOtp;
    res.json(response);
  } catch (err) {
    respondWithError(res, err, 'Could not resend code.');
  }
});

/**
 * Shared login handler for user and admin portals (MFA required).
 */
async function handleLogin(req, res, expectedRole) {
  const { email, password } = req.body;

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Password is required.' });
  }

  const user = await findByEmail(email, { includeTotpSecret: true });
  if (!user) {
    await logActivity({
      email: email.trim().toLowerCase(),
      action: 'login_failed',
      role: expectedRole,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      meta: { reason: 'unknown_email' },
    });
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    await logActivity({
      email: user.email,
      userId: user._id,
      action: 'login_failed',
      role: user.role || ROLES.USER,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      meta: { reason: 'bad_password' },
    });
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const userRole = user.role || ROLES.USER;
  if (userRole !== expectedRole) {
    const redirect = expectedRole === ROLES.ADMIN ? '/login.html' : '/admin-login.html';
    const msg = expectedRole === ROLES.ADMIN
      ? 'This account is not an admin. Use user login.'
      : 'Admin accounts must use the admin login page.';
    return res.status(403).json({ error: msg, redirect });
  }

  if (user.isDisabled) {
    await logActivity({
      email: user.email,
      userId: user._id,
      action: 'login_blocked',
      role: userRole,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      meta: { reason: 'disabled' },
    });
    return res.status(403).json({ error: 'Account is disabled. Contact an administrator.' });
  }

  if (!user.isEmailVerified) {
    setVerifyEmailCookie(res, signVerifyEmailToken(user._id));
    return res.status(403).json({
      error: 'Please verify your email first.',
      redirect: '/verify-email.html',
    });
  }

  if (!user.mfaEnabled || !user.totpSecret) {
    setSetupMfaCookie(res, signSetupMfaToken(user._id));
    return res.status(403).json({
      error: 'Please complete Google Authenticator setup.',
      redirect: '/setup-auth.html',
      needsMfaSetup: true,
    });
  }

  const mfaToken = signMfaPendingToken(user._id, expectedRole);
  setMfaPendingCookie(res, mfaToken);

  await logActivity({
    email: user.email,
    userId: user._id,
    action: 'login_password_ok',
    role: userRole,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  const mfaPage = expectedRole === ROLES.ADMIN ? '/admin-mfa.html' : '/mfa.html';
  return res.json({
    message: 'Enter the code from Google Authenticator.',
    mfaRequired: true,
    redirect: mfaPage,
  });
}

/**
 * POST /api/auth/login — User portal only.
 */
router.post('/login', async (req, res) => {
  try {
    await handleLogin(req, res, ROLES.USER);
  } catch (err) {
    respondWithError(res, err, 'Server error during login.');
  }
});

/**
 * POST /api/auth/admin/login — Admin portal only.
 */
router.post('/admin/login', async (req, res) => {
  try {
    await handleLogin(req, res, ROLES.ADMIN);
  } catch (err) {
    respondWithError(res, err, 'Server error during admin login.');
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.clearCookie('mfa_token');
  res.clearCookie('verify_email_token');
  res.clearCookie('setup_mfa_token');
  res.json({ message: 'Logged out successfully.' });
});

/**
 * POST /api/auth/change-password
 * Authenticated users can change their password by providing current password.
 */
router.post('/change-password', async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ error: 'Authentication required.' });

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || typeof currentPassword !== 'string') {
      return res.status(400).json({ error: 'Current password is required.' });
    }
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ error: 'New password must be 6–128 characters.' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'New password must be different from current password.' });
    }

    const user = await findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const validCurrent = await bcrypt.compare(currentPassword, user.password);
    if (!validCurrent) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await updateUser(user, { password: hashedPassword });
    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    respondWithError(res, err, 'Could not change password.');
  }
});

/**
 * POST /api/auth/forgot-password
 * Sends a time-limited OTP to the user's email for password reset.
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address.' });
    }

    const user = await findByEmail(email);
    if (!user) {
      return res.json({
        message: 'If that email is registered, a password reset code has been sent.',
      });
    }

    const otp = generateEmailOtp();
    const otpHash = await hashEmailOtp(otp);
    await updateUser(user, {
      resetOtpHash: otpHash,
      resetOtpExpiresAt: getEmailOtpExpiry(),
    });

    const mailResult = await sendEmailOtp(user.email, otp, user.fullName, {
      subject: 'Password reset code',
      heading: 'Reset your password',
      intro: 'Use this code to reset your password:',
    });

    const response = {
      message: 'If that email is registered, a password reset code has been sent.',
      redirect: '/reset-password.html',
    };
    if (mailResult.devOtp) response.devOtp = mailResult.devOtp;
    res.json(response);
  } catch (err) {
    respondWithError(res, err, 'Could not start password reset.');
  }
});

/**
 * POST /api/auth/reset-password
 * Resets password using email + OTP code.
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address.' });
    }
    if (!isValidEmailOtp(code)) {
      return res.status(400).json({ error: 'Enter a valid 6-digit code.' });
    }
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ error: 'New password must be 6–128 characters.' });
    }

    const user = await findByEmail(email, { includeResetOtp: true });
    if (!user || !user.resetOtpHash || !user.resetOtpExpiresAt) {
      return res.status(400).json({ error: 'Invalid or expired reset session.' });
    }
    if (new Date() > new Date(user.resetOtpExpiresAt)) {
      await updateUser(user, { resetOtpHash: null, resetOtpExpiresAt: null });
      return res.status(400).json({ error: 'Reset code expired. Request a new one.' });
    }

    const valid = await verifyEmailOtp(code, user.resetOtpHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid reset code.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await updateUser(user, {
      password: hashedPassword,
      resetOtpHash: null,
      resetOtpExpiresAt: null,
    });

    res.clearCookie('mfa_token');
    res.clearCookie('token');
    res.json({ message: 'Password reset successful. Please log in again.', redirect: '/login.html' });
  } catch (err) {
    respondWithError(res, err, 'Could not reset password.');
  }
});

router.get('/me', async (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (payload.type !== 'auth') return res.status(401).json({ error: 'Invalid session.' });
    const user = await findById(payload.sub);
    if (!user) return res.status(401).json({ error: 'User not found.' });
    if (user.isDisabled) return res.status(403).json({ error: 'Account is disabled.' });
    res.json({
      fullName: user.fullName,
      email: user.email,
      role: user.role || ROLES.USER,
      isDisabled: Boolean(user.isDisabled),
      isEmailVerified: Boolean(user.isEmailVerified),
      mfaEnabled: Boolean(user.mfaEnabled),
    });
  } catch {
    res.status(401).json({ error: 'Invalid or expired session.' });
  }
});

router.signAuthToken = signAuthToken;
router.setAuthCookie = setAuthCookie;
router.setMfaPendingCookie = setMfaPendingCookie;
router.signMfaPendingToken = signMfaPendingToken;
router.getMfaSession = getMfaSession;
router.ROLES = ROLES;
router.signSetupMfaToken = signSetupMfaToken;
router.setSetupMfaCookie = setSetupMfaCookie;
router.getTokenUserId = getTokenUserId;

module.exports = router;
