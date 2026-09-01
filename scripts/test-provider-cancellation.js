'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const fixturePath = path.join(__dirname, 'test-fixtures', 'fake-renoise-cli.js');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kreasya-provider-cancel-'));
const cliLog = path.join(testDir, 'cli.log');

process.env.RENOISE_CLI_PATH = fixturePath;
process.env.FAKE_CLI_LOG = cliLog;
process.env.POOL_BALANCE_REFRESH_MS = '3600000';
process.env.MAX_KEY_RETRIES = '1';
process.env.STORAGE_DIR = path.join(testDir, 'storage');

const poolModule = require('../src/pool');
const fakeKey = { id: 987654321, email: 'test', key: 'fake-provider-key', balance: 100, exhausted: false, healthStatus: 'healthy' };
poolModule.listKeys = async () => [{ ...fakeKey }];
poolModule.refreshCredits = async () => [{ ...fakeKey }];
poolModule.selectBestKey = entries => entries[0];
poolModule.releaseKey = () => {};
poolModule.consumeBalance = async () => 94;
poolModule.markExhausted = async () => {};

const generation = require('../src/generation');
const { query, pool } = require('../src/db');

async function waitFor(check, message, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(message);
}

async function runCancellationScenario(mode) {
  process.env.FAKE_CANCEL_MODE = mode;
  const suffix = `${mode}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `provider-cancel-${suffix}@example.test`;
  const taskId = `provider-cancel-${suffix}`;
  const prompt = `prompt-exact-${suffix}`;

  await query('INSERT INTO users(email,credits,total_credits) VALUES($1,0,0)', [email]);
  await query(
    "INSERT INTO image_tasks(task_id,email,status,prompt,model,ratio,resolution,cost) VALUES($1,$2,'queued',$3,'seedream-5-0-pro','1:1','1k',6)",
    [taskId, email, prompt]
  );
  generation.pendingTasks.set(taskId, { taskId, email, status: 'queued', prompt, model: 'seedream-5-0-pro', ratio: '1:1', resolution: '1k', cost: 6, createdAt: new Date().toISOString() });
  assert.equal(generation.enqueueGeneration({ taskId, email, prompt, model: 'seedream-5-0-pro', ratio: '1:1', resolution: '1k', refFiles: [] }), true);

  await waitFor(async () => (await query('SELECT provider_task_id FROM image_tasks WHERE task_id=$1', [taskId])).rows[0]?.provider_task_id, 'Provider task ID was not persisted');
  const started = Date.now();
  const outcome = await generation.cancelTask(taskId, email);
  const finished = await waitFor(async () => {
    const row = (await query('SELECT * FROM image_tasks WHERE task_id=$1', [taskId])).rows[0];
    return row?.status === 'cancelled' ? row : null;
  }, 'Local task did not reach cancelled status');
  const elapsed = Date.now() - started;
  const refundState = await waitFor(async () => {
    const user = (await query('SELECT credits FROM users WHERE email=$1', [email])).rows[0];
    const refunds = (await query("SELECT count(*)::int AS count FROM transactions WHERE email=$1 AND reason='cancel_refund'", [email])).rows[0];
    return user?.credits === 6 && refunds.count === 1 ? { user, refunds } : null;
  }, 'Cancellation refund did not finish');

  assert.equal(refundState.user.credits, 6, 'Credits must be refunded');
  assert.equal(refundState.refunds.count, 1, 'Refund must happen exactly once');
  assert.ok(finished.provider_cancel_requested_at, 'Provider cancellation request must be recorded');
  if (mode === 'reject') {
    assert.equal(outcome.providerCancellation.cancelled, false);
    assert.equal(finished.provider_cancelled_at, null);
    assert.match(finished.provider_cancel_error, /already running/);
    assert.ok(elapsed >= 550, 'Rejected provider cancel must retain the existing wait fallback');
  } else {
    assert.equal(outcome.providerCancellation.cancelled, true);
    assert.ok(finished.provider_cancelled_at);
    assert.ok(elapsed < 650, 'Accepted provider cancel must abort the local wait promptly');
  }

  generation.pendingTasks.delete(taskId);
  await query('DELETE FROM users WHERE email=$1', [email]);
}

async function main() {
  fs.chmodSync(fixturePath, 0o755);
  await runCancellationScenario('accept');
  await runCancellationScenario('reject');

  process.env.FAKE_CANCEL_MODE = 'accept';
  const prompt = 'normal prompt must pass unchanged -- with symbols & spacing';
  const result = await generation.generateImage(prompt, 'seedream-5-0-pro', '1:1', '1k', []);
  assert.equal(result.prompt, prompt);
  assert.equal(result.model, 'seedream-5-0-pro');
  assert.equal(result.ratio, '1:1');
  const calls = fs.readFileSync(cliLog, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const createCall = calls.find(args => args[0] === 'task' && args[1] === 'create' && args.includes(prompt));
  assert.ok(createCall, 'Normal prompt must be forwarded unchanged to task create');
  assert.ok(calls.some(args => args[0] === 'task' && args[1] === 'cancel'), 'Provider cancel command must be invoked');
  console.log('Provider cancellation integration tests passed');
}

main()
  .catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await query("DELETE FROM users WHERE email LIKE 'provider-cancel-%@example.test'").catch(() => {});
    await pool.end();
    fs.rmSync(testDir, { recursive: true, force: true });
    process.exit(process.exitCode || 0);
  });
