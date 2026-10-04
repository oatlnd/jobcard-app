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

export const SERVICE_KINDS = ['FREE_1', 'FREE_2', 'PAID'];
export const SERVICE_KIND_LABEL = { FREE_1: 'Free service 1', FREE_2: 'Free service 2', PAID: 'Paid service' };
export const SERVICE_KIND_SHORT = { FREE_1: 'FREE 1', FREE_2: 'FREE 2', PAID: 'PAID SVC' };
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
