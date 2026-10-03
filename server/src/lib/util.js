/** Normalise a Sri Lankan mobile number to 94XXXXXXXXX. Returns null if invalid. */
export function normalizeMobile(input) {
  if (!input) return null;
  let d = String(input).replace(/\D/g, '');
  if (d.startsWith('0094')) d = d.slice(2);
  if (d.length === 10 && d.startsWith('0')) d = '94' + d.slice(1);
  if (d.length === 9 && d.startsWith('7')) d = '94' + d;
  if (!/^94\d{9}$/.test(d)) return null;
  return d;
}

/** Display format: 077 123 4567 */
export function formatMobile(d) {
  if (!d || d.length !== 11) return d || '';
  const local = '0' + d.slice(2);
  return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

/** Normalise bike registration: "np bci-1234" -> "NPBCI1234" */
export function normalizeRegNo(input) {
  return String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
