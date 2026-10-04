// End-to-end API test. Needs a freshly seeded database and the API running on $API (default http://localhost:3000).
//   npm run seed && npm start   (in another terminal)   then: npm run test:api
import { test } from 'node:test';
import assert from 'node:assert/strict';

const API = (process.env.API || 'http://localhost:3000') + '/api';
const tokens = {};
async function call(user, method, path, body) {
  if (!tokens[user]) {
    const pw = { admin: 'admin123', advisor: 'advisor123', kumar: 'mech123', store: 'store123', accounts: 'accounts123', cashier: 'cashier123' }[user];
    const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: user, password: pw }) });
    tokens[user] = (await r.json()).token;
  }
  const r = await fetch(API + path, {
    method,
    headers: { authorization: `Bearer ${tokens[user]}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}
const ok = (res) => { assert.ok(res.status < 300, `${res.status} ${JSON.stringify(res.data)}`); return res.data; };

let jobId;
test('job card with multiple services, parts and custom lines', async () => {
  const st = ok(await call('advisor', 'GET', '/masters/service-types'));
  const parts = ok(await call('advisor', 'GET', '/parts'));
  const svc = st.filter((s) => ['Periodic Service', 'Oil Change'].includes(s.name));
  const job = ok(await call('advisor', 'POST', '/jobs', {
    customer: { name: 'API Test', mobile: '0771112222', preferred_lang: 'en' },
    bike: { reg_no: 'NP ZZZ-0001', model: 'Dio', year: 2020 },
    odometer: 12000,
    items: [
      ...svc.map((s) => ({ item_type: 'service', service_type_id: s.id })),
      { item_type: 'service', service_type_id: st.find((s) => s.name === 'Wash & Polish').id, unit_price: 500 },
      { item_type: 'part', part_id: parts[0].id, qty: 2 },
      { item_type: 'custom_service', description: 'Horn wiring fix', unit_price: 750 },
      { item_type: 'custom_part', description: 'Customer-supplied bulb fitting', unit_price: 100 },
    ],
  }));
  jobId = job.id;
  assert.equal(job.items.length, 6);
  assert.equal(job.status, 'CHECKED_IN');
  assert.equal(job.delivery_status, 'PENDING');
  const expected = 2500 + 500 + 500 + parts[0].unit_price * 2 + 750 + 100;
  assert.equal(job.totals.total, expected);
  // duplicate service blocked
  const dup = await call('advisor', 'POST', `/jobs/${jobId}/items`, { item_type: 'service', service_type_id: svc[0].id });
  assert.equal(dup.status, 409);
  // edit amount inline
  const line = job.items.find((i) => i.description === 'Horn wiring fix');
  const upd = ok(await call('advisor', 'PATCH', `/jobs/${jobId}/items/${line.id}`, { unit_price: 900 }));
  assert.equal(upd.totals.total, expected + 150);
});

test('mechanic sees no prices and cannot pass QA', async () => {
  const j = ok(await call('kumar', 'GET', `/jobs/${jobId}`));
  assert.equal(j.totals, undefined);
  assert.equal(j.items[0].unit_price, undefined);
  ok(await call('kumar', 'POST', `/jobs/${jobId}/status`, { status: 'IN_PROGRESS' }));
  ok(await call('kumar', 'POST', `/jobs/${jobId}/status`, { status: 'QA_CHECK' }));
  const qa = await call('kumar', 'POST', `/jobs/${jobId}/status`, { status: 'COMPLETED' });
  assert.equal(qa.status, 403);
  const list = ok(await call('kumar', 'GET', '/jobs?open=1'));
  assert.ok(list.every((r) => r.items_total === undefined));
});

test('job status and delivery status are separate', async () => {
  const j = ok(await call('advisor', 'POST', `/jobs/${jobId}/status`, { status: 'COMPLETED' }));
  assert.equal(j.delivery_status, 'READY');
  const noInv = await call('advisor', 'POST', `/jobs/${jobId}/delivery`, { delivery_status: 'DELIVERED' });
  assert.equal(noInv.status, 400);
  const inv = ok(await call('advisor', 'POST', `/jobs/${jobId}/invoice`));
  ok(await call('advisor', 'POST', `/invoices/${inv.invoice.id}/payment`, { amount: inv.invoice.total, method: 'Cash' }));
  ok(await call('advisor', 'POST', `/jobs/${jobId}/delivery`, { delivery_status: 'OUT_FOR_DELIVERY', note: 'Sent with Lavan' }));
  const done = ok(await call('advisor', 'POST', `/jobs/${jobId}/delivery`, { delivery_status: 'DELIVERED', delivered_to: 'API Test' }));
  assert.equal(done.delivery_status, 'DELIVERED');
  assert.ok(done.bike.next_service_due_date);
  const closed = await call('advisor', 'POST', `/jobs/${jobId}/status`, { status: 'IN_PROGRESS' });
  assert.equal(closed.status, 400);
});

test('roles & permissions can be changed by admin only', async () => {
  const { roles } = ok(await call('admin', 'GET', '/users/roles'));
  const mech = roles.find((r) => r.name === 'Mechanic');
  assert.equal((await call('advisor', 'PUT', `/users/roles/${mech.id}`, { name: 'Mechanic', permissions: [] })).status, 403);
  ok(await call('admin', 'PUT', `/users/roles/${mech.id}`, { name: 'Mechanic', description: mech.description, permissions: [...mech.permissions, 'jobs.qa'] }));
  const admin = roles.find((r) => r.is_system);
  assert.equal((await call('admin', 'PUT', `/users/roles/${admin.id}`, { name: 'Admin', permissions: [] })).status, 400);
  ok(await call('admin', 'PUT', `/users/roles/${mech.id}`, { name: 'Mechanic', description: mech.description, permissions: mech.permissions }));
});

test('purchase order → partial GRN → full GRN updates stock and cost', async () => {
  const pos = ok(await call('store', 'GET', '/purchasing/purchase-orders'));
  const po = ok(await call('store', 'GET', `/purchasing/purchase-orders/${pos[0].id}`));
  const line = po.items[0];
  const before = ok(await call('store', 'GET', '/parts')).find((p) => p.id === line.part_id).stock_qty;
  const g1 = ok(await call('store', 'POST', '/purchasing/grns', {
    po_id: po.id, supplier_id: po.supplier_id, supplier_invoice_no: 'INV-555',
    items: po.items.map((i, k) => ({ po_item_id: i.id, description: i.description, qty_received: k === 0 ? 4 : 0, unit_cost: i.unit_cost + 50 })),
  }));
  assert.match(g1.grn_no, /^GRN/);
  assert.equal(ok(await call('store', 'GET', `/purchasing/purchase-orders/${po.id}`)).status, 'PARTIAL');
  const over = await call('store', 'POST', '/purchasing/grns', { po_id: po.id, supplier_id: po.supplier_id, items: [{ po_item_id: line.id, description: 'x', qty_received: 999 }] });
  assert.equal(over.status, 400);
  ok(await call('store', 'POST', '/purchasing/grns', {
    po_id: po.id, supplier_id: po.supplier_id,
    items: po.items.map((i, k) => ({ po_item_id: i.id, description: i.description, qty_received: k === 0 ? i.qty_ordered - 4 : i.qty_ordered, unit_cost: i.unit_cost })),
  }));
  assert.equal(ok(await call('store', 'GET', `/purchasing/purchase-orders/${po.id}`)).status, 'RECEIVED');
  const after = ok(await call('store', 'GET', '/parts')).find((p) => p.id === line.part_id);
  assert.equal(after.stock_qty, before + line.qty_ordered);
  // mechanic cannot see purchasing
  assert.equal((await call('kumar', 'GET', '/purchasing/purchase-orders')).status, 403);
});

test('expenses with photo upload', async () => {
  const e = ok(await call('advisor', 'POST', '/expenses', {
    expense_date: new Date().toISOString().slice(0, 10), expense_type: 'INTERNAL', category: 'Electricity',
    description: 'CEB bill', amount: 12500, payment_method: 'Bank Transfer', paid_to: 'CEB', reference_no: 'ACC-123',
  }));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const fd = new FormData();
  fd.append('files', new Blob([png], { type: 'image/png' }), 'bill.png');
  const up = await fetch(`${API}/attachments/expense/${e.id}`, { method: 'POST', headers: { authorization: `Bearer ${tokens.advisor}` }, body: fd });
  const list = await up.json();
  assert.equal(up.status, 201, JSON.stringify(list));
  const img = await fetch((process.env.API || 'http://localhost:3000') + list[0].url);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  const bad = await fetch((process.env.API || 'http://localhost:3000') + list[0].url.replace(/sig=\w+/, 'sig=abc'));
  assert.equal(bad.status, 403);
  const all = ok(await call('advisor', 'GET', '/expenses'));
  assert.ok(all.total >= 12500);
  assert.equal((await call('advisor', 'POST', '/expenses', { expense_date: '2026-01-01', expense_type: 'INTERNAL', category: 'Not a category', description: 'x', amount: 1 })).status, 400);
});

test('payroll: mid-month advance then month-end with EPF/ETF', async () => {
  const period = new Date().toISOString().slice(0, 7);
  const mid = ok(await call('accounts', 'POST', '/payroll/runs', { period, run_type: 'MID_MONTH' }));
  const kumarMid = mid.lines.find((l) => l.emp_no === 'EMP001');
  assert.equal(kumarMid.net_pay, 22000); // 40% of 55,000
  ok(await call('accounts', 'POST', `/payroll/runs/${mid.id}/finalize`));
  const end = ok(await call('accounts', 'POST', '/payroll/runs', { period, run_type: 'MONTH_END' }));
  const k = end.lines.find((l) => l.emp_no === 'EMP001');
  assert.equal(k.epf_base, 55000 + 3500 - k.nopay_amount);
  assert.equal(k.epf_employee, Math.round(k.epf_base * 0.08 * 100) / 100);
  assert.equal(k.epf_employer, Math.round(k.epf_base * 0.12 * 100) / 100);
  assert.equal(k.etf_employer, Math.round(k.epf_base * 0.03 * 100) / 100);
  assert.equal(k.advance_deduction, 22000);
  const otAmt = Math.round((55000 / 240) * 1.5 * k.ot_hours * 100) / 100;
  assert.equal(k.ot_amount, otAmt);
  assert.equal(k.net_pay, Math.round((k.gross_pay - k.epf_employee - 22000 - k.apit - k.other_deduction) * 100) / 100);
  // Lavan has a 5,000 manual advance + mid-month advance
  const lavan = end.lines.find((l) => l.emp_no === 'EMP003');
  assert.equal(lavan.advance_deduction, 5000 + 12800);
  // override: APIT and partial advance recovery
  const edited = ok(await call('accounts', 'PATCH', `/payroll/runs/${end.id}/lines/${lavan.id}`, { apit: 0, advance_deduction: 10000, other_addition: 2000 }));
  const lv = edited.lines.find((l) => l.emp_no === 'EMP003');
  assert.equal(lv.advance_deduction, 10000);
  ok(await call('accounts', 'POST', `/payroll/runs/${end.id}/finalize`));
  const adv = ok(await call('accounts', 'GET', `/hr/advances?employee_id=${lv.employee_id}&open=1`));
  assert.equal(adv.length, 1);
  assert.equal(adv[0].amount, 7800); // carried forward
  // attendance locked after month-end finalised
  const att = await call('accounts', 'PUT', '/hr/attendance', { date: `${period}-01`, records: [] });
  assert.equal(att.status, 400);
  assert.equal((await call('advisor', 'GET', '/payroll/runs')).status, 403);
});

test('walk-in free service: advisor lodges, cashier takes payment, work starts, balance before hand-over', async () => {
  const parts = ok(await call('advisor', 'GET', '/parts'));
  const oil = parts.find((p) => p.part_no === 'OIL-10W30-1L');
  // brand-new bike, no number plate yet: engine + chassis are required for a free service
  const missing = await call('advisor', 'POST', '/jobs', {
    customer: { name: 'Walk In', mobile: '0773334444' }, bike: { model: 'Dio', chassis_no: 'ME4JF99E0000777' },
    odometer: 640, service_kind: 'FREE_1', pay_upfront: true,
  });
  assert.equal(missing.status, 400);
  assert.match(missing.data.error, /engine number/);
  const job = ok(await call('advisor', 'POST', '/jobs', {
    customer: { name: 'Walk In', mobile: '0773334444' },
    bike: { model: 'Dio', chassis_no: 'ME4JF99E0000777', engine_no: 'JF99E-0000777', sale_date: '2026-09-01' },
    odometer: 640, service_kind: 'FREE_1', pay_upfront: true,
    items: [{ item_type: 'part', part_id: oil.id, qty: 1 }],
  }));
  assert.equal(job.service_kind, 'FREE_1');
  assert.match(job.bike.reg_no, /^UNREG/);
  assert.equal(job.payment_state, 'DUE');
  assert.equal(job.totals.balance, oil.unit_price);
  // bike can be found by chassis number
  const found = ok(await fetchLookup('ME4JF99E0000777'));
  assert.equal(found.id, job.bike.id);
  assert.equal(found.free_services.length, 1);

  // mechanic can't start before the receipt
  const early = await call('kumar', 'POST', `/jobs/${job.id}/status`, { status: 'IN_PROGRESS' });
  assert.equal(early.status, 400);
  assert.match(early.data.error, /cashier/);
  // mechanic sees the payment state but no amounts
  const mj = ok(await call('kumar', 'GET', `/jobs/${job.id}`));
  assert.equal(mj.payment_state, 'DUE');
  assert.equal(mj.totals, undefined);

  // cashier queue shows it; overpaying is refused; cash change is worked out
  const queue = ok(await call('cashier', 'GET', '/cashier/queue'));
  assert.ok(queue.find((q) => q.id === job.id && q.balance === oil.unit_price));
  const over = await call('cashier', 'POST', `/cashier/jobs/${job.id}/payments`, { amount: oil.unit_price + 1, method: 'Cash' });
  assert.equal(over.status, 400);
  const short = await call('cashier', 'POST', `/cashier/jobs/${job.id}/payments`, { amount: oil.unit_price, method: 'Cash', cash_given: 100 });
  assert.equal(short.status, 400);
  const paid = ok(await call('cashier', 'POST', `/cashier/jobs/${job.id}/payments`, { amount: oil.unit_price, method: 'Cash', cash_given: 5000 }));
  assert.equal(Number(paid.payment.change_given), 5000 - oil.unit_price);
  assert.match(paid.payment.receipt_no, /^RC\d{2}-\d{5}$/);
  assert.equal(paid.job.payment_state, 'PAID');
  const receipt = ok(await call('cashier', 'GET', `/cashier/payments/${paid.payment.id}`));
  assert.equal(receipt.balance_after, 0);
  // cashier can't edit the job card
  assert.equal((await call('cashier', 'PATCH', `/jobs/${job.id}`, { discount: 100 })).status, 403);

  // work starts; mechanic finds an extra part -> balance due again
  ok(await call('kumar', 'POST', `/jobs/${job.id}/status`, { status: 'IN_PROGRESS' }));
  const extra = ok(await call('advisor', 'POST', `/jobs/${job.id}/items`, { item_type: 'custom_part', description: 'Brake shoe', unit_price: 1200 }));
  assert.equal(extra.totals.balance, 1200);
  ok(await call('kumar', 'POST', `/jobs/${job.id}/status`, { status: 'QA_CHECK' }));
  ok(await call('advisor', 'POST', `/jobs/${job.id}/status`, { status: 'COMPLETED' }));
  const blocked = await call('cashier', 'POST', `/jobs/${job.id}/delivery`, { delivery_status: 'DELIVERED' });
  assert.equal(blocked.status, 400);
  assert.match(blocked.data.error, /balance/);
  ok(await call('cashier', 'POST', `/cashier/jobs/${job.id}/payments`, { amount: 1200, method: 'Card', reference: 'slip 991' }));
  const done = ok(await call('cashier', 'POST', `/jobs/${job.id}/delivery`, { delivery_status: 'DELIVERED' }));
  assert.equal(done.delivery_status, 'DELIVERED');
  assert.equal(done.invoice.status, 'PAID');
  assert.equal(Number(done.invoice.paid_amount), oil.unit_price + 1200);

  // free service 1 can't be used again on this bike
  const again = await call('advisor', 'POST', '/jobs', { bike_id: job.bike.id, odometer: 3000, service_kind: 'FREE_1', pay_upfront: true });
  assert.equal(again.status, 409);

  // today's takings
  const today = ok(await call('cashier', 'GET', '/cashier/today'));
  assert.ok(today.by_method.Cash >= oil.unit_price && today.by_method.Card >= 1200);
  // Honda claim list
  const claims = ok(await call('accounts', 'GET', '/reports/free-services'));
  const row = claims.rows.find((x) => x.id === job.id);
  assert.equal(row.engine_no, 'JF99E-0000777');
  assert.equal(row.chassis_no, 'ME4JF99E0000777');
});

test('refund when items are removed after payment', async () => {
  const job = ok(await call('advisor', 'POST', '/jobs', {
    customer: { name: 'Refund Test', mobile: '0775556666' }, bike: { reg_no: 'NP ZZZ-0099', model: 'Dio' },
    service_kind: 'PAID', pay_upfront: true,
    items: [{ item_type: 'custom_service', description: 'Service', unit_price: 3000 }, { item_type: 'custom_part', description: 'Oil', unit_price: 2000 }],
  }));
  ok(await call('cashier', 'POST', `/cashier/jobs/${job.id}/payments`, { amount: 5000, method: 'Bank Transfer', reference: 'BOC 123' }));
  const oilLine = job.items.find((i) => i.description === 'Oil');
  const after = ok(await call('advisor', 'DELETE', `/jobs/${job.id}/items/${oilLine.id}`));
  assert.equal(after.payment_state, 'REFUND');
  assert.equal(after.totals.balance, -2000);
  const tooMuch = await call('cashier', 'POST', `/cashier/jobs/${job.id}/payments`, { kind: 'REFUND', amount: 2500, method: 'Cash' });
  assert.equal(tooMuch.status, 400);
  const r = ok(await call('cashier', 'POST', `/cashier/jobs/${job.id}/payments`, { kind: 'REFUND', amount: 2000, method: 'Cash' }));
  assert.equal(r.job.payment_state, 'PAID');
});

async function fetchLookup(reg) {
  return call('advisor', 'GET', `/bikes/lookup?reg=${encodeURIComponent(reg)}`);
}
