const { logActivity } = require('../models/AuthActivity');

/** Standard action names for the admin activity log */
const ACTIONS = {
  SIGNUP: 'signup',
  SIGNUP_FAILED: 'signup_failed',
  VERIFY_EMAIL_SUCCESS: 'verify_email_success',
  VERIFY_EMAIL_FAILED: 'verify_email_failed',
  RESEND_EMAIL_OTP: 'resend_email_otp',
  MFA_SETUP_SUCCESS: 'mfa_setup_success',
  MFA_SETUP_FAILED: 'mfa_setup_failed',
  MFA_ENABLED: 'mfa_enabled',
  LOGIN_FAILED: 'login_failed',
  LOGIN_WRONG_PORTAL: 'login_wrong_portal',
  LOGIN_BLOCKED: 'login_blocked',
  LOGIN_PASSWORD_OK: 'login_password_ok',
  MFA_FAILED: 'mfa_failed',
  LOGIN_SUCCESS: 'login_success',
  LOGOUT: 'logout',
  CHANGE_PASSWORD_SUCCESS: 'change_password_success',
  CHANGE_PASSWORD_FAILED: 'change_password_failed',
  FORGOT_PASSWORD: 'forgot_password',
  RESET_PASSWORD_SUCCESS: 'reset_password_success',
  RESET_PASSWORD_FAILED: 'reset_password_failed',
  ACCOUNT_DISABLED: 'account_disabled',
  ACCOUNT_ENABLED: 'account_enabled',
};

function logAuthEvent(req, { email, userId, action, role = 'user', meta }) {
  return logActivity({
    email: email || null,
    userId: userId ? String(userId) : null,
    action,
    role,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    meta: meta || null,
  });
}

module.exports = { ACTIONS, logAuthEvent };
