const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { findById, updateUser } = require('../models/User');
const { sendOtpEmail } = require('../utils/mailer');
const authRouter = require('./auth');

const router = express.Router();

function getMfaUserId(req) {
  const token = req.cookies?.mfa_token;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, process.env.JWT_MFA_SECRET);
    if (payload.type !== 'mfa_pending') return null;
    return payload.sub;
  } catch {
    return null;
  }
}

// POST /api/otp/verify
router.post('/verify', async (req, res) => {
  try {
    const userId = getMfaUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'MFA session expired. Please log in again.' });
    }

    const { otp } = req.body;
    if (!otp || !/^\d{6}$/.test(String(otp).trim())) {
      return res.status(400).json({ error: 'Enter a valid 6-digit code.' });
    }

    const user = await findById(userId);
    if (!user || !user.otp || !user.otpExpiresAt) {
      return res.status(400).json({ error: 'No active verification code. Log in again.' });
    }

    if (new Date() > new Date(user.otpExpiresAt)) {
      await updateUser(user, { otp: null, otpExpiresAt: null });
      return res.status(400).json({ error: 'Code expired. Please log in again.' });
    }

    const valid = await bcrypt.compare(String(otp).trim(), user.otp);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid verification code.' });
    }

    await updateUser(user, { otp: null, otpExpiresAt: null });

    const authToken = authRouter.signAuthToken(user);
    authRouter.setAuthCookie(res, authToken);
    res.clearCookie('mfa_token');

    res.json({
      message: 'Verification successful.',
      redirect: '/dashboard.html',
    });
  } catch (err) {
    console.error('OTP verify error:', err);
    res.status(500).json({ error: 'Server error during verification.' });
  }
});

// POST /api/otp/resend
router.post('/resend', async (req, res) => {
  try {
    const userId = getMfaUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'MFA session expired. Please log in again.' });
    }

    const user = await findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpHash = await bcrypt.hash(otp, 10);
    const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await updateUser(user, { otp: otpHash, otpExpiresAt });

    const mailResult = await sendOtpEmail(user.email, otp, user.fullName, { isResend: true });

    const response = {
      message: mailResult.sent
        ? 'New code sent to your email.'
        : 'New code generated (check server console — SMTP not configured).',
    };
    if (mailResult.devOtp) {
      response.devOtp = mailResult.devOtp;
    }
    res.json(response);
  } catch (err) {
    console.error('OTP resend error:', err);
    const status = err.message?.includes('verification email') ? 503 : 500;
    res.status(status).json({
      error: err.message || 'Could not resend code.',
    });
  }
});

module.exports = router;
