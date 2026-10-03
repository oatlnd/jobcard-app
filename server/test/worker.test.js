// Integration test for the notification worker. Needs DATABASE_URL pointing at a seeded test DB.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, query } from '../src/db.js';
import { processBatch, queueServiceReminders } from '../src/worker.js';
import { render } from '../src/lib/notify.js';
import { normalizeMobile, normalizeRegNo } from '../src/lib/util.js';
import { computeTotals } from '../src/lib/jobs.js';

after(() => pool.end());

test('mobile and reg normalisation', () => {
  assert.equal(normalizeMobile('077 123 4567'), '94771234567');
  assert.equal(normalizeMobile('+94 77 123 4567'), '94771234567');
  assert.equal(normalizeMobile('771234567'), '94771234567');
  assert.equal(normalizeMobile('12345'), null);
  assert.equal(normalizeRegNo('np bci-1234'), 'NPBCI1234');
});

test('totals with discount and tax', () => {
  const t = computeTotals([{ item_type: 'part', line_total: 1000 }, { item_type: 'labour', line_total: 500 }], 100, 10);
  assert.deepEqual([t.subtotal, t.discount, t.tax_amount, t.total], [1500, 100, 140, 1540]);
});

test('templates render in Tamil', () => {
  const s = render('ready', 'ta', { name: 'Arun', reg_no: 'NPBCJ4521', total: '4,950.00', shop: 'Ratnam', phone: '021' });
  assert.match(s, /Arun/);
  assert.match(s, /தயாராக/);
});

test('worker sends queued messages (console provider)', async () => {
  const n = await processBatch(50);
  assert.ok(n >= 0);
  const { rows } = await query(`SELECT count(*)::int AS q FROM notifications WHERE status IN ('QUEUED','SENDING') AND send_after <= now()`);
  assert.equal(rows[0].q, 0);
});

test('service reminders are queued once per due date', async () => {
  await query(`UPDATE bikes SET reminder_sent_for = NULL WHERE next_service_due_date IS NOT NULL`);
  const first = await queueServiceReminders({ ignoreHours: true });
  const second = await queueServiceReminders({ ignoreHours: true });
  assert.ok(first >= 1, 'expected at least one reminder');
  assert.equal(second, 0);
});
