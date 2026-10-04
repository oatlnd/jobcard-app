// Every permission the app checks. Admin can give any combination to a role (Staff → Roles & permissions).
export const PERMISSION_GROUPS = [
  {
    group: 'Job cards',
    items: [
      ['jobs.view', 'View job cards and the board'],
      ['jobs.view_all', 'See all jobs (otherwise only jobs assigned to them or unassigned)'],
      ['jobs.create', 'Open new job cards'],
      ['jobs.edit', 'Edit job details and assign mechanics'],
      ['jobs.items', 'Add / remove services and parts on a job'],
      ['jobs.pricing', 'See amounts, change prices and give discounts'],
      ['jobs.status', 'Change job status (start, waiting for parts, send to QA)'],
      ['jobs.qa', 'Pass or fail quality check'],
      ['jobs.cancel', 'Cancel job cards'],
      ['jobs.delivery', 'Change delivery status / hand over bikes'],
      ['jobs.print', 'Print job cards and invoices'],
    ],
  },
  {
    group: 'Billing',
    items: [
      ['invoices.view', 'View invoices'],
      ['invoices.manage', 'Create and cancel invoices'],
      ['payments.record', 'Record customer payments'],
    ],
  },
  {
    group: 'Customers',
    items: [
      ['customers.view', 'View customers and history'],
      ['customers.manage', 'Add and edit customers and bikes'],
    ],
  },
  {
    group: 'Parts & stock',
    items: [
      ['parts.view', 'View parts and stock'],
      ['parts.manage', 'Add and edit parts and prices'],
      ['stock.adjust', 'Adjust stock manually'],
      ['masters.manage', 'Maintain service types and category lists'],
    ],
  },
  {
    group: 'Purchasing',
    items: [
      ['purchasing.view', 'View suppliers, purchase orders and GRNs'],
      ['purchasing.manage', 'Create suppliers and purchase orders'],
      ['grn.manage', 'Receive goods (GRN) into stock'],
    ],
  },
  {
    group: 'Expenses',
    items: [
      ['expenses.view', 'View expenses'],
      ['expenses.manage', 'Add, edit and delete expenses'],
    ],
  },
  {
    group: 'Employees & payroll',
    items: [
      ['employees.view', 'View employees'],
      ['employees.manage', 'Add and edit employees'],
      ['attendance.manage', 'Mark attendance'],
      ['advances.manage', 'Give salary advances'],
      ['payroll.view', 'View payroll runs and payslips'],
      ['payroll.run', 'Run and finalise payroll'],
    ],
  },
  {
    group: 'Messages & dashboard',
    items: [
      ['messages.view', 'View reminders and message log'],
      ['messages.send', 'Resend / retry customer messages'],
      ['dashboard.finance', 'See money figures on the dashboard'],
    ],
  },
  {
    group: 'Administration',
    items: [
      ['users.manage', 'Manage staff logins, roles and permissions'],
      ['settings.manage', 'Change shop settings'],
    ],
  },
];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.items.map(([k]) => k));

export const DEFAULT_ROLES = {
  Admin: { description: 'Full access to everything', permissions: ALL_PERMISSIONS, is_system: true },
  'Service Advisor': {
    description: 'Front desk: job cards, billing, customers, parts',
    permissions: [
      'jobs.view', 'jobs.view_all', 'jobs.create', 'jobs.edit', 'jobs.items', 'jobs.pricing', 'jobs.status', 'jobs.qa', 'jobs.cancel',
      'jobs.delivery', 'jobs.print', 'invoices.view', 'invoices.manage', 'payments.record', 'customers.view', 'customers.manage',
      'parts.view', 'parts.manage', 'purchasing.view', 'expenses.view', 'expenses.manage', 'messages.view', 'messages.send',
      'dashboard.finance',
    ],
  },
  Mechanic: {
    description: 'Workshop: own jobs, status updates, parts used',
    permissions: ['jobs.view', 'jobs.items', 'jobs.status', 'parts.view'],
  },
  Accountant: {
    description: 'Billing, expenses, purchasing, payroll',
    permissions: [
      'jobs.view', 'jobs.view_all', 'jobs.pricing', 'jobs.print', 'invoices.view', 'invoices.manage', 'payments.record', 'customers.view',
      'parts.view', 'purchasing.view', 'purchasing.manage', 'expenses.view', 'expenses.manage', 'employees.view', 'employees.manage',
      'attendance.manage', 'advances.manage', 'payroll.view', 'payroll.run', 'dashboard.finance',
    ],
  },
  Cashier: {
    description: 'Takes payments, prints receipts, hands over bikes',
    permissions: ['jobs.view', 'jobs.view_all', 'jobs.print', 'jobs.delivery', 'payments.record', 'invoices.view', 'customers.view'],
  },
  'Store Keeper': {
    description: 'Parts, stock, purchase orders and GRN',
    permissions: ['jobs.view', 'jobs.view_all', 'parts.view', 'parts.manage', 'stock.adjust', 'masters.manage', 'purchasing.view', 'purchasing.manage', 'grn.manage'],
  },
};

export const can = (user, perm) => !!user?.permissions?.includes(perm);
