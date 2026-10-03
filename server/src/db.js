import pg from 'pg';
import { config } from './config.js';

// Return NUMERIC as JS numbers (amounts in LKR fit comfortably) and INT8 counts as numbers.
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));
// Keep DATE as 'YYYY-MM-DD' strings to avoid timezone shifts.
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
// An idle client losing its connection (e.g. Postgres restart) must not crash the process.
pool.on('error', (err) => console.error('Postgres pool error:', err.message));

export const query = (text, params) => pool.query(text, params);

/** Run fn inside a transaction. fn receives a client with .query(). */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
