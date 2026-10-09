// Kits: ready-made sets of lines. "oil" and "filter" lines are filled from the bike's group (the oil chart).
import { HttpError } from './util.js';

export const VISIT_TYPES = ['FREE_1', 'FREE_2', 'WARRANTY', 'PAID', 'MINOR', 'MAJOR'];
export const isFreeVisit = (v) => v === 'FREE_1' || v === 'FREE_2';

/** The oil-chart group for a bike model (null if the model isn't in the list or has no group). */
export async function groupForModel(c, model) {
  if (!model) return null;
  const { rows } = await c.query(
    `SELECT g.*, op.name AS oil_name, op.unit_price AS oil_price, op.part_no AS oil_part_no,
            fp.name AS filter_name, fp.unit_price AS filter_price, fp.part_no AS filter_part_no
     FROM bike_models m JOIN bike_groups g ON g.id = m.group_id
     LEFT JOIN parts op ON op.id = g.oil_part_id LEFT JOIN parts fp ON fp.id = g.filter_part_id
     WHERE lower(m.name) = lower($1) AND g.active`,
    [model.trim()],
  );
  return rows[0] || null;
}

export async function loadKits(c, { ids, activeOnly = true } = {}) {
  const where = [];
  const params = [];
  if (activeOnly) where.push('k.active');
  if (ids) { params.push(ids); where.push(`k.id = ANY($${params.length})`); }
  const { rows } = await c.query(
    `SELECT k.*,
       COALESCE((SELECT json_agg(json_build_object(
           'id', l.id, 'kind', l.kind, 'description', l.description, 'unit_price', l.unit_price, 'part_id', l.part_id, 'qty', l.qty,
           'part_name', p.name, 'part_no', p.part_no, 'part_price', p.unit_price, 'part_active', p.active) ORDER BY l.sort_order, l.id)
         FROM kit_lines l LEFT JOIN parts p ON p.id = l.part_id WHERE l.kit_id = k.id), '[]') AS lines
     FROM kits k ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY k.sort_order, k.name`,
    params,
  );
  return rows;
}

/**
 * Turn a kit into job card lines for a bike group and visit type.
 * Returns { items, problems, price }.
 */
export function resolveKit(kit, group, visitType) {
  const items = [];
  const problems = [];
  // Labour is free only on a free-service visit using a kit made for that free service
  // (a brake repair kit added to a free service visit is still charged).
  const freeLabour = isFreeVisit(visitType) && kit.visit_types.includes(visitType);
  for (const l of kit.lines) {
    if (l.kind === 'labour') {
      items.push({ item_type: 'custom_service', description: l.description || 'Labour', qty: 1,
        unit_price: freeLabour ? 0 : Number(l.unit_price), free: freeLabour });
    } else if (l.kind === 'part') {
      if (!l.part_id || l.part_active === false) { problems.push(`Part on "${kit.name}" is no longer available`); continue; }
      items.push({ item_type: 'part', part_id: l.part_id, description: l.part_name, part_no: l.part_no, qty: l.qty, unit_price: Number(l.part_price) });
    } else if (l.kind === 'oil') {
      if (!group) { problems.push('This bike model isn’t in the oil chart yet'); continue; }
      if (!group.oil_part_id) { problems.push(`No oil set for “${group.name}” in the oil chart`); continue; }
      items.push({ item_type: 'part', part_id: group.oil_part_id, description: group.oil_name, part_no: group.oil_part_no,
        qty: group.oil_qty, unit_price: Number(group.oil_price) });
    } else if (l.kind === 'filter') {
      if (!group) { if (!problems.length) problems.push('This bike model isn’t in the oil chart yet'); continue; }
      if (!group.filter_part_id) continue; // group uses no filter
      items.push({ item_type: 'part', part_id: group.filter_part_id, description: group.filter_name, part_no: group.filter_part_no,
        qty: 1, unit_price: Number(group.filter_price) });
    }
  }
  const price = items.reduce((s, i) => s + i.qty * i.unit_price, 0);
  return { items, problems: [...new Set(problems)], price: Math.round(price * 100) / 100 };
}

/**
 * Add a kit's lines to a job card (inside a transaction; caller locks the job).
 * Deducts stock for parts. Returns true if stock changed.
 */
export async function addKitToJob(c, jobId, kitId, userId) {
  const job = (await c.query(
    'SELECT j.service_kind, b.model FROM job_cards j JOIN bikes b ON b.id = j.bike_id WHERE j.id = $1', [jobId],
  )).rows[0];
  const kit = (await loadKits(c, { ids: [kitId] }))[0];
  if (!kit) throw new HttpError(404, 'Kit not found');
  const group = await groupForModel(c, job.model);
  const { items, problems } = resolveKit(kit, group, job.service_kind);
  if (problems.length) throw new HttpError(400, `${kit.name}: ${problems.join('; ')}. Fix it on the Kits & oil chart screen, or add the items by hand.`);
  let stock = false;
  for (const it of items) {
    if (it.item_type === 'part') {
      const upd = await c.query(
        'UPDATE parts SET stock_qty = stock_qty - $1 WHERE id = $2 AND stock_qty >= $1 RETURNING cost_price', [it.qty, it.part_id],
      );
      if (!upd.rows[0]) throw new HttpError(400, `Not enough ${it.description} in stock (need ${it.qty})`);
      await c.query(
        `INSERT INTO job_items (job_card_id, item_type, part_id, description, qty, unit_price, unit_cost, added_by, kit_id)
         VALUES ($1,'part',$2,$3,$4,$5,$6,$7,$8)`,
        [jobId, it.part_id, it.description, it.qty, it.unit_price, upd.rows[0].cost_price, userId, kitId],
      );
      stock = true;
    } else {
      await c.query(
        `INSERT INTO job_items (job_card_id, item_type, description, qty, unit_price, added_by, kit_id) VALUES ($1,'custom_service',$2,1,$3,$4,$5)`,
        [jobId, it.description, it.unit_price, userId, kitId],
      );
    }
  }
  return stock;
}
