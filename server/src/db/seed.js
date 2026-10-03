// Demo data for trying the app. Do NOT run on your live database.
// Usage: npm run seed
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { migrate } from './migrate.js';

await migrate();
const { rows } = await pool.query('SELECT count(*)::int AS n FROM users');
if (rows[0].n > 0) {
  console.log('Users already exist, skipping seed (it is only for an empty database).');
  await pool.end();
  process.exit(0);
}

const hash = (p) => bcrypt.hashSync(p, 10);
const users = [
  ['Ramana', 'admin', 'admin123', 'admin'],
  ['Service Advisor', 'advisor', 'advisor123', 'advisor'],
  ['Kumar (Mechanic)', 'kumar', 'mech123', 'mechanic'],
  ['Suresh (Mechanic)', 'suresh', 'mech123', 'mechanic'],
];
for (const [name, u, p, role] of users) {
  await pool.query('INSERT INTO users (name, username, password_hash, role) VALUES ($1,$2,$3,$4)', [name, u, hash(p), role]);
}

// Sample parts. Part numbers here are placeholders - replace with your real Honda catalogue.
const parts = [
  ['OIL-10W30-1L', 'Honda 4T Engine Oil 10W-30 (1L)', 'Oils & Lubricants', 2450, 40, 10],
  ['OIL-GEAR-120', 'Gear Oil (120ml) - Scooter', 'Oils & Lubricants', 650, 30, 8],
  ['FLT-OIL-001', 'Oil Filter', 'Filters', 950, 25, 5],
  ['FLT-AIR-110', 'Air Filter Element (110cc)', 'Filters', 1450, 15, 4],
  ['FLT-AIR-160', 'Air Filter Element (160cc)', 'Filters', 1850, 10, 3],
  ['SPK-CPR8EA', 'Spark Plug CPR8EA-9', 'Electrical', 1200, 30, 6],
  ['BAT-12V-5AH', 'Battery 12V 5Ah', 'Electrical', 11500, 6, 2],
  ['BLB-HL-12V', 'Headlight Bulb 12V 35/35W', 'Electrical', 650, 20, 5],
  ['BRK-PAD-FR', 'Front Disc Brake Pad Set', 'Brakes', 2800, 12, 4],
  ['BRK-SHOE-RR', 'Rear Brake Shoe Set', 'Brakes', 1900, 14, 4],
  ['BRK-CBL-FR', 'Front Brake Cable', 'Brakes', 1100, 8, 2],
  ['CHN-KIT-428', 'Drive Chain & Sprocket Kit (428)', 'Transmission', 9800, 5, 2],
  ['CLT-CBL-001', 'Clutch Cable', 'Transmission', 1250, 10, 3],
  ['CLT-PLT-SET', 'Clutch Friction Plate Set', 'Transmission', 6500, 4, 2],
  ['VBT-BELT-DIO', 'Drive Belt (Scooter)', 'Transmission', 4800, 6, 2],
  ['ENG-GSK-TOP', 'Cylinder Head Gasket Kit', 'Engine Components', 3200, 6, 2],
  ['ENG-PST-KIT', 'Piston & Ring Kit (STD)', 'Engine Components', 8900, 3, 1],
  ['SUS-FORK-OIL', 'Front Fork Oil (per side)', 'Suspension', 900, 20, 4],
  ['SUS-FORK-SEAL', 'Front Fork Oil Seal Set', 'Suspension', 1600, 10, 3],
  ['SUS-RR-SHOCK', 'Rear Shock Absorber', 'Suspension', 7800, 4, 2],
  ['BDY-MIR-L', 'Rear View Mirror (Left)', 'Body Parts', 1350, 10, 3],
  ['BDY-MIR-R', 'Rear View Mirror (Right)', 'Body Parts', 1350, 10, 3],
  ['TYR-90-90-17', 'Rear Tyre 90/90-17', 'Tyres & Tubes', 9500, 6, 2],
  ['TUB-275-17', 'Tube 2.75-17', 'Tyres & Tubes', 1650, 12, 4],
];
const partIds = {};
for (const p of parts) {
  const r = await pool.query(
    'INSERT INTO parts (part_no, name, category, unit_price, stock_qty, reorder_level) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    p,
  );
  partIds[p[0]] = r.rows[0].id;
}

const customers = [
  ['Arun Selvakumar', '94771234567', 'Nallur', 'ta', 'NPBCJ4521', 'CB Shine', 2019, 23450],
  ['Priya Rajendran', '94769876543', 'Kokuvil', 'ta', 'NPBGK1088', 'Dio', 2021, 11820],
  ['Mohamed Rizwan', '94712223344', 'Chunnakam', 'en', 'NPBEX7730', 'Hornet 2.0', 2022, 8400],
  ['Thushan Kanagaratnam', '94753456789', 'Jaffna Town', 'en', 'NPBAB3319', 'CD 110 Dream', 2017, 45200],
];
const bikeIds = [];
for (const [name, mobile, suburb, lang, reg, model, year, odo] of customers) {
  const c = await pool.query(
    'INSERT INTO customers (name, mobile, suburb, preferred_lang) VALUES ($1,$2,$3,$4) RETURNING id',
    [name, mobile, suburb, lang],
  );
  const b = await pool.query(
    'INSERT INTO bikes (customer_id, reg_no, model, year, last_odometer) VALUES ($1,$2,$3,$4,$5) RETURNING id, customer_id',
    [c.rows[0].id, reg, model, year, odo],
  );
  bikeIds.push(b.rows[0]);
}
// One bike due for service soon (to demo reminders)
await pool.query(`UPDATE bikes SET last_service_date = CURRENT_DATE - 88, next_service_due_date = CURRENT_DATE + 2 WHERE id = $1`, [bikeIds[3].id]);

// Sample open jobs
const mk = async (bike, status, type, complaint, mechanicId, history) => {
  const j = await pool.query(
    `INSERT INTO job_cards (job_no, bike_id, customer_id, status, service_type, complaint, advisor_id, mechanic_id, created_by, promised_at)
     VALUES ('JC' || to_char(now(), 'YY') || '-' || lpad(nextval('job_no_seq')::text, 5, '0'), $1,$2,$3,$4,$5,2,$6,2, now() + interval '5 hours')
     RETURNING id`,
    [bike.id, bike.customer_id, status, type, complaint, mechanicId],
  );
  let prev = null;
  for (const s of history) {
    await pool.query('INSERT INTO job_status_history (job_card_id, from_status, to_status, changed_by) VALUES ($1,$2,$3,2)', [j.rows[0].id, prev, s]);
    prev = s;
  }
  return j.rows[0].id;
};
await mk(bikeIds[0], 'CHECKED_IN', 'Paid Periodic Service', 'Regular service, chain noise', null, ['CHECKED_IN']);
const j2 = await mk(bikeIds[1], 'IN_PROGRESS', 'General Service', 'Brake feels soft, oil change', 3, ['CHECKED_IN', 'IN_PROGRESS']);
await mk(bikeIds[2], 'WAITING_PARTS', 'Repair', 'Clutch slipping', 4, ['CHECKED_IN', 'IN_PROGRESS', 'WAITING_PARTS']);

await pool.query(
  `INSERT INTO job_items (job_card_id, item_type, part_id, description, qty, unit_price) VALUES
   ($1,'part',$2,'Honda 4T Engine Oil 10W-30 (1L)',1,2450), ($1,'part',$3,'Rear Brake Shoe Set',1,1900)`,
  [j2, partIds['OIL-10W30-1L'], partIds['BRK-SHOE-RR']],
);
await pool.query(`INSERT INTO job_items (job_card_id, item_type, description, qty, unit_price) VALUES ($1,'labour','General service labour',1,2500)`, [j2]);
await pool.query('UPDATE parts SET stock_qty = stock_qty - 1 WHERE id = ANY($1)', [[partIds['OIL-10W30-1L'], partIds['BRK-SHOE-RR']]]);

console.log(`Seeded demo data.
  Logins: admin / admin123, advisor / advisor123, kumar / mech123, suresh / mech123
  Change these passwords before going live.`);
await pool.end();
