const helmet = require('helmet');
const cors = require('cors');
const { config } = require('../config/env');

/**
 * Security headers via helmet (API + static).
 * CSP is relaxed for inline scripts on static HTML pages.
 */
function applyHelmet(app) {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );
}

/**
 * CORS — credentials enabled for HTTP-only auth cookies.
 * Set CORS_ORIGIN on Vercel to your deployment URL.
 */
function applyCors(app) {
  const allowedOrigins = config.corsOrigin
    ? config.corsOrigin.split(',').map((o) => o.trim())
    : true;

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins === true) {
          return callback(null, true);
        }
        if (Array.isArray(allowedOrigins) && allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type'],
    })
  );
}

function applySecurityMiddleware(app) {
  applyHelmet(app);
  applyCors(app);
}

module.exports = { applySecurityMiddleware, applyHelmet, applyCors };
