-- v2: roles & permissions, job/delivery status, multi services, masters, purchasing, expenses, HR & payroll

-- ========== Roles & permissions ==========
CREATE TABLE roles (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO roles (name, description, permissions, is_system) VALUES
  ('Admin', 'Full access to everything', ARRAY['jobs.view','jobs.view_all','jobs.create','jobs.edit','jobs.items','jobs.pricing','jobs.status','jobs.qa','jobs.cancel','jobs.delivery','jobs.print','invoices.view','invoices.manage','payments.record','customers.view','customers.manage','parts.view','parts.manage','stock.adjust','masters.manage','purchasing.view','purchasing.manage','grn.manage','expenses.view','expenses.manage','employees.view','employees.manage','attendance.manage','advances.manage','payroll.view','payroll.run','messages.view','messages.send','dashboard.finance','users.manage','settings.manage']::text[], TRUE),
  ('Service Advisor', 'Front desk: job cards, billing, customers, parts', ARRAY['jobs.view','jobs.view_all','jobs.create','jobs.edit','jobs.items','jobs.pricing','jobs.status','jobs.qa','jobs.cancel','jobs.delivery','jobs.print','invoices.view','invoices.manage','payments.record','customers.view','customers.manage','parts.view','parts.manage','purchasing.view','expenses.view','expenses.manage','messages.view','messages.send','dashboard.finance']::text[], FALSE),
  ('Mechanic', 'Workshop: own jobs, status updates, parts used', ARRAY['jobs.view','jobs.items','jobs.status','parts.view']::text[], FALSE),
  ('Accountant', 'Billing, expenses, purchasing, payroll', ARRAY['jobs.view','jobs.view_all','jobs.pricing','jobs.print','invoices.view','invoices.manage','payments.record','customers.view','parts.view','purchasing.view','purchasing.manage','expenses.view','expenses.manage','employees.view','employees.manage','attendance.manage','advances.manage','payroll.view','payroll.run','dashboard.finance']::text[], FALSE),
  ('Store Keeper', 'Parts, stock, purchase orders and GRN', ARRAY['jobs.view','jobs.view_all','parts.view','parts.manage','stock.adjust','masters.manage','purchasing.view','purchasing.manage','grn.manage']::text[], FALSE);

ALTER TABLE users ADD COLUMN role_id INT REFERENCES roles(id);
UPDATE users SET role_id = (SELECT id FROM roles WHERE name = CASE users.role
  WHEN 'admin' THEN 'Admin' WHEN 'advisor' THEN 'Service Advisor' ELSE 'Mechanic' END);
ALTER TABLE users ALTER COLUMN role_id SET NOT NULL;
ALTER TABLE users DROP COLUMN role;

-- ========== Generic lookup lists (maintainable dropdowns) ==========
CREATE TABLE lookups (
  id         SERIAL PRIMARY KEY,
  type       TEXT NOT NULL CHECK (type IN ('part_category','expense_category','designation','unit')),
  name       TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (type, name)
);
INSERT INTO lookups (type, name, sort_order) VALUES
  ('part_category','Engine Components',1),('part_category','Transmission',2),('part_category','Electrical',3),
  ('part_category','Body Parts',4),('part_category','Suspension',5),('part_category','Brakes',6),
  ('part_category','Oils & Lubricants',7),('part_category','Filters',8),('part_category','Tyres & Tubes',9),
  ('part_category','Accessories',10),('part_category','General',11),
  ('expense_category','Electricity',1),('expense_category','Water',2),('expense_category','Rent',3),
  ('expense_category','Telephone & Internet',4),('expense_category','Tea & Refreshments',5),('expense_category','Cleaning',6),
  ('expense_category','Tools & Equipment',7),('expense_category','Repairs & Maintenance',8),('expense_category','Transport & Fuel',9),
  ('expense_category','Outside Work (Lathe / Painting)',10),('expense_category','Stationery & Printing',11),
  ('expense_category','Advertising',12),('expense_category','Bank Charges',13),('expense_category','Other',14),
  ('designation','Manager',1),('designation','Service Advisor',2),('designation','Senior Mechanic',3),
  ('designation','Mechanic',4),('designation','Helper',5),('designation','Cashier',6),('designation','Washer',7),
  ('unit','Nos',1),('unit','Set',2),('unit','Litre',3),('unit','ml',4),('unit','Pair',5),('unit','Metre',6);
-- keep categories already used by existing parts
INSERT INTO lookups (type, name, sort_order)
  SELECT DISTINCT 'part_category', category, 50 FROM parts ON CONFLICT DO NOTHING;

-- ========== Service types master ==========
CREATE TABLE service_types (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  description   TEXT,
  default_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order    INT NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO service_types (name, default_price, sort_order) VALUES
  ('Free Service', 0, 1), ('Periodic Service', 2500, 2), ('General Service', 2500, 3), ('Oil Change', 500, 4),
  ('Brake Service', 1200, 5), ('Chain Clean & Adjust', 600, 6), ('Carburettor / Throttle Body Cleaning', 1500, 7),
  ('Engine Tune-up', 2000, 8), ('Electrical Repair', 1500, 9), ('Clutch Overhaul', 3500, 10),
  ('Engine Overhaul', 15000, 11), ('Wheel & Tyre Work', 800, 12), ('Wash & Polish', 800, 13),
  ('Accident Repair', 0, 14), ('Warranty Repair', 0, 15), ('Inspection', 500, 16);

-- ========== Parts: cost price & unit ==========
ALTER TABLE parts ADD COLUMN cost_price NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE parts ADD COLUMN unit TEXT NOT NULL DEFAULT 'Nos';
ALTER TABLE parts ADD COLUMN brand TEXT;
ALTER TABLE parts ADD COLUMN location TEXT; -- rack / bin

-- ========== Job items: services, parts, custom lines ==========
ALTER TABLE job_items DROP CONSTRAINT job_items_item_type_check;
UPDATE job_items SET item_type = 'custom_service' WHERE item_type = 'labour';
ALTER TABLE job_items ADD CONSTRAINT job_items_item_type_check
  CHECK (item_type IN ('service','part','custom_service','custom_part'));
ALTER TABLE job_items ADD COLUMN service_type_id INT REFERENCES service_types(id);
ALTER TABLE job_items ADD COLUMN unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE job_items ADD COLUMN added_by INT REFERENCES users(id);

-- ========== Job status vs delivery status ==========
ALTER TABLE job_cards DROP CONSTRAINT job_cards_status_check;
ALTER TABLE job_cards ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE job_cards ADD COLUMN delivery_method TEXT NOT NULL DEFAULT 'PICKUP';
ALTER TABLE job_cards ADD COLUMN delivery_address TEXT;
ALTER TABLE job_cards ADD COLUMN delivered_to TEXT;
ALTER TABLE job_cards ADD COLUMN delivery_note TEXT;
UPDATE job_cards SET delivery_status = 'DELIVERED' WHERE status = 'DELIVERED';
UPDATE job_cards SET delivery_status = 'READY' WHERE status = 'READY';
UPDATE job_cards SET status = 'COMPLETED' WHERE status IN ('READY','DELIVERED');
ALTER TABLE job_cards ADD CONSTRAINT job_cards_status_check
  CHECK (status IN ('CHECKED_IN','IN_PROGRESS','WAITING_PARTS','QA_CHECK','COMPLETED','CANCELLED'));
ALTER TABLE job_cards ADD CONSTRAINT job_cards_delivery_status_check
  CHECK (delivery_status IN ('PENDING','READY','OUT_FOR_DELIVERY','DELIVERED'));
ALTER TABLE job_cards ADD CONSTRAINT job_cards_delivery_method_check
  CHECK (delivery_method IN ('PICKUP','HOME_DELIVERY'));
ALTER TABLE job_cards ALTER COLUMN service_type DROP NOT NULL;
ALTER TABLE job_cards ALTER COLUMN service_type DROP DEFAULT;
CREATE INDEX job_cards_delivery_idx ON job_cards (delivery_status);

ALTER TABLE job_status_history ADD COLUMN kind TEXT NOT NULL DEFAULT 'job' CHECK (kind IN ('job','delivery'));
UPDATE job_status_history SET kind = 'delivery' WHERE to_status = 'DELIVERED';
UPDATE job_status_history SET from_status = 'COMPLETED' WHERE kind = 'delivery' AND from_status = 'READY';
UPDATE job_status_history SET to_status = 'COMPLETED' WHERE to_status = 'READY';
UPDATE job_status_history SET from_status = 'COMPLETED' WHERE from_status = 'READY';

-- Existing single service type becomes a service line (amount 0) so history keeps it
INSERT INTO service_types (name, sort_order)
  SELECT DISTINCT service_type, 90 FROM job_cards WHERE service_type IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO job_items (job_card_id, item_type, service_type_id, description, qty, unit_price)
  SELECT j.id, 'service', s.id, s.name, 1, 0 FROM job_cards j JOIN service_types s ON s.name = j.service_type;

-- ========== Attachments (photos / receipts) ==========
CREATE TABLE attachments (
  id            SERIAL PRIMARY KEY,
  entity_type   TEXT NOT NULL CHECK (entity_type IN ('expense','grn','purchase_order','job_card','employee')),
  entity_id     INT NOT NULL,
  file_name     TEXT NOT NULL,      -- stored name on disk
  original_name TEXT,
  mime_type     TEXT NOT NULL,
  size_bytes    INT NOT NULL,
  uploaded_by   INT REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX attachments_entity_idx ON attachments (entity_type, entity_id);

-- ========== Suppliers, purchase orders, GRN ==========
CREATE TABLE suppliers (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE,
  contact_person TEXT,
  phone          TEXT,
  email          TEXT,
  address        TEXT,
  tax_no         TEXT,
  payment_terms  TEXT,        -- e.g. Cash, 30 days credit
  notes          TEXT,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE SEQUENCE po_no_seq START 1;
CREATE SEQUENCE grn_no_seq START 1;

CREATE TABLE purchase_orders (
  id             SERIAL PRIMARY KEY,
  po_no          TEXT NOT NULL UNIQUE,
  supplier_id    INT NOT NULL REFERENCES suppliers(id),
  order_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_date  DATE,
  status         TEXT NOT NULL DEFAULT 'DRAFT'
                 CHECK (status IN ('DRAFT','ORDERED','PARTIAL','RECEIVED','CLOSED','CANCELLED')),
  reference      TEXT,           -- supplier quotation no etc.
  payment_terms  TEXT,
  delivery_to    TEXT,
  notes          TEXT,
  discount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by     INT REFERENCES users(id),
  approved_by    INT REFERENCES users(id),
  ordered_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE purchase_order_items (
  id           SERIAL PRIMARY KEY,
  po_id        INT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  part_id      INT REFERENCES parts(id),
  description  TEXT NOT NULL,
  qty_ordered  NUMERIC(10,2) NOT NULL CHECK (qty_ordered > 0),
  qty_received NUMERIC(10,2) NOT NULL DEFAULT 0,
  unit_cost    NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total   NUMERIC(12,2) GENERATED ALWAYS AS (round(qty_ordered * unit_cost, 2)) STORED
);
CREATE INDEX po_items_po_idx ON purchase_order_items (po_id);

CREATE TABLE grns (
  id                SERIAL PRIMARY KEY,
  grn_no            TEXT NOT NULL UNIQUE,
  po_id             INT REFERENCES purchase_orders(id),
  supplier_id       INT NOT NULL REFERENCES suppliers(id),
  received_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  supplier_invoice_no   TEXT,
  supplier_invoice_date DATE,
  delivery_note_no  TEXT,
  vehicle_no        TEXT,
  received_by       INT REFERENCES users(id),
  notes             TEXT,
  discount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE grn_items (
  id           SERIAL PRIMARY KEY,
  grn_id       INT NOT NULL REFERENCES grns(id) ON DELETE CASCADE,
  po_item_id   INT REFERENCES purchase_order_items(id),
  part_id      INT REFERENCES parts(id),
  description  TEXT NOT NULL,
  qty_received NUMERIC(10,2) NOT NULL CHECK (qty_received > 0),
  qty_rejected NUMERIC(10,2) NOT NULL DEFAULT 0,
  unit_cost    NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total   NUMERIC(12,2) GENERATED ALWAYS AS (round(qty_received * unit_cost, 2)) STORED
);
CREATE INDEX grn_items_grn_idx ON grn_items (grn_id);

-- ========== Expenses ==========
CREATE SEQUENCE expense_no_seq START 1;
CREATE TABLE expenses (
  id             SERIAL PRIMARY KEY,
  expense_no     TEXT NOT NULL UNIQUE,
  expense_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  expense_type   TEXT NOT NULL CHECK (expense_type IN ('INTERNAL','EXTERNAL')),
  category       TEXT NOT NULL,
  description    TEXT NOT NULL,
  amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL DEFAULT 'Cash',
  paid_to        TEXT,
  reference_no   TEXT,
  job_card_id    INT REFERENCES job_cards(id),
  supplier_id    INT REFERENCES suppliers(id),
  created_by     INT REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX expenses_date_idx ON expenses (expense_date);

-- ========== Employees, attendance, advances, payroll ==========
CREATE TABLE employees (
  id              SERIAL PRIMARY KEY,
  emp_no          TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  nic             TEXT,
  designation     TEXT,
  mobile          TEXT,
  address         TEXT,
  date_of_birth   DATE,
  join_date       DATE,
  basic_salary    NUMERIC(12,2) NOT NULL DEFAULT 0,
  epf_allowance   NUMERIC(12,2) NOT NULL DEFAULT 0,  -- fixed allowances that attract EPF/ETF (e.g. budgetary relief allowance)
  other_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,  -- fixed allowances not liable for EPF/ETF (e.g. travel)
  epf_eligible    BOOLEAN NOT NULL DEFAULT TRUE,
  epf_no          TEXT,
  bank_name       TEXT,
  bank_branch     TEXT,
  bank_account    TEXT,
  user_id         INT REFERENCES users(id),
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  resigned_date   DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE attendance (
  id          SERIAL PRIMARY KEY,
  employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date   DATE NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('PRESENT','ABSENT','HALF_DAY','LEAVE','HOLIDAY')),
  time_in     TIME,
  time_out    TIME,
  ot_hours    NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (ot_hours >= 0),
  note        TEXT,
  marked_by   INT REFERENCES users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, work_date)
);
CREATE INDEX attendance_date_idx ON attendance (work_date);

CREATE SEQUENCE payroll_no_seq START 1;
CREATE TABLE payroll_runs (
  id           SERIAL PRIMARY KEY,
  run_no       TEXT NOT NULL UNIQUE,
  period       TEXT NOT NULL CHECK (period ~ '^\d{4}-\d{2}$'),  -- YYYY-MM
  run_type     TEXT NOT NULL CHECK (run_type IN ('MID_MONTH','MONTH_END')),
  status       TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','FINALIZED','CANCELLED')),
  pay_date     DATE,
  notes        TEXT,
  created_by   INT REFERENCES users(id),
  finalized_by INT REFERENCES users(id),
  finalized_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payroll_runs_one_per_period ON payroll_runs (period, run_type) WHERE status <> 'CANCELLED';

CREATE TABLE salary_advances (
  id              SERIAL PRIMARY KEY,
  employee_id     INT NOT NULL REFERENCES employees(id),
  advance_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reason          TEXT,
  payment_method  TEXT NOT NULL DEFAULT 'Cash',
  source_run_id   INT REFERENCES payroll_runs(id),   -- set when created by a mid-month run
  recovered_run_id INT REFERENCES payroll_runs(id),  -- month-end run that deducted it
  created_by      INT REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX salary_advances_emp_idx ON salary_advances (employee_id);

CREATE TABLE payroll_lines (
  id                SERIAL PRIMARY KEY,
  run_id            INT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id       INT NOT NULL REFERENCES employees(id),
  basic             NUMERIC(12,2) NOT NULL DEFAULT 0,
  epf_allowance     NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_allowance   NUMERIC(12,2) NOT NULL DEFAULT 0,
  present_days      NUMERIC(5,1) NOT NULL DEFAULT 0,
  nopay_days        NUMERIC(5,1) NOT NULL DEFAULT 0,
  nopay_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  ot_hours          NUMERIC(6,2) NOT NULL DEFAULT 0,
  ot_amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_addition    NUMERIC(12,2) NOT NULL DEFAULT 0,  -- bonus / incentive
  gross_pay         NUMERIC(12,2) NOT NULL DEFAULT 0,
  epf_base          NUMERIC(12,2) NOT NULL DEFAULT 0,
  epf_employee      NUMERIC(12,2) NOT NULL DEFAULT 0,
  epf_employer      NUMERIC(12,2) NOT NULL DEFAULT 0,
  etf_employer      NUMERIC(12,2) NOT NULL DEFAULT 0,
  advance_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
  apit              NUMERIC(12,2) NOT NULL DEFAULT 0,  -- PAYE / APIT tax (enter manually)
  other_deduction   NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_pay           NUMERIC(12,2) NOT NULL DEFAULT 0,  -- for mid-month runs: the advance amount
  overrides         JSONB NOT NULL DEFAULT '{}'::jsonb, -- fields edited by hand (kept on recalculation)
  note              TEXT,
  UNIQUE (run_id, employee_id)
);

INSERT INTO settings (key, value) VALUES
  ('payroll', '{"epf_employee_rate":8,"epf_employer_rate":12,"etf_rate":3,"ot_multiplier":1.5,"ot_hour_divisor":240,"nopay_day_divisor":30,"mid_month_percent":40}')
ON CONFLICT (key) DO NOTHING;
