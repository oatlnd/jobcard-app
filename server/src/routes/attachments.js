// Photos / receipts attached to expenses, GRNs, purchase orders, job cards and employees.
// Files are stored on disk (UPLOAD_DIR). Image links are signed so <img> tags work without a login header.
import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { query } from '../db.js';
import { config } from '../config.js';
import { hasPerm, requireAuth } from '../auth.js';
import { HttpError } from '../lib/util.js';
import { parse, id } from '../lib/validate.js';

fs.mkdirSync(config.uploadDir, { recursive: true });

const PERMS = {
  expense: { view: 'expenses.view', edit: 'expenses.manage', table: 'expenses' },
  grn: { view: 'purchasing.view', edit: 'grn.manage', table: 'grns' },
  purchase_order: { view: 'purchasing.view', edit: 'purchasing.manage', table: 'purchase_orders' },
  job_card: { view: 'jobs.view', edit: 'jobs.edit', table: 'job_cards' },
  employee: { view: 'employees.view', edit: 'employees.manage', table: 'employees' },
};
const ALLOWED = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic', 'application/pdf': '.pdf' };

const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ALLOWED[file.mimetype] || ''}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => cb(ALLOWED[file.mimetype] ? null : new HttpError(400, 'Only photos (JPG, PNG, WEBP, HEIC) and PDF files can be attached'), !!ALLOWED[file.mimetype]),
});

const sign = (attId, exp) => crypto.createHmac('sha256', config.jwtSecret).update(`${attId}.${exp}`).digest('hex').slice(0, 32);
export function fileUrl(attId) {
  const exp = Math.floor(Date.now() / 1000) + 6 * 3600;
  return `/api/files/${attId}?exp=${exp}&sig=${sign(attId, exp)}`;
}
const withUrl = (a) => ({ ...a, url: fileUrl(a.id) });

export async function listAttachments(entityType, entityId) {
  const { rows } = await query(
    `SELECT a.id, a.original_name, a.mime_type, a.size_bytes, a.created_at, u.name AS uploaded_by_name
     FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by WHERE entity_type = $1 AND entity_id = $2 ORDER BY a.id`,
    [entityType, entityId],
  );
  return rows.map(withUrl);
}

function entity(req, mode) {
  const p = PERMS[req.params.type];
  if (!p) throw new HttpError(404, 'Unknown attachment type');
  if (!hasPerm(req.user, p[mode])) throw new HttpError(403, 'You do not have permission to do this');
  return p;
}

// Signed file download (no login header needed, link expires)
export const filesRouter = Router();
filesRouter.get('/:id', async (req, res) => {
  const attId = Number(req.params.id);
  const exp = Number(req.query.exp);
  const sig = String(req.query.sig || '');
  const expected = sign(attId, exp);
  if (!exp || exp < Date.now() / 1000 || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    throw new HttpError(403, 'Link expired – reopen the page');
  }
  const a = (await query('SELECT * FROM attachments WHERE id = $1', [attId])).rows[0];
  if (!a) throw new HttpError(404, 'File not found');
  res.setHeader('Content-Type', a.mime_type);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('Content-Disposition', `inline; filename="${(a.original_name || a.file_name).replace(/"/g, '')}"`);
  res.sendFile(path.join(config.uploadDir, a.file_name));
});

const r = Router();
r.use(requireAuth);

r.get('/:type/:entityId', async (req, res) => {
  entity(req, 'view');
  res.json(await listAttachments(req.params.type, parse(id, req.params.entityId)));
});

r.post('/:type/:entityId', (req, res, next) => { entity(req, 'edit'); next(); }, upload.array('files', 10), async (req, res) => {
  const p = PERMS[req.params.type];
  const entityId = parse(id, req.params.entityId);
  const exists = (await query(`SELECT 1 FROM ${p.table} WHERE id = $1`, [entityId])).rows[0];
  if (!exists) {
    for (const f of req.files || []) fs.unlink(f.path, () => {});
    throw new HttpError(404, 'Record not found');
  }
  if (!req.files?.length) throw new HttpError(400, 'No files received');
  for (const f of req.files) {
    await query(
      `INSERT INTO attachments (entity_type, entity_id, file_name, original_name, mime_type, size_bytes, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.params.type, entityId, f.filename, f.originalname?.slice(0, 200), f.mimetype, f.size, req.user.id],
    );
  }
  res.status(201).json(await listAttachments(req.params.type, entityId));
});

r.delete('/:type/:entityId/:attId', async (req, res) => {
  entity(req, 'edit');
  const { rows } = await query(
    'DELETE FROM attachments WHERE id = $1 AND entity_type = $2 AND entity_id = $3 RETURNING file_name',
    [parse(id, req.params.attId), req.params.type, parse(id, req.params.entityId)],
  );
  if (!rows[0]) throw new HttpError(404, 'File not found');
  fs.unlink(path.join(config.uploadDir, rows[0].file_name), () => {});
  res.json({ ok: true });
});

export default r;
