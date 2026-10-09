// Demo data for trying the app. Do NOT run on your live database.
// Usage: npm run seed
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { migrate } from './migrate.js';

await migrate();
const q = (sql, params) => pool.query(sql, params);
const { rows } = await q('SELECT count(*)::int AS n FROM users');
if (rows[0].n > 0) {
  console.log('Users already exist, skipping seed (it is only for an empty database).');
  await pool.end();
  process.exit(0);
}

const roleId = async (name) => (await q('SELECT id FROM roles WHERE name = $1', [name])).rows[0].id;
const hash = (p) => bcrypt.hashSync(p, 10);
const users = [
  ['Ramana', 'admin', 'admin123', 'Admin'],
  ['Service Advisor', 'advisor', 'advisor123', 'Service Advisor'],
  ['Kumar', 'kumar', 'mech123', 'Mechanic'],
  ['Suresh', 'suresh', 'mech123', 'Mechanic'],
  ['Store Keeper', 'store', 'store123', 'Store Keeper'],
  ['Accounts', 'accounts', 'accounts123', 'Accountant'],
  ['Cashier', 'cashier', 'cashier123', 'Cashier'],
];
const uid = {};
for (const [name, u, p, role] of users) {
  uid[u] = (await q('INSERT INTO users (name, username, password_hash, role_id) VALUES ($1,$2,$3,$4) RETURNING id', [name, u, hash(p), await roleId(role)])).rows[0].id;
}

// Sample parts (part numbers are placeholders - replace with your real Honda catalogue)
const parts = [
  ['OIL-10W30-1L', 'Honda 4T Engine Oil 10W-30 (1L)', 'Oils & Lubricants', 'Litre', 2450, 1900, 40, 10],
  ['OIL-GEAR-120', 'Gear Oil (120ml) - Scooter', 'Oils & Lubricants', 'Nos', 650, 480, 30, 8],
  ['OIL-SCT-08', 'Honda Scooter Oil 10W-30 (0.8L)', 'Oils & Lubricants', 'Bottle', 2100, 1650, 30, 8],
  ['OIL-MA-12', 'Honda 4T Oil 10W-30 MA (1.2L)', 'Oils & Lubricants', 'Bottle', 3300, 2600, 20, 6],
  ['WSH-DRAIN', 'Drain Plug Washer', 'Engine Components', 'Nos', 50, 25, 100, 20],
  ['FLT-OIL-001', 'Oil Filter', 'Filters', 'Nos', 950, 700, 25, 5],
  ['FLT-AIR-110', 'Air Filter Element (110cc)', 'Filters', 'Nos', 1450, 1050, 15, 4],
  ['FLT-AIR-160', 'Air Filter Element (160cc)', 'Filters', 'Nos', 1850, 1350, 3, 3],
  ['SPK-CPR8EA', 'Spark Plug CPR8EA-9', 'Electrical', 'Nos', 1200, 850, 30, 6],
  ['BAT-12V-5AH', 'Battery 12V 5Ah', 'Electrical', 'Nos', 11500, 9200, 6, 2],
  ['BLB-HL-12V', 'Headlight Bulb 12V 35/35W', 'Electrical', 'Nos', 650, 420, 20, 5],
  ['BRK-PAD-FR', 'Front Disc Brake Pad Set', 'Brakes', 'Set', 2800, 2050, 12, 4],
  ['BRK-SHOE-RR', 'Rear Brake Shoe Set', 'Brakes', 'Set', 1900, 1380, 14, 4],
  ['BRK-CBL-FR', 'Front Brake Cable', 'Brakes', 'Nos', 1100, 780, 2, 2],
  ['CHN-KIT-428', 'Drive Chain & Sprocket Kit (428)', 'Transmission', 'Set', 9800, 7600, 5, 2],
  ['CLT-CBL-001', 'Clutch Cable', 'Transmission', 'Nos', 1250, 900, 10, 3],
  ['CLT-PLT-SET', 'Clutch Friction Plate Set', 'Transmission', 'Set', 6500, 5000, 4, 2],
  ['VBT-BELT-DIO', 'Drive Belt (Scooter)', 'Transmission', 'Nos', 4800, 3700, 6, 2],
  ['ENG-GSK-TOP', 'Cylinder Head Gasket Kit', 'Engine Components', 'Set', 3200, 2400, 6, 2],
  ['ENG-PST-KIT', 'Piston & Ring Kit (STD)', 'Engine Components', 'Set', 8900, 6900, 3, 1],
  ['SUS-FORK-OIL', 'Front Fork Oil (per side)', 'Suspension', 'Nos', 900, 600, 20, 4],
  ['SUS-FORK-SEAL', 'Front Fork Oil Seal Set', 'Suspension', 'Set', 1600, 1150, 10, 3],
  ['SUS-RR-SHOCK', 'Rear Shock Absorber', 'Suspension', 'Nos', 7800, 6100, 4, 2],
  ['BDY-MIR-L', 'Rear View Mirror (Left)', 'Body Parts', 'Nos', 1350, 950, 10, 3],
  ['BDY-MIR-R', 'Rear View Mirror (Right)', 'Body Parts', 'Nos', 1350, 950, 10, 3],
  ['TYR-90-90-17', 'Rear Tyre 90/90-17', 'Tyres & Tubes', 'Nos', 9500, 7800, 6, 2],
  ['TUB-275-17', 'Tube 2.75-17', 'Tyres & Tubes', 'Nos', 1650, 1200, 12, 4],
];
const partIds = {};
for (const p of parts) {
  partIds[p[0]] = (await q(
    'INSERT INTO parts (part_no, name, category, unit, unit_price, cost_price, stock_qty, reorder_level) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
    p,
  )).rows[0].id;
}
const st = async (name) => (await q('SELECT id, default_price FROM service_types WHERE name = $1', [name])).rows[0];

const customers = [
  ['Arun Selvakumar', '94771234567', 'Nallur', 'ta', 'NPBCJ4521', 'CB Shine', 2019, 23450],
  ['Priya Rajendran', '94769876543', 'Kokuvil', 'ta', 'NPBGK1088', 'Dio', 2021, 11820],
  ['Mohamed Rizwan', '94712223344', 'Chunnakam', 'en', 'NPBEX7730', 'Hornet 2.0', 2022, 8400],
  ['Thushan Kanagaratnam', '94753456789', 'Jaffna Town', 'en', 'NPBAB3319', 'CD 110 Dream', 2017, 45200],
  ['Nirosha Vimal', '94778765432', 'Kondavil', 'ta', 'NPBHA2207', 'Activa', 2023, 6100],
];
const bikes = [];
for (const [name, mobile, suburb, lang, reg, model, year, odo] of customers) {
  const c = (await q('INSERT INTO customers (name, mobile, suburb, preferred_lang) VALUES ($1,$2,$3,$4) RETURNING id', [name, mobile, suburb, lang])).rows[0];
  bikes.push((await q('INSERT INTO bikes (customer_id, reg_no, model, year, last_odometer) VALUES ($1,$2,$3,$4,$5) RETURNING id, customer_id', [c.id, reg, model, year, odo])).rows[0]);
}
// A brand-new bike (no number plate yet) – ready to try a free service
{
  const c = (await q(`INSERT INTO customers (name, mobile, suburb, preferred_lang) VALUES ('Kavin Sivakumar', '94761239876', 'Kopay', 'ta') RETURNING id`)).rows[0];
  await q(
    `INSERT INTO bikes (customer_id, reg_no, model, year, engine_no, chassis_no, sale_date, last_odometer)
     VALUES ($1, 'UNREG63E0012345', 'Dio', $2, 'JF63E-7012345', 'ME4JF63E0012345', CURRENT_DATE - 25, 0)`,
    [c.id, new Date().getFullYear()],
  );
}
await q(`UPDATE bikes SET last_service_date = CURRENT_DATE - 88, next_service_due_date = CURRENT_DATE + 2 WHERE id = $1`, [bikes[3].id]);

const mkJob = async (bike, status, delivery, complaint, mechanic, history, services, partList, odo) => {
  const j = (await q(
    `INSERT INTO job_cards (job_no, bike_id, customer_id, status, delivery_status, complaint, advisor_id, mechanic_id, created_by, promised_at, odometer, completed_at)
     VALUES ('JC' || to_char(now(), 'YY') || '-' || lpad(nextval('job_no_seq')::text, 5, '0'), $1,$2,$3,$4,$5,$6,$7,$6, now() + interval '5 hours', $8,
             CASE WHEN $3 = 'COMPLETED' THEN now() END)
     RETURNING id`,
    [bike.id, bike.customer_id, status, delivery, complaint, uid.advisor, mechanic, odo],
  )).rows[0].id;
  let prev = null;
  for (const s of history) {
    await q('INSERT INTO job_status_history (job_card_id, from_status, to_status, changed_by) VALUES ($1,$2,$3,$4)', [j, prev, s, uid.advisor]);
    prev = s;
  }
  if (delivery === 'READY') await q(`INSERT INTO job_status_history (job_card_id, kind, from_status, to_status, changed_by) VALUES ($1,'delivery','PENDING','READY',$2)`, [j, uid.advisor]);
  for (const name of services) {
    const s = await st(name);
    await q(`INSERT INTO job_items (job_card_id, item_type, service_type_id, description, qty, unit_price) VALUES ($1,'service',$2,$3,1,$4)`, [j, s.id, name, s.default_price]);
  }
  for (const [pn, qty] of partList) {
    const p = parts.find((x) => x[0] === pn);
    await q(`INSERT INTO job_items (job_card_id, item_type, part_id, description, qty, unit_price, unit_cost) VALUES ($1,'part',$2,$3,$4,$5,$6)`, [j, partIds[pn], p[1], qty, p[4], p[5]]);
    await q('UPDATE parts SET stock_qty = stock_qty - $1 WHERE id = $2', [qty, partIds[pn]]);
  }
  return j;
};
await mkJob(bikes[0], 'CHECKED_IN', 'PENDING', 'Regular service, chain noise', null, ['CHECKED_IN'], ['Periodic Service', 'Chain Clean & Adjust'], [], 23450);
await mkJob(bikes[1], 'IN_PROGRESS', 'PENDING', 'Brake feels soft, oil change', uid.kumar, ['CHECKED_IN', 'IN_PROGRESS'], ['General Service', 'Brake Service'], [['OIL-GEAR-120', 1], ['BRK-SHOE-RR', 1]], 11820);
await mkJob(bikes[2], 'WAITING_PARTS', 'PENDING', 'Clutch slipping', uid.suresh, ['CHECKED_IN', 'IN_PROGRESS', 'WAITING_PARTS'], ['Clutch Overhaul'], [], 8400);
await mkJob(bikes[4], 'COMPLETED', 'READY', 'First paid service', uid.kumar, ['CHECKED_IN', 'IN_PROGRESS', 'QA_CHECK', 'COMPLETED'], ['Periodic Service'], [['OIL-10W30-1L', 1], ['FLT-AIR-110', 1]], 6100);

// Oil chart (which oil / filter each bike group uses) and a demo repair kit
const grp = async (name, oil, qty, filter) => q(
  'UPDATE bike_groups SET oil_part_id = $1, oil_qty = $2, filter_part_id = $3 WHERE name = $4', [partIds[oil], qty, filter ? partIds[filter] : null, name],
);
await grp('Scooter 110cc', 'OIL-SCT-08', 1, 'WSH-DRAIN');
await grp('Bike 100–125cc', 'OIL-10W30-1L', 1, 'WSH-DRAIN');
await grp('Bike 150–200cc', 'OIL-MA-12', 1, 'FLT-OIL-001');
await grp('Big bike 250cc+', 'OIL-10W30-1L', 2, 'FLT-OIL-001');
{
  const k = (await q(`INSERT INTO kits (name, visit_types, sort_order) VALUES ('Rear brake shoe replacement', '{MINOR,WARRANTY,PAID}', 5) RETURNING id`)).rows[0].id;
  await q(`INSERT INTO kit_lines (kit_id, kind, description, unit_price, sort_order) VALUES ($1, 'labour', 'Rear brake shoe – fitting', 600, 1)`, [k]);
  await q(`INSERT INTO kit_lines (kit_id, kind, part_id, qty, sort_order) VALUES ($1, 'part', $2, 1, 2)`, [k, partIds['BRK-SHOE-RR']]);
}

// Suppliers and a purchase order
const sup1 = (await q(`INSERT INTO suppliers (name, contact_person, phone, address, payment_terms) VALUES ('Lanka Honda Parts (Pvt) Ltd','Sales Desk','0112 345 678','Colombo 10','30 days credit') RETURNING id`)).rows[0].id;
await q(`INSERT INTO suppliers (name, contact_person, phone, address, payment_terms) VALUES ('Jaffna Auto Traders','Mr. Ganesh','021 222 3344','Hospital Road, Jaffna','Cash')`);
const po = (await q(
  `INSERT INTO purchase_orders (po_no, supplier_id, status, expected_date, payment_terms, created_by, ordered_at, approved_by)
   VALUES ('PO' || to_char(now(), 'YY') || '-' || lpad(nextval('po_no_seq')::text, 5, '0'), $1, 'ORDERED', CURRENT_DATE + 5, '30 days credit', $2, now(), $2) RETURNING id`,
  [sup1, uid.admin],
)).rows[0].id;
for (const [pn, qty] of [['FLT-AIR-160', 10], ['BRK-CBL-FR', 6], ['OIL-10W30-1L', 24]]) {
  const p = parts.find((x) => x[0] === pn);
  await q('INSERT INTO purchase_order_items (po_id, part_id, description, qty_ordered, unit_cost) VALUES ($1,$2,$3,$4,$5)', [po, partIds[pn], p[1], qty, p[5]]);
}

// Employees + this month's attendance
const emps = [
  ['EMP001', 'Kumar Sivanesan', 'Senior Mechanic', 55000, 3500, 5000, uid.kumar],
  ['EMP002', 'Suresh Nadarajah', 'Mechanic', 45000, 3500, 3000, uid.suresh],
  ['EMP003', 'Lavan Tharmalingam', 'Helper', 32000, 3500, 0, null],
  ['EMP004', 'Kavitha Rasan', 'Cashier', 40000, 3500, 2000, uid.advisor],
];
const empIds = [];
for (const [no, name, des, basic, epfA, other, user] of emps) {
  empIds.push((await q(
    `INSERT INTO employees (emp_no, name, designation, basic_salary, epf_allowance, other_allowance, epf_no, join_date, user_id, bank_name, bank_account)
     VALUES ($1,$2,$3,$4,$5,$6,$7, CURRENT_DATE - 400, $8, 'Bank of Ceylon', $9) RETURNING id`,
    [no, name, des, basic, epfA, other, String(100 + empIds.length), user, `00${8000000 + empIds.length * 1111}`],
  )).rows[0].id);
}
const today = new Date();
for (let d = 1; d < today.getDate(); d++) {
  const day = new Date(today.getFullYear(), today.getMonth(), d);
  const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  for (const [i, eid] of empIds.entries()) {
    const status = day.getDay() === 0 ? 'HOLIDAY' : (i === 2 && d % 9 === 0) ? 'ABSENT' : (i === 1 && d === 2) ? 'HALF_DAY' : 'PRESENT';
    await q(`INSERT INTO attendance (employee_id, work_date, status, time_in, time_out, ot_hours, marked_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [eid, iso, status, status === 'PRESENT' ? '08:00' : null, status === 'PRESENT' ? '17:30' : null, status === 'PRESENT' && i < 2 && d % 3 === 0 ? 1.5 : 0, uid.admin]);
  }
}
await q(`INSERT INTO salary_advances (employee_id, advance_date, amount, reason, created_by) VALUES ($1, CURRENT_DATE - 3, 5000, 'Family function', $2)`, [empIds[2], uid.admin]);

// A couple of expenses
await q(`INSERT INTO expenses (expense_no, expense_date, expense_type, category, description, amount, payment_method, paid_to, created_by) VALUES
  ('EXP' || to_char(now(), 'YY') || '-' || lpad(nextval('expense_no_seq')::text, 5, '0'), CURRENT_DATE, 'INTERNAL', 'Tea & Refreshments', 'Tea and biscuits for staff', 850, 'Cash', 'Kalai Stores', $1)`, [uid.advisor]);
await q(`INSERT INTO expenses (expense_no, expense_date, expense_type, category, description, amount, payment_method, paid_to, created_by) VALUES
  ('EXP' || to_char(now(), 'YY') || '-' || lpad(nextval('expense_no_seq')::text, 5, '0'), CURRENT_DATE - 1, 'EXTERNAL', 'Outside Work (Lathe / Painting)', 'Brake drum skimming', 1500, 'Cash', 'Siva Lathe Works', $1)`, [uid.advisor]);

console.log(`Seeded demo data.
  Logins: admin/admin123, advisor/advisor123, kumar/mech123, store/store123, accounts/accounts123, cashier/cashier123
  Change these passwords before going live.`);
await pool.end();
