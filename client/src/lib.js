export const STATUSES = ['CHECKED_IN', 'IN_PROGRESS', 'WAITING_PARTS', 'QA_CHECK', 'READY', 'DELIVERED', 'CANCELLED'];
export const BOARD_COLUMNS = ['CHECKED_IN', 'IN_PROGRESS', 'WAITING_PARTS', 'QA_CHECK', 'READY', 'DELIVERED'];

export const STATUS_LABEL = {
  CHECKED_IN: 'Checked in',
  IN_PROGRESS: 'In progress',
  WAITING_PARTS: 'Waiting for parts',
  QA_CHECK: 'Quality check',
  READY: 'Ready for pickup',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export const STATUS_LABEL_TA = {
  CHECKED_IN: 'பதிவு செய்யப்பட்டது',
  IN_PROGRESS: 'வேலை நடைபெறுகிறது',
  WAITING_PARTS: 'உதிரிப்பாகங்களுக்காக காத்திருக்கிறது',
  QA_CHECK: 'தரச் சோதனை',
  READY: 'எடுத்துச் செல்லத் தயார்',
  DELIVERED: 'ஒப்படைக்கப்பட்டது',
  CANCELLED: 'ரத்து செய்யப்பட்டது',
};

// Must mirror server/src/lib/status.js
export const TRANSITIONS = {
  CHECKED_IN: ['IN_PROGRESS', 'WAITING_PARTS', 'CANCELLED'],
  IN_PROGRESS: ['WAITING_PARTS', 'QA_CHECK', 'CANCELLED'],
  WAITING_PARTS: ['IN_PROGRESS', 'CANCELLED'],
  QA_CHECK: ['READY', 'IN_PROGRESS'],
  READY: ['DELIVERED', 'IN_PROGRESS'],
  DELIVERED: [],
  CANCELLED: [],
};
export const ROLE_CAN_SET = {
  admin: STATUSES,
  advisor: STATUSES,
  mechanic: ['IN_PROGRESS', 'WAITING_PARTS', 'QA_CHECK'],
};

export const ACTION_LABEL = {
  IN_PROGRESS: 'Start work',
  WAITING_PARTS: 'Waiting for parts',
  QA_CHECK: 'Send to QA',
  READY: 'QA passed – ready',
  DELIVERED: 'Deliver to customer',
  CANCELLED: 'Cancel job',
};

export const HONDA_MODELS = [
  'Dio', 'Activa', 'Grazia', 'Shine 100', 'CB Shine', 'CB Shine SP', 'SP 125', 'Livo', 'CD 110 Dream', 'Dream Neo',
  'Unicorn', 'X-Blade', 'Hornet 2.0', 'CB200X', 'XR150L', 'CB350', 'Other',
];

const YEAR_NOW = new Date().getFullYear();
export const YEARS = Array.from({ length: YEAR_NOW + 1 - 2000 }, (_, i) => YEAR_NOW - i);

export const money = (n) =>
  'LKR ' + Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
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

/** Convert <input type="datetime-local"> value to ISO with offset, and back. */
export const localToIso = (v) => (v ? new Date(v).toISOString() : null);
export function isoToLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
