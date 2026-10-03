import { z } from 'zod';
import { HttpError } from './util.js';

export { z };

export function parse(schema, data) {
  const r = schema.safeParse(data ?? {});
  if (!r.success) {
    const first = r.error.issues[0];
    const field = first?.path?.join('.') || 'input';
    throw new HttpError(400, `${field}: ${first?.message || 'invalid'}`, r.error.issues);
  }
  return r.data;
}

export const id = z.coerce.number().int().positive();
export const optText = z.string().trim().max(2000).optional().nullable().transform((v) => (v === '' ? null : v));
export const money = z.coerce.number().min(0).max(100_000_000);
