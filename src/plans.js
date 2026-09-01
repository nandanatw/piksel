const { query } = require('./db');

async function getActivePlans() {
  const r = await query(
    'SELECT * FROM plans WHERE is_active = true ORDER BY sort_order ASC, price_idr ASC'
  );
  return r.rows;
}

async function getAllPlans() {
  const r = await query(
    'SELECT * FROM plans ORDER BY sort_order ASC, price_idr ASC'
  );
  return r.rows;
}

async function getPlan(slug) {
  const r = await query('SELECT * FROM plans WHERE slug = $1', [slug]);
  return r.rows[0] || null;
}

async function createPlan({ slug, name, durationDays, priceIdr, compareAtIdr, badge, description, features, sortOrder, isActive }) {
  const r = await query(
    `INSERT INTO plans (slug, name, duration_days, price_idr, compare_at_idr, badge, description, features, sort_order, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [slug, name, durationDays, priceIdr, compareAtIdr || null, badge || null, description || '', features || [], sortOrder || 0, isActive !== false]
  );
  return r.rows[0];
}

async function updatePlan(slug, { name, durationDays, priceIdr, compareAtIdr, badge, description, features, sortOrder, isActive }) {
  const r = await query(
    `UPDATE plans SET
       name = COALESCE($2, name),
       duration_days = COALESCE($3, duration_days),
       price_idr = COALESCE($4, price_idr),
       compare_at_idr = $5,
       badge = $6,
       description = COALESCE($7, description),
       features = COALESCE($8, features),
       sort_order = COALESCE($9, sort_order),
       is_active = COALESCE($10, is_active),
       updated_at = now()
     WHERE slug = $1 RETURNING *`,
    [slug, name, durationDays, priceIdr, compareAtIdr, badge, description, features, sortOrder, isActive]
  );
  return r.rows[0] || null;
}

async function deletePlan(slug) {
  const r = await query('DELETE FROM plans WHERE slug = $1 RETURNING *', [slug]);
  return r.rows[0] || null;
}

module.exports = { getActivePlans, getAllPlans, getPlan, createPlan, updatePlan, deletePlan };