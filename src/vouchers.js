const { query } = require('./db');

async function redeem(code, email) {
  const client = await require('./db').pool.connect();
  try {
    await client.query('BEGIN');
    const v = await client.query('SELECT * FROM vouchers WHERE code=$1 AND is_active=true AND used_count < max_uses FOR UPDATE', [code]);
    if (!v.rows[0]) { await client.query('ROLLBACK'); return { error: 'Voucher tidak valid atau sudah habis' }; }
    const voucher = v.rows[0];

    const plans = require('./plans');
    const plan = await plans.getPlan(voucher.plan_slug);
    if (!plan) { await client.query('ROLLBACK'); return { error: 'Plan tidak ditemukan' }; }

    const duration = voucher.duration_days || plan.duration_days;
    await client.query(
      "UPDATE users SET unlimited=true, free_trial=false, unlimited_until=GREATEST(COALESCE(unlimited_until, now()), now()) + ($1 * interval '1 day') WHERE email=$2",
      [duration, email]
    );
    await client.query('UPDATE vouchers SET used_count=used_count+1, updated_at=now() WHERE id=$1', [voucher.id]);
    await client.query('COMMIT');
    return { ok: true, plan: plan.name, days: duration };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function listVouchers() {
  const r = await query('SELECT * FROM vouchers ORDER BY created_at DESC');
  return r.rows;
}

async function createVoucher({ code, planSlug, durationDays, maxUses }) {
  const plans = require('./plans');
  const plan = await plans.getPlan(planSlug);
  if (!plan) throw Object.assign(new Error('Plan not found'), { status: 404 });
  const r = await query(
    'INSERT INTO vouchers(code, plan_slug, duration_days, max_uses) VALUES($1,$2,$3,$4) RETURNING *',
    [code.toUpperCase().replace(/[^A-Z0-9]/g, ''), planSlug, durationDays || plan.duration_days, maxUses || 1]
  );
  return r.rows[0];
}

async function deleteVoucher(id) {
  await query('DELETE FROM vouchers WHERE id=$1', [id]);
}

module.exports = { redeem, listVouchers, createVoucher, deleteVoucher };