// Create (or reset) an admin login.
// Usage: npm run create-admin -- <username> <password> "<Full Name>"
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { migrate } from './migrate.js';

const [username, password, name = 'Administrator'] = process.argv.slice(2);
if (!username || !password || password.length < 6) {
  console.error('Usage: npm run create-admin -- <username> <password (min 6 chars)> "<Full Name>"');
  process.exit(1);
}

await migrate({ log: () => {} });
const hash = await bcrypt.hash(password, 10);
await pool.query(
  `INSERT INTO users (name, username, password_hash, role_id) VALUES ($1, lower($2), $3, (SELECT id FROM roles WHERE is_system LIMIT 1))
   ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, role_id = EXCLUDED.role_id, active = TRUE`,
  [name, username, hash],
);
console.log(`Admin "${username.toLowerCase()}" is ready.`);
await pool.end();
