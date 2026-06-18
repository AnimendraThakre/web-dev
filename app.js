require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const { config, validateEnv } = require('./config/env');
const { applySecurityMiddleware } = require('./middleware/security');
const { globalErrorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { connectDB, getDbStatus } = require('./models/User');

const authRoutes = require('./routes/auth');
const otpRoutes = require('./routes/otp');

// Validate env once at module load (Vercel serverless + local)
const envCheck = validateEnv();

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

applySecurityMiddleware(app);

app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

let dbReady = false;

async function ensureDb() {
  if (!dbReady) {
    await connectDB();
    dbReady = true;
  }
}

// Health check — no auth required (connects DB so status is accurate)
app.get('/api/health', (req, res) => {
  ensureDb()
    .then(() => {
      res.json({
        ok: envCheck.valid,
        mfa: 'totp',
        database: getDbStatus(),
        environment: config.nodeEnv,
      });
    })
    .catch(() => {
      res.status(503).json({
        ok: false,
        mfa: 'totp',
        database: getDbStatus(),
        environment: config.nodeEnv,
        error: 'Database unavailable.',
      });
    });
});

// Block API if env validation failed (production safety)
app.use('/api', (req, res, next) => {
  if (!envCheck.valid) {
    return res.status(503).json({
      error: 'Server misconfigured. Check environment variables.',
    });
  }
  next();
});

app.use('/api', (req, res, next) => {
  ensureDb()
    .then(() => next())
    .catch(() => {
      res.status(503).json({ error: 'Database unavailable. Try again later.' });
    });
});

function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret);
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
app.use('/api/admin', require('./routes/admin'));

app.get('/api/protected/dashboard', requireAuth, (req, res) => {
  res.json({
    message: 'Welcome to your dashboard',
    fullName: req.user.fullName,
    email: req.user.email,
  });
});

// Friendly URLs → static HTML pages (no .html in address bar)
const htmlPages = [
  'login',
  'admin-login',
  'dashboard',
  'admin-dashboard',
  'admin-mfa',
  'verify-email',
  'setup-auth',
  'mfa',
  'forgot-password',
  'reset-password',
  'change-password',
];
htmlPages.forEach((page) => {
  app.get(`/${page}`, (req, res) => {
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    res.redirect(302, `/${page}.html${qs}`);
  });
});

app.use(notFoundHandler);
app.use(globalErrorHandler);

module.exports = app;
