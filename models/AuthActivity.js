const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema(
  {
    email: { type: String, trim: true, lowercase: true },
    userId: { type: String, default: null },
    action: { type: String, required: true, trim: true },
    role: { type: String, enum: ['user', 'admin', 'system'], default: 'user' },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

const ActivityModel = mongoose.models.AuthActivity || mongoose.model('AuthActivity', activitySchema);

const memoryActivities = [];

function isMemoryMode() {
  return require('./User').isMemoryMode();
}

async function logActivity({ email, userId, action, role = 'user', ip, userAgent, meta }) {
  const entry = {
    email: email || null,
    userId: userId ? String(userId) : null,
    action,
    role,
    ip: ip || null,
    userAgent: userAgent || null,
    meta: meta || null,
    createdAt: new Date(),
  };

  if (isMemoryMode()) {
    memoryActivities.unshift(entry);
    if (memoryActivities.length > 500) memoryActivities.pop();
    return entry;
  }

  return ActivityModel.create(entry);
}

async function listActivities({ limit = 50 } = {}) {
  const cap = Math.min(Math.max(limit, 1), 200);
  if (isMemoryMode()) {
    return memoryActivities.slice(0, cap);
  }
  return ActivityModel.find().sort({ createdAt: -1 }).limit(cap).lean();
}

module.exports = { ActivityModel, logActivity, listActivities };
