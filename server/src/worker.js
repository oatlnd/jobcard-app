// Background worker: sends queued WhatsApp/SMS messages and queues service-due reminders.
// Run with: npm run worker   (PM2 keeps it running - see ecosystem.config.cjs)
import { fileURLToPath } from 'node:url';
import { pool, query } from './db.js';
import { config } from './config.js';
import { getProvider } from './providers/index.js';
import { getSettings, queueNotification, render } from './lib/notify.js';

const log = (...a) => console.log(new Date().toISOString(), ...a);

/** Claim and send up to `limit` queued messages. Returns number processed. */
export async function processBatch(limit = 10) {
  // Release messages stuck in SENDING (e.g. worker crashed mid-send)
  await query(`UPDATE notifications SET status = 'QUEUED' WHERE status = 'SENDING' AND locked_at < now() - interval '5 minutes'`);

  const { rows } = await query(
    `UPDATE notifications SET status = 'SENDING', attempts = attempts + 1, locked_at = now()
     WHERE id IN (SELECT id FROM notifications WHERE status = 'QUEUED' AND send_after <= now()
                  ORDER BY id FOR UPDATE SKIP LOCKED LIMIT $1)
     RETURNING *`,
    [limit],
  );
  for (const n of rows) {
    try {
      const { providerId } = await getProvider(n.channel).send(n);
      await query(`UPDATE notifications SET status = 'SENT', sent_at = now(), provider_id = $2, last_error = NULL WHERE id = $1`, [n.id, providerId]);
      // Tell the API (and so the open job screens) that the message status changed
      if (n.job_card_id) await query(`SELECT pg_notify('job_changed', $1)`, [String(n.job_card_id)]);
    } catch (err) {
      const msg = String(err.message || err).slice(0, 500);
      if (n.attempts < config.notify.maxAttempts) {
        const delayMin = 2 ** n.attempts; // 2, 4, 8 minutes
        await query(
          `UPDATE notifications SET status = 'QUEUED', last_error = $2, send_after = now() + make_interval(mins => $3) WHERE id = $1`,
          [n.id, msg, delayMin],
        );
        log(`Retry #${n.attempts} for message ${n.id} in ${delayMin} min: ${msg}`);
      } else {
        await query(`UPDATE notifications SET status = 'FAILED', last_error = $2 WHERE id = $1`, [n.id, msg]);
        if (n.job_card_id) await query(`SELECT pg_notify('job_changed', $1)`, [String(n.job_card_id)]);
        log(`Message ${n.id} failed: ${msg}`);
        await queueFallback(n);
      }
    }
  }
  return rows.length;
}

/** If WhatsApp failed, try the next channel (usually SMS) once. */
async function queueFallback(n) {
  const settings = await getSettings();
  const channels = settings.notifications?.channels || [];
  const next = channels[channels.indexOf(n.channel) + 1];
  if (!next || next === n.channel) return;
  await query(
    `INSERT INTO notifications (job_card_id, customer_id, channel, to_number, template, params, lang, body)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [n.job_card_id, n.customer_id, next, n.to_number, n.template, n.params, n.lang, render(n.template, n.lang, n.params)],
  );
  log(`Queued ${next} fallback for message ${n.id}`);
}

/** Sri Lanka local hour (UTC+5:30) */
const colomboHour = () => Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Colombo' }).format(new Date()));

/** Queue reminders for bikes whose next service is due soon. Safe to run repeatedly. */
export async function queueServiceReminders({ ignoreHours = false } = {}) {
  if (!ignoreHours) {
    const h = colomboHour();
    if (h < 9 || h >= 18) return 0; // only send during the day
  }
  const settings = await getSettings();
  if (!settings.notifications?.enabled || !settings.notifications?.service_reminders) return 0;
  const before = Number(settings.service?.reminder_days_before ?? 3);
  const { rows } = await query(
    `SELECT b.id AS bike_id, b.reg_no, b.next_service_due_date, row_to_json(c.*) AS customer
     FROM bikes b JOIN customers c ON c.id = b.customer_id
     WHERE b.next_service_due_date IS NOT NULL
       AND b.next_service_due_date <= CURRENT_DATE + $1::int
       AND b.next_service_due_date >= CURRENT_DATE - 30
       AND b.reminder_sent_for IS DISTINCT FROM b.next_service_due_date
       AND NOT EXISTS (SELECT 1 FROM job_cards j WHERE j.bike_id = b.id AND j.status <> 'CANCELLED' AND j.delivery_status <> 'DELIVERED')
     LIMIT 200`,
    [before],
  );
  for (const r of rows) {
    await queueNotification({ query }, {
      event: 'service_reminder', customer: r.customer,
      params: { reg_no: r.reg_no, due_date: r.next_service_due_date },
    });
    await query('UPDATE bikes SET reminder_sent_for = next_service_due_date WHERE id = $1', [r.bike_id]);
  }
  if (rows.length) log(`Queued ${rows.length} service reminder(s)`);
  return rows.length;
}

async function main() {
  log(`Worker started [${config.deployEnv}] (whatsapp=${config.notify.whatsappProvider}, sms=${config.notify.smsProvider})`);
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);

  let lastReminderRun = 0;
  while (!stopping) {
    try {
      if (Date.now() - lastReminderRun > 60 * 60 * 1000) {
        await queueServiceReminders();
        lastReminderRun = Date.now();
      }
      const n = await processBatch();
      if (n === 0) await new Promise((r) => setTimeout(r, config.notify.workerIntervalMs));
    } catch (err) {
      log('Worker error:', err.message);
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }
  await pool.end();
  log('Worker stopped');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
