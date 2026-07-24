const jwt = require('jsonwebtoken');
const { config } = require('../config/env');
const { findById } = require('../models/User');

/**
 * Verify JWT session cookie and attach payload to req.user.
 */
function authenticate(req, res, next) {
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
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }
}

/**
 * Restrict route to one or more roles (user | admin).
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const role = req.user.role || 'user';
    if (!roles.includes(role)) {
      return res.status(403).json({ error: 'Access denied for your role.' });
    }
    next();
  };
}

/**
 * Ensure account is not disabled (re-check DB on sensitive routes).
 */
function requireActiveAccount(req, res, next) {
  findById(req.user.sub)
    .then((user) => {
      if (!user) return res.status(401).json({ error: 'User not found.' });
      if (user.isDisabled) return res.status(403).json({ error: 'Account is disabled.' });
      req.dbUser = user;
      next();
    })
    .catch(next);
}

module.exports = { authenticate, requireRole, requireActiveAccount };
