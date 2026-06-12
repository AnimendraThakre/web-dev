require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { connectDB } = require('./models/User');
const { smtpStatus } = require('./utils/mailer');

const authRoutes = require('./routes/auth');
const otpRoutes = require('./routes/otp');

const app = express();

app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, smtp: smtpStatus() });
});

let dbReady = false;

async function ensureDb() {
  if (!dbReady) {
    await connectDB(process.env.MONGODB_URI);
    dbReady = true;
  }
}

app.use('/api', (req, res, next) => {
  ensureDb()
    .then(() => next())
    .catch((err) => {
      console.error('Database connection error:', err.message);
      res.status(503).json({ error: 'Database unavailable. Check MONGODB_URI.' });
    });
});

app.use('/api', (req, res, next) => {
  if (!process.env.JWT_SECRET || !process.env.JWT_MFA_SECRET) {
    return res.status(503).json({
      error: 'Server misconfigured. Set JWT_SECRET and JWT_MFA_SECRET in Vercel environment variables.',
    });
  }
  next();
});

function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type !== 'auth') {
      return res.status(401).json({ error: 'Invalid session.' });
    }
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session.' });
  }
}

app.use('/api/auth', authRoutes);
app.use('/api/otp', otpRoutes);

app.get('/api/protected/dashboard', requireAuth, (req, res) => {
  res.json({
    message: 'Welcome to your dashboard',
    fullName: req.user.fullName,
    email: req.user.email,
  });
});

app.get('/', (req, res) => {
  res.redirect('/login.html');
});

app.use((req, res) => {
  if (!res.headersSent) {
    res.status(404).json({ error: 'Not found.' });
  }
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = app;
