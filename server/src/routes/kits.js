// Kits, bike groups (oil chart) and bike models.
import { Router } from 'express';
import { query, tx } from '../db.js';
import { requirePerm } from '../auth.js';
import { HttpError } from '../lib/util.js';
import { parse, z, id, money } from '../lib/validate.js';
import { VISIT_TYPES, groupForModel, loadKits, resolveKit } from '../lib/kits.js';

const r = Router();
const nullableId = id.optional().nullable().or(z.literal('').transform(() => null));

// ===== Bike models (model dropdown) =====
r.get('/models', async (req, res) => {
  const { rows } = await query(
    `SELECT m.*, g.name AS group_name FROM bike_models m LEFT JOIN bike_groups g ON g.id = m.group_id
     ${req.query.all === '1' ? '' : 'WHERE m.active'} ORDER BY m.sort_order, m.name`,
  );
  res.json(rows);
});
const modelSchema = z.object({
  name: z.string().trim().min(1).max(80),
  group_id: nullableId,
  sort_order: z.coerce.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
});
r.post('/models', requirePerm('masters.manage'), async (req, res) => {
  const d = parse(modelSchema, req.body);
  const { rows } = await query(
    'INSERT INTO bike_models (name, group_id, sort_order, active) VALUES ($1,$2,$3,$4) RETURNING *', [d.name, d.group_id ?? null, d.sort_order, d.active],
  ).catch((e) => { if (e.code === '23505') throw new HttpError(409, `Model "${d.name}" already exists`); throw e; });
  res.status(201).json(rows[0]);
});
r.put('/models/:id', requirePerm('masters.manage'), async (req, res) => {
  const mid = parse(id, req.params.id);
  const d = parse(modelSchema, req.body);
  const { rows } = await query(
    'UPDATE bike_models SET name=$1, group_id=$2, sort_order=$3, active=$4 WHERE id=$5 RETURNING *', [d.name, d.group_id ?? null, d.sort_order, d.active, mid],
  );
  if (!rows[0]) throw new HttpError(404, 'Model not found');
  res.json(rows[0]);
});

// ===== Bike groups = oil chart =====
r.get('/groups', async (req, res) => {
  const { rows } = await query(
    `SELECT g.*, op.name AS oil_name, op.unit_price AS oil_price, fp.name AS filter_name, fp.unit_price AS filter_price,
       COALESCE((SELECT json_agg(m.name ORDER BY m.sort_order, m.name) FROM bike_models m WHERE m.group_id = g.id AND m.active), '[]') AS models
     FROM bike_groups g LEFT JOIN parts op ON op.id = g.oil_part_id LEFT JOIN parts fp ON fp.id = g.filter_part_id
     ${req.query.all === '1' ? '' : 'WHERE g.active'} ORDER BY g.sort_order, g.name`,
  );
  res.json(rows);
});
const groupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  oil_part_id: nullableId,
  oil_qty: z.coerce.number().int().min(1).max(20).default(1),
  filter_part_id: nullableId,
  sort_order: z.coerce.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
});
r.post('/groups', requirePerm('masters.manage'), async (req, res) => {
  const d = parse(groupSchema, req.body);
  const { rows } = await query(
    'INSERT INTO bike_groups (name, oil_part_id, oil_qty, filter_part_id, sort_order, active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [d.name, d.oil_part_id ?? null, d.oil_qty, d.filter_part_id ?? null, d.sort_order, d.active],
  ).catch((e) => { if (e.code === '23505') throw new HttpError(409, `Group "${d.name}" already exists`); throw e; });
  res.status(201).json(rows[0]);
});
r.put('/groups/:id', requirePerm('masters.manage'), async (req, res) => {
  const gid = parse(id, req.params.id);
  const d = parse(groupSchema, req.body);
  const { rows } = await query(
    'UPDATE bike_groups SET name=$1, oil_part_id=$2, oil_qty=$3, filter_part_id=$4, sort_order=$5, active=$6 WHERE id=$7 RETURNING *',
    [d.name, d.oil_part_id ?? null, d.oil_qty, d.filter_part_id ?? null, d.sort_order, d.active, gid],
  );
  if (!rows[0]) throw new HttpError(404, 'Group not found');
  res.json(rows[0]);
});

// ===== Kits =====
// ?tiles=1&model=Dio&visit_type=FREE_1 → kit tiles for that bike, with lines and price worked out.
// Without tiles=1 → all kits (admin screen), ?all=1 includes switched-off kits.
r.get('/', async (req, res) => {
  const kits = await loadKits({ query }, { activeOnly: req.query.all !== '1' });
  const visit = VISIT_TYPES.includes(req.query.visit_type) ? req.query.visit_type : null;
  if (req.query.tiles !== '1') {
    // Admin: price for each group
    const groups = (await query('SELECT id, name FROM bike_groups WHERE active ORDER BY sort_order, name')).rows;
    const full = await Promise.all(groups.map(async (g) => {
      const m = (await query('SELECT name FROM bike_models WHERE group_id = $1 AND active ORDER BY sort_order LIMIT 1', [g.id])).rows[0];
      return { ...g, sample_model: m?.name || null, detail: m ? await groupForModel({ query }, m.name) : null };
    }));
    return res.json(kits.map((k) => ({
      ...k,
      prices: full.map((g) => {
        const r2 = resolveKit(k, g.detail, k.visit_types.find((v) => v === 'FREE_1' || v === 'FREE_2') || 'PAID');
        return { group_id: g.id, group: g.name, model: g.sample_model, price: r2.price, problems: r2.problems };
      }),
    })));
  }
  const group = await groupForModel({ query }, req.query.model ? String(req.query.model) : null);
  const list = kits.filter((k) => !visit || k.visit_types.includes(visit));
  res.json({
    group: group ? { id: group.id, name: group.name } : null,
    kits: list.map((k) => ({ id: k.id, name: k.name, visit_types: k.visit_types, ...resolveKit(k, group, visit) })),
  });
});

const lineSchema = z.object({
  kind: z.enum(['labour', 'part', 'oil', 'filter']),
  description: z.string().trim().max(200).optional().nullable(),
  unit_price: money.default(0),
  part_id: nullableId,
  qty: z.coerce.number().int().min(1).max(100).default(1),
}).superRefine((l, ctx) => {
  if (l.kind === 'labour' && !l.description) ctx.addIssue({ code: 'custom', message: 'labour lines need a description' });
  if (l.kind === 'part' && !l.part_id) ctx.addIssue({ code: 'custom', message: 'choose a part' });
});
const kitSchema = z.object({
  name: z.string().trim().min(1).max(100),
  visit_types: z.array(z.enum(VISIT_TYPES)).min(1, 'pick at least one visit type'),
  sort_order: z.coerce.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
  lines: z.array(lineSchema).min(1, 'add at least one line').max(50),
});

async function saveKit(c, kitId, d) {
  let kid = kitId;
  if (kid) {
    const { rows } = await c.query('UPDATE kits SET name=$1, visit_types=$2, sort_order=$3, active=$4 WHERE id=$5 RETURNING id', [d.name, d.visit_types, d.sort_order, d.active, kid]);
    if (!rows[0]) throw new HttpError(404, 'Kit not found');
    await c.query('DELETE FROM kit_lines WHERE kit_id = $1', [kid]);
  } else {
    kid = (await c.query('INSERT INTO kits (name, visit_types, sort_order, active) VALUES ($1,$2,$3,$4) RETURNING id', [d.name, d.visit_types, d.sort_order, d.active])).rows[0].id;
  }
  let i = 0;
  for (const l of d.lines) {
    await c.query(
      'INSERT INTO kit_lines (kit_id, kind, description, unit_price, part_id, qty, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [kid, l.kind, l.kind === 'labour' ? l.description : null, l.kind === 'labour' ? l.unit_price : 0, l.kind === 'part' ? l.part_id : null, l.kind === 'part' ? l.qty : 1, ++i],
    );
  }
  return kid;
}

r.post('/', requirePerm('masters.manage'), async (req, res) => {
  const d = parse(kitSchema, req.body);
  const kid = await tx((c) => saveKit(c, null, d));
  res.status(201).json((await loadKits({ query }, { ids: [kid], activeOnly: false }))[0]);
});
r.put('/:id', requirePerm('masters.manage'), async (req, res) => {
  const kid = parse(id, req.params.id);
  const d = parse(kitSchema, req.body);
  await tx((c) => saveKit(c, kid, d));
  res.json((await loadKits({ query }, { ids: [kid], activeOnly: false }))[0]);
});
// Delete if never used, otherwise switch it off (kept for history)
r.delete('/:id', requirePerm('masters.manage'), async (req, res) => {
  const kid = parse(id, req.params.id);
  const used = (await query('SELECT 1 FROM job_items WHERE kit_id = $1 LIMIT 1', [kid])).rows[0];
  if (used) {
    await query('UPDATE kits SET active = FALSE WHERE id = $1', [kid]);
    return res.json({ ok: true, deactivated: true });
  }
  await query('DELETE FROM kits WHERE id = $1', [kid]);
  res.json({ ok: true, deleted: true });
});

export default r;
