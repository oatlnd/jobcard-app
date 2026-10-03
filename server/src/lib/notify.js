// Notification templates + queueing (outbox pattern). The worker (src/worker.js) does the sending.
import { query } from '../db.js';
import { config } from '../config.js';

// Order of parameters for WhatsApp approved templates ({{1}}, {{2}}, ...).
export const PARAM_ORDER = {
  checkin: ['name', 'reg_no', 'job_no', 'status_url', 'shop'],
  waiting_parts: ['name', 'reg_no', 'shop'],
  ready: ['name', 'reg_no', 'total', 'shop', 'phone'],
  delivered: ['name', 'shop', 'due_date'],
  service_reminder: ['name', 'reg_no', 'due_date', 'phone', 'shop'],
};

export const TEMPLATES = {
  en: {
    checkin: 'Hi {name}, your motorbike {reg_no} has been checked in for service. Job card: {job_no}. Track status: {status_url} - {shop}',
    waiting_parts: 'Hi {name}, we are waiting for parts for your motorbike {reg_no}. Work will continue as soon as they arrive. - {shop}',
    ready: 'Hi {name}, your motorbike {reg_no} is ready for pickup. Amount due: LKR {total}. - {shop}, {phone}',
    delivered: 'Thank you for choosing {shop}, {name}! Your next service is due on {due_date}. Your motorbike is your life.',
    service_reminder: 'Hi {name}, your motorbike {reg_no} is due for service on {due_date}. Call {phone} to book. - {shop}',
  },
  ta: {
    checkin: 'வணக்கம் {name}, உங்கள் மோட்டார் சைக்கிள் {reg_no} சேவைக்காக பதிவு செய்யப்பட்டது. வேலை அட்டை எண்: {job_no}. நிலையை அறிய: {status_url} - {shop}',
    waiting_parts: 'வணக்கம் {name}, உங்கள் மோட்டார் சைக்கிள் {reg_no} க்கான உதிரிப்பாகங்களுக்காக காத்திருக்கிறோம். அவை வந்தவுடன் வேலை தொடரும். - {shop}',
    ready: 'வணக்கம் {name}, உங்கள் மோட்டார் சைக்கிள் {reg_no} எடுத்துச் செல்லத் தயாராக உள்ளது. செலுத்த வேண்டிய தொகை: LKR {total}. - {shop}, {phone}',
    delivered: '{shop} ஐத் தேர்ந்தெடுத்ததற்கு நன்றி, {name}! உங்கள் அடுத்த சேவை {due_date} அன்று. உங்கள் மோட்டார் சைக்கிள் உங்கள் வாழ்க்கை.',
    service_reminder: 'வணக்கம் {name}, உங்கள் மோட்டார் சைக்கிள் {reg_no} க்கான அடுத்த சேவை {due_date} அன்று. முன்பதிவு செய்ய அழையுங்கள்: {phone}. - {shop}',
  },
};

const EVENT_SETTING = {
  checkin: 'on_checkin',
  waiting_parts: 'on_waiting_parts',
  ready: 'on_ready',
  delivered: 'on_delivered',
  service_reminder: 'service_reminders',
};

export function render(template, lang, params) {
  const t = (TEMPLATES[lang] || TEMPLATES.en)[template];
  if (!t) throw new Error(`Unknown template ${template}`);
  return t.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? '').toString());
}

export async function getSettings(db = { query }) {
  const { rows } = await db.query('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export const fmtMoney = (n) => Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Queue a customer notification for an event.
 * db: a pg client (inside a transaction) or the pool.
 * Returns the inserted notification row, or null if disabled.
 */
export async function queueNotification(db, { event, customer, jobCardId = null, params = {}, sendAfter = null }) {
  const settings = await getSettings(db);
  const n = settings.notifications || {};
  if (!n.enabled || !n[EVENT_SETTING[event]]) return null;
  const channels = (n.channels || []).filter((c) => c === 'whatsapp' || c === 'sms');
  if (!channels.length || !customer?.mobile) return null;

  const shop = settings.shop || {};
  const fullParams = { shop: shop.name, phone: shop.phone, ...params, name: customer.name };
  const lang = customer.preferred_lang === 'ta' ? 'ta' : 'en';
  const body = render(event, lang, fullParams);

  const { rows } = await db.query(
    `INSERT INTO notifications (job_card_id, customer_id, channel, to_number, template, params, lang, body, send_after)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9, now())) RETURNING *`,
    [jobCardId, customer.id, channels[0], customer.mobile, event, fullParams, lang, body, sendAfter],
  );
  return rows[0];
}

export function statusUrl(regNo) {
  return `${config.publicBaseUrl.replace(/\/$/, '')}/status?bike=${encodeURIComponent(regNo)}`;
}
