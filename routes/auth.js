const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sendOtpEmail } = require('../utils/mailer');
const { findByEmail, findById, createUser, updateUser } = require('../models/User');

const router = express.Router();
const SALT_ROUNDS = 10;
const OTP_EXPIRY_MS = 5 * 60 * 1000;

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 6 && password.length <= 128;
}

function isValidName(name) {
  return typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 100;
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function signMfaPendingToken(userId) {
  return jwt.sign(
    { sub: userId, type: 'mfa_pending' },
    process.env.JWT_MFA_SECRET,
    { expiresIn: '10m' }
  );
}

function signAuthToken(user) {
  return jwt.sign(
    {
      sub: user._id,
      email: user.email,
      fullName: user.fullName,
      type: 'auth',
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
}

function setAuthCookie(res, token) {
  const maxAge = Number(process.env.COOKIE_MAX_AGE_MS) || 86400000;
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
  });
}

function setMfaPendingCookie(res, token) {
  res.cookie('mfa_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000,
  });
}

// POST /api/auth/signup
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

    const existing = await findByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    await createUser({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      password: hashed,
    });

    res.status(201).json({ message: 'Account created successfully. You can log in now.' });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Email already registered.' });
    }
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Server error during sign up.' });
  }
});

// POST /api/auth/login — password only; issues MFA pending, sends OTP
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address.' });
    }
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Password is required.' });
    }

    const user = await findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, SALT_ROUNDS);
    const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    await updateUser(user, { otp: otpHash, otpExpiresAt });

    const mailResult = await sendOtpEmail(user.email, otp, user.fullName);

    const mfaToken = signMfaPendingToken(user._id);
    setMfaPendingCookie(res, mfaToken);

    const response = {
      message: mailResult.sent
        ? 'Verification code sent to your email.'
        : 'Verification code generated (check server console — SMTP not configured).',
      redirect: '/mfa.html',
    };
    if (mailResult.devOtp) {
      response.devOtp = mailResult.devOtp;
    }
    res.json(response);
  } catch (err) {
    console.error('Login error:', err);
    const status = err.message?.includes('verification email') ? 503 : 500;
    res.status(status).json({
      error: err.message || 'Server error during login.',
    });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.clearCookie('mfa_token');
  res.json({ message: 'Logged out successfully.' });
});

// GET /api/auth/me — current authenticated user
router.get('/me', async (req, res) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type !== 'auth') {
      return res.status(401).json({ error: 'Invalid session.' });
    }
    const user = await findById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'User not found.' });
    }
    res.json({
      fullName: user.fullName,
      email: user.email,
    });
  } catch {
    res.status(401).json({ error: 'Invalid or expired session.' });
  }
});

// Export helpers for otp route
router.signAuthToken = signAuthToken;
router.setAuthCookie = setAuthCookie;

module.exports = router;
