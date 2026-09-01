const { query } = require('./db');

const SECRET = /key|secret|password|token|authorization|cookie/i;

function redact(value, depth = 0) {
  if (depth > 5 || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map(item => redact(item, depth + 1));
  if (typeof value !== 'object') return typeof value === 'string' && value.length > 1000 ? value.slice(0, 1000) : value;
  const output = {};
  for (const [key, item] of Object.entries(value)) output[key] = SECRET.test(key) ? '[REDACTED]' : redact(item, depth + 1);
  return output;
}

async function record(req, action, targetType, targetId, metadata = {}) {
  try {
    await query(
      'INSERT INTO admin_audit_log(actor,action,target_type,target_id,metadata,ip) VALUES($1,$2,$3,$4,$5,$6)',
      [req?.user?.email || req?.user?.role || 'admin', action, targetType || null, targetId == null ? null : String(targetId), JSON.stringify(redact(metadata)), req?.ip || null]
    );
  } catch (error) {
    console.error('Audit write failed:', error.message);
  }
}

module.exports = { record, redact };
