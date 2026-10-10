// Job status = work in the workshop. Delivery status = handing the bike back. Must mirror server/src/lib/status.js
export const STATUSES = ['CHECKED_IN', 'IN_PROGRESS', 'WAITING_PARTS', 'QA_CHECK', 'COMPLETED', 'CANCELLED'];
export const DELIVERY_STATUSES = ['PENDING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'];
export const BOARD_COLUMNS = ['CHECKED_IN', 'IN_PROGRESS', 'WAITING_PARTS', 'QA_CHECK', 'COMPLETED'];

export const STATUS_LABEL = {
  CHECKED_IN: 'Checked in',
  IN_PROGRESS: 'In progress',
  WAITING_PARTS: 'Waiting for parts',
  QA_CHECK: 'Quality check',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};
export const DELIVERY_LABEL = {
  PENDING: 'Not ready',
  READY: 'Ready for pickup',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
};
export const STATUS_LABEL_TA = {
  CHECKED_IN: 'பதிவு செய்யப்பட்டது',
  IN_PROGRESS: 'வேலை நடைபெறுகிறது',
  WAITING_PARTS: 'உதிரிப்பாகங்களுக்காக காத்திருக்கிறது',
  QA_CHECK: 'தரச் சோதனை',
  COMPLETED: 'வேலை முடிந்தது',
  CANCELLED: 'ரத்து செய்யப்பட்டது',
  PENDING: 'இன்னும் தயாரில்லை',
  READY: 'எடுத்துச் செல்லத் தயார்',
  OUT_FOR_DELIVERY: 'விநியோகத்திற்காக அனுப்பப்பட்டது',
  DELIVERED: 'ஒப்படைக்கப்பட்டது',
};

export const TRANSITIONS = {
  CHECKED_IN: ['IN_PROGRESS', 'WAITING_PARTS', 'CANCELLED'],
  IN_PROGRESS: ['WAITING_PARTS', 'QA_CHECK', 'CANCELLED'],
  WAITING_PARTS: ['IN_PROGRESS', 'CANCELLED'],
  QA_CHECK: ['COMPLETED', 'IN_PROGRESS'],
  COMPLETED: ['IN_PROGRESS'],
  CANCELLED: [],
};
export const DELIVERY_TRANSITIONS = {
  PENDING: [],
  READY: ['OUT_FOR_DELIVERY', 'DELIVERED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'READY'],
  DELIVERED: [],
};
export function permForTransition(from, to) {
  if (to === 'CANCELLED') return 'jobs.cancel';
  if (from === 'QA_CHECK' || from === 'COMPLETED') return 'jobs.qa';
  return 'jobs.status';
}
/** Job status moves this user may make right now */
export function allowedStatuses(job, can) {
  if (job.delivery_status === 'DELIVERED') return [];
  return (TRANSITIONS[job.status] || []).filter((s) => can(permForTransition(job.status, s)));
}
export function allowedDelivery(job, can) {
  if (job.status !== 'COMPLETED' || !can('jobs.delivery')) return [];
  return DELIVERY_TRANSITIONS[job.delivery_status] || [];
}

export function actionLabel(from, to) {
  if (to === 'IN_PROGRESS') {
    if (from === 'QA_CHECK') return 'QA failed – back to mechanic';
    if (from === 'COMPLETED') return 'Reopen work';
    if (from === 'WAITING_PARTS') return 'Parts arrived – resume';
    return 'Start work';
  }
  return { WAITING_PARTS: 'Waiting for parts', QA_CHECK: 'Send to QA', COMPLETED: 'QA passed – complete', CANCELLED: 'Cancel job' }[to] || to;
}
export const DELIVERY_ACTION = { OUT_FOR_DELIVERY: 'Send out for delivery', DELIVERED: 'Hand over to customer', READY: 'Back to ready' };

export const ITEM_TYPE_LABEL = { service: 'Service', custom_service: 'Custom service', part: 'Part', custom_part: 'Custom part' };
export const isServiceItem = (i) => i.item_type === 'service' || i.item_type === 'custom_service';

export const HONDA_MODELS = [
  'Dio', 'Activa', 'Grazia', 'Shine 100', 'CB Shine', 'CB Shine SP', 'SP 125', 'Livo', 'CD 110 Dream', 'Dream Neo',
  'Unicorn', 'X-Blade', 'Hornet 2.0', 'CB200X', 'XR150L', 'CB350', 'Other',
];

const YEAR_NOW = new Date().getFullYear();
export const YEARS = Array.from({ length: YEAR_NOW + 1 - 2000 }, (_, i) => YEAR_NOW - i);
export const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Card', 'Cheque', 'Other'];
// Methods the cashier takes from customers
export const CASHIER_METHODS = ['Cash', 'Card', 'Bank Transfer'];

// Visit types: what the customer came for. Mirrors server/src/lib/kits.js VISIT_TYPES and the rules in routes/jobs.js
export const VISIT = {
  FREE_1: { label: 'Free service 1', short: 'FREE 1', icon: '🎁', hint: 'Labour FREE · pays oil & parts', needBike: true, needOdo: true },
  FREE_2: { label: 'Free service 2', short: 'FREE 2', icon: '🎁', hint: 'Labour FREE · pays oil & parts', needBike: true, needOdo: true },
  WARRANTY: { label: 'Service – under warranty', short: 'WARRANTY', icon: '🛡', hint: 'Pays service + oil', needBike: true, needOdo: true },
  PAID: { label: 'Service – out of warranty', short: 'PAID SVC', icon: '🔩', hint: 'Older bikes · pays service + oil' },
  MINOR: { label: 'Minor repair', short: 'MINOR', icon: '🛠', hint: 'e.g. brake pads, cables', needComplaint: true },
  MAJOR: { label: 'Major repair', short: 'MAJOR', icon: '⚙', hint: 'Mechanical work · usually pays at pickup', needComplaint: true, payLater: true },
};
export const SERVICE_KINDS = Object.keys(VISIT);
export const SERVICE_KIND_LABEL = Object.fromEntries(SERVICE_KINDS.map((k) => [k, VISIT[k].label]));
export const SERVICE_KIND_SHORT = Object.fromEntries(SERVICE_KINDS.map((k) => [k, VISIT[k].short]));
export const isFreeService = (k) => k === 'FREE_1' || k === 'FREE_2';
export const PAY_STATE_LABEL = { DUE: 'Unpaid', PAID: 'Paid', REFUND: 'Refund due' };

/** Bike number for display; unregistered bikes show the chassis number instead */
export const bikeLabel = (b) => (b?.reg_no?.startsWith('UNREG') ? `New · ${b.chassis_no || b.reg_no.slice(5)}` : fmtReg(b?.reg_no));

export const num = (n) => Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (n) => 'LKR ' + num(n);

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const thisPeriod = () => todayIso().slice(0, 7);
export const fmtPeriod = (p) => (p ? new Date(`${p}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '');

export const fmtDate = (d) => (d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export function fmtMobile(m) {
  if (!m || m.length !== 11) return m || '';
  const l = '0' + m.slice(2);
  return `${l.slice(0, 3)} ${l.slice(3, 6)} ${l.slice(6)}`;
}

/** NPBCJ4521 -> NP BCJ-4521 (display only) */
export function fmtReg(r) {
  if (!r) return '';
  if (r.startsWith('UNREG')) return 'Not registered';
  const m = r.match(/^([A-Z]{2})?([A-Z]{1,3})(\d{4})$/);
  if (!m) return r;
  return [m[1], `${m[2]}-${m[3]}`].filter(Boolean).join(' ');
}

export function timeAgo(d) {
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export const localToIso = (v) => (v ? new Date(v).toISOString() : null);
export function isoToLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Shrink a phone photo before upload (keeps PDFs as they are). */
export async function compressImage(file, maxSide = 1600, quality = 0.82) {
  if (!file.type.startsWith('image/') || file.type === 'image/heic') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 900_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/** Format a mobile number while typing: 0771234567 / +94771234567 → 077 123 4567 */
export function formatMobileInput(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('94')) d = '0' + d.slice(2);
  if (d && !d.startsWith('0')) d = '0' + d;
  d = d.slice(0, 10);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join(' ');
}
export const isValidMobileInput = (v) => /^07\d{8}$/.test(String(v || '').replace(/\D/g, ''));

// ---- Estimated delivery: quick choices, counted in workshop opening hours ----
export const ESTIMATE_OPTIONS = [
  ...[30, 60, 90, 120, 150, 180, 210, 240].map((m) => ({ key: `m${m}`, label: m < 60 ? '30 minutes' : `${m / 60} hour${m === 60 ? '' : 's'}`.replace('.5', '½'), minutes: m })),
  { key: 'm720', label: '12 hours', minutes: 720 },
  { key: 'd1', label: '1 day', days: 1 },
  { key: 'd3', label: '3 days', days: 3 },
  { key: 'd7', label: '1 week', days: 7 },
  { key: 'd30', label: '1 month', days: 30 },
];
const atTime = (d, hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); const x = new Date(d); x.setHours(h, m || 0, 0, 0); return x; };
/** Move a time into opening hours: before opening → opening time; after closing → next day's opening. */
function intoHours(t, open, close) {
  const o = atTime(t, open); const c = atTime(t, close);
  if (t < o) return o;
  if (t >= c) { const n = new Date(o); n.setDate(n.getDate() + 1); return n; }
  return t;
}
/** When will it be ready? Hours are counted only while the workshop is open (e.g. 8:00–17:00). */
export function readyBy(optionKey, hours = {}, from = new Date()) {
  const open = hours.open || '08:00'; const close = hours.close || '17:00';
  const opt = ESTIMATE_OPTIONS.find((o) => o.key === optionKey);
  if (!opt) return null;
  if (opt.days) {
    const t = new Date(from); t.setDate(t.getDate() + opt.days);
    return intoHours(t, open, close);
  }
  let t = intoHours(new Date(from), open, close);
  let left = opt.minutes;
  for (let guard = 0; guard < 60; guard++) {
    const avail = (atTime(t, close) - t) / 60000;
    if (left <= avail) return new Date(t.getTime() + left * 60000);
    left -= avail;
    const n = atTime(t, open); n.setDate(n.getDate() + 1); t = n;
  }
  return t;
}
export const fmtReady = (d) => (d ? new Date(d).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) : '');
