// Suppliers, purchase orders and goods received notes (GRN)
import { Router } from 'express';
import { query, tx } from '../db.js';
import { requirePerm } from '../auth.js';
import { HttpError, round2 } from '../lib/util.js';
import { parse, z, id, money, optText } from '../lib/validate.js';
import { emitPartsChanged } from '../realtime.js';
import { listAttachments } from './attachments.js';

const r = Router();
r.use(requirePerm('purchasing.view', 'grn.manage'));

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD');
const optDate = date.optional().nullable().or(z.literal('').transform(() => null));

// ================= Suppliers =================
r.get('/suppliers', async (req, res) => {
  const all = req.query.all === '1';
  const { rows } = await query(
    `SELECT s.*,
       (SELECT count(*)::int FROM purchase_orders p WHERE p.supplier_id = s.id AND p.status IN ('ORDERED','PARTIAL')) AS open_pos
     FROM suppliers s ${all ? '' : 'WHERE active'} ORDER BY s.name`,
  );
  res.json(rows);
});

const supplierSchema = z.object({
  name: z.string().trim().min(1).max(150),
  contact_person: optText,
  phone: optText,
  email: z.string().trim().email().optional().nullable().or(z.literal('').transform(() => null)),
  address: optText,
  tax_no: optText,
  payment_terms: optText,
  notes: optText,
  active: z.boolean().default(true),
});
const SUP_COLS = Object.keys(supplierSchema.shape);

r.post('/suppliers', requirePerm('purchasing.manage'), async (req, res) => {
  const d = parse(supplierSchema, req.body);
  const { rows } = await query(
    `INSERT INTO suppliers (${SUP_COLS.join(',')}) VALUES (${SUP_COLS.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
    SUP_COLS.map((k) => d[k]),
  );
  res.status(201).json(rows[0]);
});

r.put('/suppliers/:id', requirePerm('purchasing.manage'), async (req, res) => {
  const d = parse(supplierSchema, req.body);
  const { rows } = await query(
    `UPDATE suppliers SET ${SUP_COLS.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${SUP_COLS.length + 1} RETURNING *`,
    [...SUP_COLS.map((k) => d[k]), parse(id, req.params.id)],
  );
  if (!rows[0]) throw new HttpError(404, 'Supplier not found');
  res.json(rows[0]);
});

// ================= Purchase orders =================
const poTotals = (items, discount = 0, tax = 0) => {
  const subtotal = round2(items.reduce((s, i) => s + Number(i.qty_ordered) * Number(i.unit_cost), 0));
  return { subtotal, discount: Number(discount), tax_amount: Number(tax), total: round2(subtotal - Number(discount) + Number(tax)) };
};

r.get('/purchase-orders', async (req, res) => {
  const params = [];
  const where = [];
  if (req.query.status) { params.push(req.query.status); where.push(`p.status = $${params.length}`); }
  if (req.query.supplier_id) { params.push(Number(req.query.supplier_id)); where.push(`p.supplier_id = $${params.length}`); }
  if (req.query.q) { params.push(`%${String(req.query.q).toLowerCase()}%`); where.push(`(lower(p.po_no) LIKE $${params.length} OR lower(s.name) LIKE $${params.length})`); }
  const { rows } = await query(
    `SELECT p.*, s.name AS supplier_name,
       (SELECT COALESCE(sum(line_total),0) FROM purchase_order_items WHERE po_id = p.id) - p.discount + p.tax_amount AS total,
       (SELECT count(*)::int FROM purchase_order_items WHERE po_id = p.id) AS line_count
     FROM purchase_orders p JOIN suppliers s ON s.id = p.supplier_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.id DESC LIMIT 300`,
    params,
  );
  res.json(rows);
});

async function loadPo(poId, db = { query }) {
  const po = (await db.query(
    `SELECT p.*, row_to_json(s.*) AS supplier, cu.name AS created_by_name
     FROM purchase_orders p JOIN suppliers s ON s.id = p.supplier_id LEFT JOIN users cu ON cu.id = p.created_by WHERE p.id = $1`,
    [poId],
  )).rows[0];
  if (!po) throw new HttpError(404, 'Purchase order not found');
  const items = (await db.query(
    `SELECT i.*, pt.part_no, pt.unit, pt.stock_qty FROM purchase_order_items i LEFT JOIN parts pt ON pt.id = i.part_id WHERE po_id = $1 ORDER BY i.id`,
    [poId],
  )).rows;
  const grns = (await db.query(`SELECT id, grn_no, received_date, supplier_invoice_no FROM grns WHERE po_id = $1 ORDER BY id`, [poId])).rows;
  return { ...po, items, grns, totals: poTotals(items, po.discount, po.tax_amount), attachments: await listAttachments('purchase_order', poId) };
}

r.get('/purchase-orders/:id', async (req, res) => res.json(await loadPo(parse(id, req.params.id))));

const poItem = z.object({
  part_id: id.optional().nullable(),
  description: z.string().trim().min(1).max(200),
  qty_ordered: z.coerce.number().positive(),
  unit_cost: money.default(0),
});
const poSchema = z.object({
  supplier_id: id,
  order_date: date.optional(),
  expected_date: optDate,
  reference: optText,
  payment_terms: optText,
  delivery_to: optText,
  notes: optText,
  discount: money.default(0),
  tax_amount: money.default(0),
  items: z.array(poItem).min(1, 'add at least one item').max(200),
});

async function writePoItems(c, poId, items) {
  await c.query('DELETE FROM purchase_order_items WHERE po_id = $1', [poId]);
  for (const it of items) {
    await c.query(
      'INSERT INTO purchase_order_items (po_id, part_id, description, qty_ordered, unit_cost) VALUES ($1,$2,$3,$4,$5)',
      [poId, it.part_id || null, it.description, it.qty_ordered, it.unit_cost],
    );
  }
}

r.post('/purchase-orders', requirePerm('purchasing.manage'), async (req, res) => {
  const d = parse(poSchema, req.body);
  const poId = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO purchase_orders (po_no, supplier_id, order_date, expected_date, reference, payment_terms, delivery_to, notes, discount, tax_amount, created_by)
       VALUES ('PO' || to_char(now(), 'YY') || '-' || lpad(nextval('po_no_seq')::text, 5, '0'), $1, COALESCE($2::date, CURRENT_DATE), $3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [d.supplier_id, d.order_date || null, d.expected_date, d.reference, d.payment_terms, d.delivery_to, d.notes, d.discount, d.tax_amount, req.user.id],
    );
    await writePoItems(c, rows[0].id, d.items);
    return rows[0].id;
  });
  res.status(201).json(await loadPo(poId));
});

r.put('/purchase-orders/:id', requirePerm('purchasing.manage'), async (req, res) => {
  const poId = parse(id, req.params.id);
  const d = parse(poSchema, req.body);
  await tx(async (c) => {
    const po = (await c.query('SELECT status FROM purchase_orders WHERE id = $1 FOR UPDATE', [poId])).rows[0];
    if (!po) throw new HttpError(404, 'Purchase order not found');
    if (po.status !== 'DRAFT') throw new HttpError(400, 'Only draft purchase orders can be edited');
    await c.query(
      `UPDATE purchase_orders SET supplier_id=$1, order_date=COALESCE($2::date, order_date), expected_date=$3, reference=$4, payment_terms=$5,
         delivery_to=$6, notes=$7, discount=$8, tax_amount=$9, updated_at=now() WHERE id=$10`,
      [d.supplier_id, d.order_date || null, d.expected_date, d.reference, d.payment_terms, d.delivery_to, d.notes, d.discount, d.tax_amount, poId],
    );
    await writePoItems(c, poId, d.items);
  });
  res.json(await loadPo(poId));
});

// DRAFT -> ORDERED (sent to supplier), cancel, or close a partly received PO
r.post('/purchase-orders/:id/status', requirePerm('purchasing.manage'), async (req, res) => {
  const poId = parse(id, req.params.id);
  const { status } = parse(z.object({ status: z.enum(['ORDERED', 'CANCELLED', 'CLOSED']) }), req.body);
  const allowed = { ORDERED: ['DRAFT'], CANCELLED: ['DRAFT', 'ORDERED'], CLOSED: ['PARTIAL'] };
  const extra = status === 'ORDERED' ? ', ordered_at = now(), approved_by = $3' : '';
  const params = status === 'ORDERED' ? [status, poId, req.user.id] : [status, poId];
  const { rows } = await query(
    `UPDATE purchase_orders SET status = $1, updated_at = now() ${extra} WHERE id = $2 AND status = ANY('{${allowed[status].join(',')}}') RETURNING id`,
    params,
  );
  if (!rows[0]) throw new HttpError(400, `This purchase order cannot be marked ${status.toLowerCase()} now`);
  res.json(await loadPo(poId));
});

// Low-stock parts to help build a PO
r.get('/reorder-suggestions', requirePerm('purchasing.manage'), async (_req, res) => {
  const { rows } = await query(
    `SELECT id AS part_id, part_no, name, unit, stock_qty, reorder_level, cost_price,
            GREATEST(reorder_level * 2 - stock_qty, 1) AS suggested_qty
     FROM parts WHERE active AND stock_qty <= reorder_level ORDER BY category, name`,
  );
  res.json(rows);
});

// ================= GRN =================
r.get('/grns', async (req, res) => {
  const params = [];
  const where = [];
  if (req.query.supplier_id) { params.push(Number(req.query.supplier_id)); where.push(`g.supplier_id = $${params.length}`); }
  if (req.query.from) { params.push(req.query.from); where.push(`g.received_date >= $${params.length}`); }
  if (req.query.to) { params.push(req.query.to); where.push(`g.received_date <= $${params.length}`); }
  const { rows } = await query(
    `SELECT g.*, s.name AS supplier_name, p.po_no, u.name AS received_by_name,
       (SELECT COALESCE(sum(line_total),0) FROM grn_items WHERE grn_id = g.id) - g.discount + g.tax_amount AS total
     FROM grns g JOIN suppliers s ON s.id = g.supplier_id LEFT JOIN purchase_orders p ON p.id = g.po_id LEFT JOIN users u ON u.id = g.received_by
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY g.id DESC LIMIT 300`,
    params,
  );
  res.json(rows);
});

async function loadGrn(grnId) {
  const g = (await query(
    `SELECT g.*, row_to_json(s.*) AS supplier, p.po_no, u.name AS received_by_name
     FROM grns g JOIN suppliers s ON s.id = g.supplier_id LEFT JOIN purchase_orders p ON p.id = g.po_id LEFT JOIN users u ON u.id = g.received_by
     WHERE g.id = $1`,
    [grnId],
  )).rows[0];
  if (!g) throw new HttpError(404, 'GRN not found');
  const items = (await query(
    `SELECT gi.*, pt.part_no, pt.unit FROM grn_items gi LEFT JOIN parts pt ON pt.id = gi.part_id WHERE grn_id = $1 ORDER BY gi.id`,
    [grnId],
  )).rows;
  const subtotal = round2(items.reduce((s, i) => s + Number(i.line_total), 0));
  return { ...g, items, totals: { subtotal, discount: g.discount, tax_amount: g.tax_amount, total: round2(subtotal - g.discount + Number(g.tax_amount)) }, attachments: await listAttachments('grn', grnId) };
}

r.get('/grns/:id', async (req, res) => res.json(await loadGrn(parse(id, req.params.id))));

const grnSchema = z.object({
  po_id: id.optional().nullable(),
  supplier_id: id,
  received_date: date.optional(),
  supplier_invoice_no: optText,
  supplier_invoice_date: optDate,
  delivery_note_no: optText,
  vehicle_no: optText,
  notes: optText,
  discount: money.default(0),
  tax_amount: money.default(0),
  update_cost: z.boolean().default(true),
  items: z.array(z.object({
    po_item_id: id.optional().nullable(),
    part_id: id.optional().nullable(),
    description: z.string().trim().min(1).max(200),
    qty_received: z.coerce.number().min(0),
    qty_rejected: z.coerce.number().min(0).default(0),
    unit_cost: money.default(0),
  })).min(1).max(200),
});

r.post('/grns', requirePerm('grn.manage'), async (req, res) => {
  const d = parse(grnSchema, req.body);
  const items = d.items.filter((i) => i.qty_received > 0);
  if (!items.length) throw new HttpError(400, 'Enter the quantity received for at least one item');
  const grnId = await tx(async (c) => {
    let po = null;
    if (d.po_id) {
      po = (await c.query('SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE', [d.po_id])).rows[0];
      if (!po) throw new HttpError(404, 'Purchase order not found');
      if (!['ORDERED', 'PARTIAL'].includes(po.status)) throw new HttpError(400, 'Goods can only be received against an ordered purchase order');
      if (po.supplier_id !== d.supplier_id) throw new HttpError(400, 'Supplier does not match the purchase order');
    }
    const g = (await c.query(
      `INSERT INTO grns (grn_no, po_id, supplier_id, received_date, supplier_invoice_no, supplier_invoice_date, delivery_note_no, vehicle_no,
                         received_by, notes, discount, tax_amount)
       VALUES ('GRN' || to_char(now(), 'YY') || '-' || lpad(nextval('grn_no_seq')::text, 5, '0'), $1,$2, COALESCE($3::date, CURRENT_DATE),
               $4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [d.po_id || null, d.supplier_id, d.received_date || null, d.supplier_invoice_no, d.supplier_invoice_date, d.delivery_note_no,
        d.vehicle_no, req.user.id, d.notes, d.discount, d.tax_amount],
    )).rows[0];

    for (const it of items) {
      let partId = it.part_id || null;
      if (it.po_item_id) {
        if (!po) throw new HttpError(400, 'PO line given without a purchase order');
        const pl = (await c.query('SELECT * FROM purchase_order_items WHERE id = $1 AND po_id = $2 FOR UPDATE', [it.po_item_id, po.id])).rows[0];
        if (!pl) throw new HttpError(400, 'PO line not found');
        const remaining = Number(pl.qty_ordered) - Number(pl.qty_received);
        if (it.qty_received > remaining + 1e-9) throw new HttpError(400, `${pl.description}: only ${remaining} left to receive on this PO`);
        await c.query('UPDATE purchase_order_items SET qty_received = qty_received + $1 WHERE id = $2', [it.qty_received, pl.id]);
        partId = pl.part_id;
      }
      await c.query(
        `INSERT INTO grn_items (grn_id, po_item_id, part_id, description, qty_received, qty_rejected, unit_cost) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [g.id, it.po_item_id || null, partId, it.description, it.qty_received, it.qty_rejected, it.unit_cost],
      );
      if (partId) {
        await c.query(
          `UPDATE parts SET stock_qty = stock_qty + $1 ${d.update_cost && it.unit_cost > 0 ? ', cost_price = $3' : ''} WHERE id = $2`,
          d.update_cost && it.unit_cost > 0 ? [Math.round(it.qty_received), partId, it.unit_cost] : [Math.round(it.qty_received), partId],
        );
      }
    }

    if (po) {
      const left = (await c.query('SELECT count(*)::int AS n FROM purchase_order_items WHERE po_id = $1 AND qty_received < qty_ordered', [po.id])).rows[0].n;
      await c.query('UPDATE purchase_orders SET status = $1, updated_at = now() WHERE id = $2', [left === 0 ? 'RECEIVED' : 'PARTIAL', po.id]);
    }
    return g.id;
  });
  emitPartsChanged();
  res.status(201).json(await loadGrn(grnId));
});

export default r;
