// Job card lifecycle and allowed transitions.
export const STATUSES = ['CHECKED_IN', 'IN_PROGRESS', 'WAITING_PARTS', 'QA_CHECK', 'READY', 'DELIVERED', 'CANCELLED'];

export const TRANSITIONS = {
  CHECKED_IN: ['IN_PROGRESS', 'WAITING_PARTS', 'CANCELLED'],
  IN_PROGRESS: ['WAITING_PARTS', 'QA_CHECK', 'CANCELLED'],
  WAITING_PARTS: ['IN_PROGRESS', 'CANCELLED'],
  QA_CHECK: ['READY', 'IN_PROGRESS'], // QA fail sends it back to the mechanic
  READY: ['DELIVERED', 'IN_PROGRESS'],
  DELIVERED: [],
  CANCELLED: [],
};

// Who may move a job into a status.
export const ROLE_CAN_SET = {
  admin: STATUSES,
  advisor: STATUSES,
  mechanic: ['IN_PROGRESS', 'WAITING_PARTS', 'QA_CHECK'],
};

export const LABELS = {
  en: {
    CHECKED_IN: 'Checked in',
    IN_PROGRESS: 'In progress',
    WAITING_PARTS: 'Waiting for parts',
    QA_CHECK: 'Quality check',
    READY: 'Ready for pickup',
    DELIVERED: 'Delivered',
    CANCELLED: 'Cancelled',
  },
  ta: {
    CHECKED_IN: 'பதிவு செய்யப்பட்டது',
    IN_PROGRESS: 'வேலை நடைபெறுகிறது',
    WAITING_PARTS: 'உதிரிப்பாகங்களுக்காக காத்திருக்கிறது',
    QA_CHECK: 'தரச் சோதனை',
    READY: 'எடுத்துச் செல்லத் தயார்',
    DELIVERED: 'ஒப்படைக்கப்பட்டது',
    CANCELLED: 'ரத்து செய்யப்பட்டது',
  },
};

export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}
