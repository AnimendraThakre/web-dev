const db = require('../db/client');

const memoryActivities = [];

function rowToActivity(row) {
  if (!row) return null;
  return {
    _id: row.id,
    email: row.email,
    userId: row.user_id,
    action: row.action,
    role: row.role,
    ip: row.ip,
    userAgent: row.user_agent,
    meta: row.meta,
    createdAt: row.created_at,
  };
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

  if (db.isMemoryMode()) {
    memoryActivities.unshift(entry);
    if (memoryActivities.length > 500) memoryActivities.pop();
    return entry;
  }

  const { rows } = await db.query(
    `INSERT INTO auth_activity (email, user_id, action, role, ip, user_agent, meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, email, user_id, action, role, ip, user_agent, meta, created_at`,
    [
      entry.email,
      entry.userId,
      entry.action,
      entry.role,
      entry.ip,
      entry.userAgent,
      entry.meta ?? null,
    ]
  );
  return rowToActivity(rows[0]);
}

async function listActivities({ limit = 50 } = {}) {
  const cap = Math.min(Math.max(limit, 1), 200);

  if (db.isMemoryMode()) {
    return memoryActivities.slice(0, cap);
  }

  const { rows } = await db.query(
    `SELECT id, email, user_id, action, role, ip, user_agent, meta, created_at
     FROM auth_activity
     ORDER BY created_at DESC
     LIMIT $1`,
    [cap]
  );
  return rows.map(rowToActivity);
}

module.exports = { logActivity, listActivities };
