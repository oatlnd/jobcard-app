// Job status (work in the workshop) and delivery status (handing the bike back) are tracked separately.
export const STATUSES = ['CHECKED_IN', 'IN_PROGRESS', 'WAITING_PARTS', 'QA_CHECK', 'COMPLETED', 'CANCELLED'];
export const DELIVERY_STATUSES = ['PENDING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'];

export const TRANSITIONS = {
  CHECKED_IN: ['IN_PROGRESS', 'WAITING_PARTS', 'CANCELLED'],
  IN_PROGRESS: ['WAITING_PARTS', 'QA_CHECK', 'CANCELLED'],
  WAITING_PARTS: ['IN_PROGRESS', 'CANCELLED'],
  QA_CHECK: ['COMPLETED', 'IN_PROGRESS'], // QA fail sends it back to the mechanic
  COMPLETED: ['IN_PROGRESS'], // reopen (only before delivery)
  CANCELLED: [],
};

export const DELIVERY_TRANSITIONS = {
  PENDING: [],                 // becomes READY automatically when the job is completed
  READY: ['OUT_FOR_DELIVERY', 'DELIVERED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'READY'],
  DELIVERED: [],
};

/** Permission needed to make a job status move. */
export function permForTransition(from, to) {
  if (to === 'CANCELLED') return 'jobs.cancel';
  if (from === 'QA_CHECK') return 'jobs.qa';        // pass or fail QA
  if (from === 'COMPLETED') return 'jobs.qa';       // reopen a completed job
  return 'jobs.status';
}

export const LABELS = {
  en: {
    CHECKED_IN: 'Checked in',
    IN_PROGRESS: 'In progress',
    WAITING_PARTS: 'Waiting for parts',
    QA_CHECK: 'Quality check',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
    PENDING: 'Not ready',
    READY: 'Ready for pickup',
    OUT_FOR_DELIVERY: 'Out for delivery',
    DELIVERED: 'Delivered',
  },
  ta: {
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
  },
};

export const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to);
export const canDeliveryTransition = (from, to) => (DELIVERY_TRANSITIONS[from] || []).includes(to);
