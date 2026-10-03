import { Router } from 'express';
import { query } from '../db.js';
import { requireRole } from '../auth.js';
import { getSettings } from '../lib/notify.js';
import { parse, z } from '../lib/validate.js';
import { HttpError } from '../lib/util.js';

const r = Router();

const SCHEMAS = {
  shop: z.object({
    name: z.string().trim().min(1).max(120),
    address: z.string().trim().max(300).default(''),
    phone: z.string().trim().max(40).default(''),
    email: z.string().trim().max(120).default(''),
    footer: z.string().trim().max(300).default(''),
  }),
  billing: z.object({ tax_rate: z.coerce.number().min(0).max(50), currency: z.literal('LKR').default('LKR') }),
  service: z.object({
    interval_days: z.coerce.number().int().min(7).max(730),
    interval_km: z.coerce.number().int().min(100).max(50000),
    reminder_days_before: z.coerce.number().int().min(0).max(30),
  }),
  notifications: z.object({
    enabled: z.boolean(),
    channels: z.array(z.enum(['whatsapp', 'sms'])).max(2),
    on_checkin: z.boolean(),
    on_waiting_parts: z.boolean(),
    on_ready: z.boolean(),
    on_delivered: z.boolean(),
    service_reminders: z.boolean(),
  }),
};

r.get('/', async (_req, res) => res.json(await getSettings()));

r.put('/:key', requireRole('admin'), async (req, res) => {
  const schema = SCHEMAS[req.params.key];
  if (!schema) throw new HttpError(404, 'Unknown setting');
  const value = parse(schema, req.body);
  await query(
    'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    [req.params.key, value],
  );
  res.json(value);
});

export default r;
