const crypto = require('crypto');
const { query, withTransaction } = require('./db');
const { config } = require('./config');
const audit = require('./audit');

async function createTopup(email, amount) {
  amount = Number(amount);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100000) { const err = new Error('Credits must be an integer between 1 and 100000'); err.status = 400; throw err; }
  const total = amount * config.CREDIT_PRICE_IDR;
  const ref = 'TOPUP_' + crypto.randomBytes(18).toString('base64url');
  await query('INSERT INTO payments(order_id,email,credits,expected_amount,product_type) VALUES($1,$2,$3,$4,$5)', [ref, email, amount, total, 'credits']);
  const pakasirKey = process.env.PAKASIR_API_KEY;
  const project = process.env.PAKASIR_PROJECT;
  if (pakasirKey) {
    if (!project) { const err = new Error('PAKASIR_PROJECT is not configured'); err.status = 500; throw err; }
    try {
      const resp = await fetch('https://app.pakasir.com/api/transactioncreate/qris', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, order_id: ref, amount: total, api_key: pakasirKey }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.payment) { const err = new Error('Pakasir transaction failed'); err.status = 502; throw err; }
      return { qr_string: data.payment.payment_number, paymentUrl: buildPaymentUrl(project, total, ref), reference: ref, amount: total, credits: amount, expired_at: data.payment.expired_at };
    } catch (e) {
      if (e.status) throw e;
      throw new Error('Payment gateway error: ' + e.message);
    }
  }
  return { reference: ref, amount: total, credits: amount, note: 'PAKASIR_API_KEY not set - manual mode' };
}

function buildPaymentUrl(project, amount, orderId) {
  const redirect = `${config.PUBLIC_APP_URL.replace(/\/$/, '')}/payments?order_id=${encodeURIComponent(orderId)}`;
  return `https://app.pakasir.com/pay/${encodeURIComponent(project)}/${amount}?order_id=${encodeURIComponent(orderId)}&qris_only=1&redirect=${encodeURIComponent(redirect)}`;
}

async function createUnlimited30(email) {
  return createSubscription(email, 'unlimited_30d');
}

async function createUnlimited7(email) {
  return createSubscription(email, 'unlimited_7d');
}

async function createSubscription(email, planSlug) {
  const plans = require('./plans');
  const plan = await plans.getPlan(planSlug);
  if (!plan) { const err = new Error('Plan not found'); err.status = 404; throw err; }
  if (!plan.is_active) { const err = new Error('Plan is not available'); err.status = 400; throw err; }
  const amount = plan.price_idr;
  const ref = 'UNLIMITED_' + crypto.randomBytes(18).toString('base64url');
  await query('INSERT INTO payments(order_id,email,credits,expected_amount,product_type,plan_days) VALUES($1,$2,$3,$4,$5,$6)', [ref, email, 1, amount, plan.slug, plan.duration_days]);
  const pakasirKey = process.env.PAKASIR_API_KEY;
  const project = process.env.PAKASIR_PROJECT;
  if (!pakasirKey || !project) { const err = new Error('Real payment is not configured'); err.status = 503; throw err; }
  try {
    const resp = await fetch('https://app.pakasir.com/api/transactioncreate/qris', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, order_id: ref, amount, api_key: pakasirKey }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.payment) { const err = new Error('Pakasir transaction failed'); err.status = 502; throw err; }
    return { qr_string: data.payment.payment_number, paymentUrl: buildPaymentUrl(project, amount, ref), reference: ref, amount, productType: plan.slug, planDays: plan.duration_days, expired_at: data.payment.expired_at };
  } catch (e) {
    if (e.status) throw e;
    throw new Error('Payment gateway error: ' + e.message);
  }
}

async function verifyPaymentStatus(order_id, amount) {
  const pakasirKey = process.env.PAKASIR_API_KEY;
  const project = process.env.PAKASIR_PROJECT;
  if (!pakasirKey || !project) return null;

  try {
    const params = new URLSearchParams({
      project,
      order_id,
      amount: String(amount),
      api_key: pakasirKey
    });
    const resp = await fetch(`https://app.pakasir.com/api/transactiondetail?${params}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.transaction || null;
  } catch (e) {
    console.error('Pakasir verification failed:', e.message);
    return null;
  }
}

async function processWebhook(order_id, status, amount) {
  const failedStatuses = new Set(['failed', 'expired', 'cancelled']);
  if (status !== 'completed' && !failedStatuses.has(status)) { const err = new Error('Unsupported payment status'); err.status = 400; throw err; }
  const ref = order_id;
  if (!ref || (!ref.startsWith('TOPUP_') && !ref.startsWith('UNLIMITED_')) || !Number.isSafeInteger(Number(amount))) { const err = new Error('Invalid payment'); err.status = 400; throw err; }

  // Double-check with Pakasir API (recommended by Pakasir docs)
  const verification = status === 'completed' ? await verifyPaymentStatus(ref, amount) : null;
  if (status === 'completed' && (!verification || verification.status !== 'completed')) {
    const err = new Error('Payment verification failed: status not completed');
    err.status = 400;
    throw err;
  }

  return withTransaction(async (client) => {
    const payment = await client.query('SELECT * FROM payments WHERE order_id=$1 FOR UPDATE', [ref]);
    if (!payment.rows[0]) { const err = new Error('Unknown order'); err.status = 404; throw err; }
    if (payment.rows[0].status === 'completed') return { ok: true, duplicate: true };
    if (Number(amount) !== payment.rows[0].expected_amount) { const err = new Error('Payment amount mismatch'); err.status = 400; throw err; }
    if (status !== 'completed') {
      const localStatus = status === 'expired' ? 'expired' : status === 'cancelled' ? 'cancelled' : 'failed';
      await client.query('UPDATE payments SET status=$2,paid_amount=$3 WHERE order_id=$1', [ref, localStatus, Number(amount)]);
      return { ok: true, status: localStatus };
    }
    const paymentRow = payment.rows[0];
    const credits = paymentRow.credits;
    const userEmail = payment.rows[0].email;
    await client.query("UPDATE payments SET status='completed',paid_amount=$2,completed_at=now() WHERE order_id=$1", [ref, Number(amount)]);
    if (paymentRow.product_type && paymentRow.product_type.startsWith('unlimited_')) {
      await client.query(
        "UPDATE users SET unlimited=true, free_trial=false, unlimited_until=GREATEST(COALESCE(unlimited_until, now()), now()) + ($2 * interval '1 day') WHERE email=$1",
        [userEmail, paymentRow.plan_days]
      );
    } else {
      const credited = await client.query(
          'UPDATE users SET credits = credits + $2, total_credits = total_credits + $2 WHERE email = $1 RETURNING email',
          [userEmail, credits]
        );
      if (credited.rows[0]) await client.query("INSERT INTO transactions(email, type, amount, reason) VALUES($1, 'credit', $2, $3)", [userEmail, credits, 'pakasir_qris']);
    }
    
    // Audit trail for payment completion
    await audit.record({ ip: null, user: { email: userEmail } }, 'payment.completed', 'payment', ref, { productType: paymentRow.product_type, planDays: paymentRow.plan_days, credits, amount: Number(amount), provider: 'pakasir' });
    
    return { ok: true };
  });
}

async function listPayments(email, page = 1, limit = 50) {
  // Keep user and admin ledgers in sync when the provider webhook is delayed.
  await expirePendingPayments();
  await reconcilePendingPayments(email);
  const params = email ? [email, limit, (page - 1) * limit] : [limit, (page - 1) * limit];
  const where = email ? 'WHERE email=$1' : '';
  const li = email ? 2 : 1;
  const [items, count] = await Promise.all([
    query(`SELECT order_id AS "orderId",email,credits,expected_amount AS "amount",paid_amount AS "paidAmount",status,provider,product_type AS "productType",plan_days AS "planDays",created_at AS "createdAt",completed_at AS "completedAt" FROM payments ${where} ORDER BY created_at DESC LIMIT $${li} OFFSET $${li + 1}`, params),
    query(`SELECT count(*)::int AS total FROM payments ${where}`, email ? [email] : []),
  ]);
  return { items: items.rows, total: count.rows[0].total, page, limit };
}

async function reconcilePendingPayments(email = null, max = 20) {
  await expirePendingPayments();
  const params = email ? [email, max] : [max];
  const where = email
    ? "WHERE email=$1 AND status='pending' AND created_at > now() - interval '7 days'"
    : "WHERE status='pending' AND created_at > now() - interval '7 days'";
  const limitParam = email ? '$2' : '$1';
  const { rows } = await query(
    `SELECT order_id, expected_amount FROM payments ${where} ORDER BY created_at DESC LIMIT ${limitParam}`,
    params
  );
  await Promise.all(rows.map(async (row) => {
    try {
      const verification = await verifyPaymentStatus(row.order_id, row.expected_amount);
      if (verification?.status && verification.status !== 'pending') {
        await processWebhook(row.order_id, verification.status, verification.amount || row.expected_amount);
      }
    } catch (error) {
      console.error('Payment reconciliation failed:', row.order_id, error.message);
    }
  }));
}

async function expirePendingPayments() {
  const result = await query(
    "UPDATE payments SET status='expired' WHERE status='pending' AND created_at <= now() - interval '30 minutes' RETURNING order_id",
    []
  );
  return result.rowCount || 0;
}

async function getPayment(email, orderId) {
  await expirePendingPayments();
  const { rows } = await query(
    `SELECT order_id AS "orderId",email,credits,expected_amount AS "amount",paid_amount AS "paidAmount",status,provider,product_type AS "productType",plan_days AS "planDays",created_at AS "createdAt",completed_at AS "completedAt" FROM payments WHERE order_id=$1 AND email=$2`,
    [orderId, email]
  );
  const payment = rows[0] || null;
  if (!payment || payment.status !== 'pending') return payment;
  const verification = await verifyPaymentStatus(orderId, payment.amount);
  if (verification?.status && verification.status !== 'pending') {
    await processWebhook(orderId, verification.status, verification.amount || payment.amount);
    const refreshed = await query(
      `SELECT order_id AS "orderId",email,credits,expected_amount AS "amount",paid_amount AS "paidAmount",status,provider,product_type AS "productType",plan_days AS "planDays",created_at AS "createdAt",completed_at AS "completedAt" FROM payments WHERE order_id=$1 AND email=$2`,
      [orderId, email]
    );
    return refreshed.rows[0] || payment;
  }
  return payment;
}

async function cancelPayment(order_id, amount) {
  const pakasirKey = process.env.PAKASIR_API_KEY;
  const project = process.env.PAKASIR_PROJECT;
  if (!pakasirKey || !project) {
    const err = new Error('PAKASIR_API_KEY or PAKASIR_PROJECT not configured');
    err.status = 500;
    throw err;
  }

  try {
    const resp = await fetch('https://app.pakasir.com/api/transactioncancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, order_id, amount: Number(amount), api_key: pakasirKey }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      const err = new Error('Pakasir cancel failed: ' + (data.error || 'Unknown error'));
      err.status = 502;
      throw err;
    }
    
    // Update local database
    const result = await query("UPDATE payments SET status='cancelled' WHERE order_id=$1 RETURNING email", [order_id]);
    
    // Audit trail for payment cancellation
    if (result.rows[0]) {
      await audit.record({ ip: null, user: { email: result.rows[0].email } }, 'payment.cancelled', 'payment', order_id, { amount: Number(amount) });
    }
    
    return { ok: true, cancelled: true };
  } catch (e) {
    if (e.status) throw e;
    throw new Error('Payment gateway error: ' + e.message);
  }
}

module.exports = { createTopup, createUnlimited30, createUnlimited7, createSubscription, processWebhook, listPayments, reconcilePendingPayments, expirePendingPayments, getPayment, verifyPaymentStatus, cancelPayment };
