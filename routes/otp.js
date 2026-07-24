const express = require('express');
const jwt = require('jsonwebtoken');
const { config } = require('../config/env');
const { respondWithError } = require('../middleware/errorHandler');
const { findById, updateUser } = require('../models/User');
const { verifyTotpCode, isValidTotpToken, generateTotpSetup, qrFromSecret } = require('../utils/totp');
const authRouter = require('./auth');
const { ACTIONS, logAuthEvent } = require('../utils/activityLogger');

const router = express.Router();

function getMfaSession(req) {
  return authRouter.getMfaSession(req);
}

function getSetupMfaUserId(req) {
  return authRouter.getTokenUserId(req, 'setup_mfa_token', 'setup_mfa_pending');
}

function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (payload.type !== 'auth') return res.status(401).json({ error: 'Invalid session.' });
    req.userId = payload.sub;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session.' });
  }
}

/**
 * GET /api/otp/setup-info — QR for users completing setup after login redirect
 */
router.get('/setup-info', async (req, res) => {
  try {
    const userId = getSetupMfaUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Setup session expired. Log in again.' });
    }

    const user = await findById(userId, { includeTotpSecret: true });
    if (!user || !user.isEmailVerified) {
      return res.status(400).json({ error: 'Complete email verification first.' });
    }
    if (user.mfaEnabled) {
      return res.status(400).json({ error: 'MFA already enabled.' });
    }

    let qrCodeDataUrl;
    if (user.totpSecret) {
      qrCodeDataUrl = await qrFromSecret(user.email, user.totpSecret);
    } else {
      const setup = await generateTotpSetup(user.email);
      await updateUser(user, { totpSecret: setup.base32Secret });
      qrCodeDataUrl = setup.qrCodeDataUrl;
    }

    res.json({ qrCodeDataUrl, message: 'Scan the QR code with Google Authenticator.' });
  } catch (err) {
    respondWithError(res, err, 'Could not load MFA setup.');
  }
});

/**
 * POST /api/otp/enable-setup — Confirm first TOTP after registration email verify
 */
router.post('/enable-setup', async (req, res) => {
  try {
    const userId = getSetupMfaUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Setup session expired. Log in again.' });
    }

    const { code } = req.body;
    if (!isValidTotpToken(code)) {
      return res.status(400).json({ error: 'Enter a valid 6-digit code.' });
    }

    const user = await findById(userId, { includeTotpSecret: true });
    if (!user || !user.isEmailVerified) {
      return res.status(400).json({ error: 'Complete email verification first.' });
    }
    if (!user.totpSecret) {
      return res.status(400).json({ error: 'MFA setup not started.' });
    }

    const valid = verifyTotpCode(user.totpSecret, code);
    if (!valid) {
      await logAuthEvent(req, {
        email: user.email,
        userId: user._id,
        action: ACTIONS.MFA_SETUP_FAILED,
        role: user.role || authRouter.ROLES.USER,
        meta: { step: 'enable_setup' },
      });
      return res.status(401).json({ error: 'Invalid code. Check Google Authenticator.' });
    }

    await updateUser(user, { mfaEnabled: true });
    res.clearCookie('setup_mfa_token');

    await logAuthEvent(req, {
      email: user.email,
      userId: user._id,
      action: ACTIONS.MFA_SETUP_SUCCESS,
      role: user.role || authRouter.ROLES.USER,
    });

    res.json({
      message: 'Google Authenticator enabled! You can log in now.',
      redirect: '/login.html',
    });
  } catch (err) {
    respondWithError(res, err, 'Could not enable MFA.');
  }
});

/** POST /api/otp/setup — Dashboard: regenerate QR for logged-in users (existing feature) */
router.post('/setup', requireAuth, async (req, res) => {
  try {
    const user = await findById(req.userId, { includeTotpSecret: true });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (!user.isEmailVerified) {
      return res.status(400).json({ error: 'Verify your email first.' });
    }
    if (user.mfaEnabled) {
      return res.status(400).json({ error: 'MFA is already enabled.' });
    }

    const { base32Secret, qrCodeDataUrl } = await generateTotpSetup(user.email);
    await updateUser(user, { totpSecret: base32Secret, mfaEnabled: false });

    res.json({
      message: 'Scan the QR code with Google Authenticator.',
      qrCodeDataUrl,
    });
  } catch (err) {
    respondWithError(res, err, 'Could not start MFA setup.');
  }
});

/** POST /api/otp/enable — Dashboard: enable MFA for logged-in users (existing feature) */
router.post('/enable', requireAuth, async (req, res) => {
  try {
    const { code } = req.body;
    if (!isValidTotpToken(code)) {
      return res.status(400).json({ error: 'Enter a valid 6-digit code.' });
    }

    const user = await findById(req.userId, { includeTotpSecret: true });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.mfaEnabled) return res.status(400).json({ error: 'MFA is already enabled.' });
    if (!user.totpSecret) return res.status(400).json({ error: 'Start MFA setup first.' });

    const valid = verifyTotpCode(user.totpSecret, code);
    if (!valid) {
      await logAuthEvent(req, {
        email: user.email,
        userId: user._id,
        action: ACTIONS.MFA_SETUP_FAILED,
        role: req.user.role || authRouter.ROLES.USER,
        meta: { step: 'dashboard_enable' },
      });
      return res.status(401).json({ error: 'Invalid code. Check Google Authenticator.' });
    }

    await updateUser(user, { mfaEnabled: true });
    await logAuthEvent(req, {
      email: user.email,
      userId: user._id,
      action: ACTIONS.MFA_ENABLED,
      role: user.role || authRouter.ROLES.USER,
    });
    res.json({ message: 'Google Authenticator MFA enabled successfully.' });
  } catch (err) {
    respondWithError(res, err, 'Could not enable MFA.');
  }
});

/** POST /api/otp/verify — Login step 2: TOTP verification */
router.post('/verify', async (req, res) => {
  try {
    const session = getMfaSession(req);
    if (!session) {
      return res.status(401).json({ error: 'MFA session expired. Please log in again.' });
    }

    const { otp, code } = req.body;
    const token = otp || code;
    if (!isValidTotpToken(token)) {
      return res.status(400).json({ error: 'Enter a valid 6-digit code.' });
    }

    const user = await findById(session.userId, { includeTotpSecret: true });
    if (!user || !user.isEmailVerified || !user.mfaEnabled || !user.totpSecret) {
      return res.status(400).json({ error: 'MFA is not configured for this account.' });
    }
    if (user.isDisabled) {
      return res.status(403).json({ error: 'Account is disabled.' });
    }

    const userRole = user.role || authRouter.ROLES.USER;
    if (userRole !== session.portal) {
      return res.status(403).json({ error: 'Invalid login portal for this account.' });
    }

    const valid = verifyTotpCode(user.totpSecret, token);
    if (!valid) {
      await logAuthEvent(req, {
        email: user.email,
        userId: user._id,
        action: ACTIONS.MFA_FAILED,
        role: userRole,
        meta: { portal: session.portal },
      });
      return res.status(401).json({ error: 'Invalid authenticator code.' });
    }

    const authToken = authRouter.signAuthToken(user);
    authRouter.setAuthCookie(res, authToken);
    res.clearCookie('mfa_token');

    await logAuthEvent(req, {
      email: user.email,
      userId: user._id,
      action: ACTIONS.LOGIN_SUCCESS,
      role: userRole,
      meta: { portal: session.portal },
    });

    const redirect = session.portal === authRouter.ROLES.ADMIN
      ? '/admin-dashboard.html'
      : '/dashboard.html';

    res.json({
      message: 'Verification successful.',
      redirect,
      role: userRole,
    });
  } catch (err) {
    respondWithError(res, err, 'Server error during verification.');
  }
});

module.exports = router;
