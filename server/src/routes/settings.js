import { Router } from 'express';
import { query } from '../db.js';
import { requirePerm } from '../auth.js';
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
  workshop: z.object({
    open: z.string().regex(/^\d{2}:\d{2}$/, 'use HH:MM, e.g. 08:00'),
    close: z.string().regex(/^\d{2}:\d{2}$/, 'use HH:MM, e.g. 17:00'),
  }),
  cashier: z.object({ round_change_to: z.coerce.number().int().refine((n) => [1, 5, 10, 20, 50, 100].includes(n), 'use 1, 5, 10, 20, 50 or 100') }),
  warranty: z.object({ months: z.coerce.number().int().min(0).max(120) }),
  payroll: z.object({
    epf_employee_rate: z.coerce.number().min(0).max(30),
    epf_employer_rate: z.coerce.number().min(0).max(30),
    etf_rate: z.coerce.number().min(0).max(10),
    ot_multiplier: z.coerce.number().min(1).max(3),
    ot_hour_divisor: z.coerce.number().min(1).max(400),
    nopay_day_divisor: z.coerce.number().min(1).max(31),
    mid_month_percent: z.coerce.number().min(0).max(100),
  }),
};

r.get('/', async (_req, res) => res.json(await getSettings()));

r.put('/:key', requirePerm('settings.manage'), async (req, res) => {
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
