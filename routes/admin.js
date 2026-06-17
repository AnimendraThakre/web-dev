const express = require('express');
const { respondWithError } = require('../middleware/errorHandler');
const { authenticate, requireRole, requireActiveAccount } = require('../middleware/roleAuth');
const { listUsers, findById, updateUser } = require('../models/User');
const { listActivities, logActivity } = require('../models/AuthActivity');

const router = express.Router();

router.use(authenticate, requireRole('admin'), requireActiveAccount);

/** GET /api/admin/users */
router.get('/users', async (req, res) => {
  try {
    const users = await listUsers();
    res.json({ users });
  } catch (err) {
    respondWithError(res, err, 'Could not load users.');
  }
});

/** POST /api/admin/users/:id/disable */
router.post('/users/:id/disable', async (req, res) => {
  try {
    const target = await findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (String(target._id) === String(req.user.sub)) {
      return res.status(400).json({ error: 'You cannot disable your own account.' });
    }
    if (target.role === 'admin') {
      return res.status(400).json({ error: 'Cannot disable another admin account.' });
    }

    await updateUser(target, { isDisabled: true });
    await logActivity({
      email: target.email,
      userId: target._id,
      action: 'account_disabled',
      role: 'admin',
      ip: req.ip,
      userAgent: req.get('user-agent'),
      meta: { byAdmin: req.user.email },
    });

    res.json({ message: `Account ${target.email} has been disabled.` });
  } catch (err) {
    respondWithError(res, err, 'Could not disable account.');
  }
});

/** POST /api/admin/users/:id/enable */
router.post('/users/:id/enable', async (req, res) => {
  try {
    const target = await findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found.' });

    await updateUser(target, { isDisabled: false });
    await logActivity({
      email: target.email,
      userId: target._id,
      action: 'account_enabled',
      role: 'admin',
      ip: req.ip,
      userAgent: req.get('user-agent'),
      meta: { byAdmin: req.user.email },
    });

    res.json({ message: `Account ${target.email} has been enabled.` });
  } catch (err) {
    respondWithError(res, err, 'Could not enable account.');
  }
});

/** GET /api/admin/activity */
router.get('/activity', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const activity = await listActivities({ limit });
    res.json({ activity });
  } catch (err) {
    respondWithError(res, err, 'Could not load activity.');
  }
});

module.exports = router;
