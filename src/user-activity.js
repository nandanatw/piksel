const { query } = require('./db');

/**
 * Log user activity
 * @param {string} email - User email
 * @param {string} action - Action type
 * @param {object} req - Express request object
 * @param {object} metadata - Additional data
 */
async function logActivity(email, action, req, metadata = {}) {
  if (!email || !action) return;
  
  try {
    const ip = req?.ip || req?.headers?.[process.env.TRUST_PROXY ? 'x-forwarded-for' : 'x-real-ip'] || null;
    const userAgent = req?.get('user-agent') || null;
    
    await query(
      'INSERT INTO user_activity_log(email, action, ip, user_agent, metadata) VALUES($1, $2, $3, $4, $5)',
      [email, action, ip, userAgent, metadata]
    );
  } catch (e) {
    console.error('User activity log failed:', e.message);
    // Fail silently to not break user operations
  }
}

/**
 * Get user activity history
 * @param {string} email - User email
 * @param {number} limit - Max records to return
 */
async function getActivity(email, limit = 50) {
  const result = await query(
    'SELECT action, ip, user_agent AS "userAgent", metadata, created_at AS "createdAt" FROM user_activity_log WHERE email=$1 ORDER BY created_at DESC LIMIT $2',
    [email, limit]
  );
  return result.rows;
}

/**
 * Get recent activity across all users (admin)
 */
async function getRecentActivity(limit = 100) {
  const result = await query(
    'SELECT email, action, ip, user_agent AS "userAgent", metadata, created_at AS "createdAt" FROM user_activity_log ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  return result.rows;
}

/**
 * Get activity by action type
 */
async function getActivityByAction(action, limit = 100) {
  const result = await query(
    'SELECT email, action, ip, user_agent AS "userAgent", metadata, created_at AS "createdAt" FROM user_activity_log WHERE action=$1 ORDER BY created_at DESC LIMIT $2',
    [action, limit]
  );
  return result.rows;
}

/**
 * Get suspicious activity (multiple IPs, high frequency)
 */
async function getSuspiciousActivity(hours = 24) {
  const result = await query(
    `SELECT email, COUNT(DISTINCT ip) AS ip_count, COUNT(*) AS action_count, 
            array_agg(DISTINCT ip::text) AS ips,
            array_agg(DISTINCT action) AS actions
     FROM user_activity_log 
     WHERE created_at > now() - interval '${parseInt(hours)} hours'
     GROUP BY email
     HAVING COUNT(DISTINCT ip) > 3 OR COUNT(*) > 100
     ORDER BY action_count DESC
     LIMIT 50`,
    []
  );
  return result.rows;
}

module.exports = { logActivity, getActivity, getRecentActivity, getActivityByAction, getSuspiciousActivity };
