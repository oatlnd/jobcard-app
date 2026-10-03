-- Job Card App: initial schema

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','advisor','mechanic')),
  mobile        TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customers (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  mobile         TEXT NOT NULL,              -- stored as 94XXXXXXXXX
  suburb         TEXT,
  email          TEXT,
  preferred_lang TEXT NOT NULL DEFAULT 'en' CHECK (preferred_lang IN ('en','ta')),
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX customers_mobile_idx ON customers (mobile);
CREATE INDEX customers_name_idx ON customers (lower(name));

CREATE TABLE bikes (
  id                    SERIAL PRIMARY KEY,
  customer_id           INT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  reg_no                TEXT NOT NULL UNIQUE,   -- normalised: uppercase, no spaces/dashes
  model                 TEXT NOT NULL,
  year                  INT,
  engine_no             TEXT,
  chassis_no            TEXT,
  last_odometer         INT,
  last_service_date     DATE,
  next_service_due_date DATE,
  next_service_due_km   INT,
  reminder_sent_for     DATE,                   -- due date we already reminded about
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bikes_customer_idx ON bikes (customer_id);

CREATE TABLE parts (
  id            SERIAL PRIMARY KEY,
  part_no       TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'General',
  unit_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock_qty     INT NOT NULL DEFAULT 0,
  reorder_level INT NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE SEQUENCE job_no_seq START 1;
CREATE SEQUENCE invoice_no_seq START 1;

CREATE TABLE job_cards (
  id            SERIAL PRIMARY KEY,
  job_no        TEXT NOT NULL UNIQUE,
  bike_id       INT NOT NULL REFERENCES bikes(id),
  customer_id   INT NOT NULL REFERENCES customers(id),
  status        TEXT NOT NULL DEFAULT 'CHECKED_IN'
                CHECK (status IN ('CHECKED_IN','IN_PROGRESS','WAITING_PARTS','QA_CHECK','READY','DELIVERED','CANCELLED')),
  service_type  TEXT NOT NULL DEFAULT 'General Service',
  complaint     TEXT,
  diagnosis     TEXT,
  odometer      INT,
  fuel_level    TEXT,
  advisor_id    INT REFERENCES users(id),
  mechanic_id   INT REFERENCES users(id),
  promised_at   TIMESTAMPTZ,
  discount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by    INT REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  delivered_at  TIMESTAMPTZ
);
CREATE INDEX job_cards_status_idx ON job_cards (status);
CREATE INDEX job_cards_bike_idx ON job_cards (bike_id);

CREATE TABLE job_status_history (
  id          SERIAL PRIMARY KEY,
  job_card_id INT NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  note        TEXT,
  changed_by  INT REFERENCES users(id),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX job_status_history_job_idx ON job_status_history (job_card_id);

CREATE TABLE job_items (
  id          SERIAL PRIMARY KEY,
  job_card_id INT NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
  item_type   TEXT NOT NULL CHECK (item_type IN ('part','labour')),
  part_id     INT REFERENCES parts(id),
  description TEXT NOT NULL,
  qty         NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_price  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  line_total  NUMERIC(12,2) GENERATED ALWAYS AS (round(qty * unit_price, 2)) STORED,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX job_items_job_idx ON job_items (job_card_id);

CREATE TABLE invoices (
  id             SERIAL PRIMARY KEY,
  invoice_no     TEXT NOT NULL UNIQUE,
  job_card_id    INT NOT NULL UNIQUE REFERENCES job_cards(id),
  parts_total    NUMERIC(12,2) NOT NULL,
  labour_total   NUMERIC(12,2) NOT NULL,
  discount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate       NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  total          NUMERIC(12,2) NOT NULL,
  paid_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT,
  status         TEXT NOT NULL DEFAULT 'UNPAID' CHECK (status IN ('UNPAID','PARTIAL','PAID')),
  issued_by      INT REFERENCES users(id),
  issued_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id          SERIAL PRIMARY KEY,
  job_card_id INT REFERENCES job_cards(id) ON DELETE SET NULL,
  customer_id INT REFERENCES customers(id) ON DELETE SET NULL,
  channel     TEXT NOT NULL CHECK (channel IN ('whatsapp','sms')),
  to_number   TEXT NOT NULL,
  template    TEXT NOT NULL,
  params      JSONB NOT NULL DEFAULT '{}'::jsonb,
  lang        TEXT NOT NULL DEFAULT 'en',
  body        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','SENDING','SENT','FAILED')),
  attempts    INT NOT NULL DEFAULT 0,
  last_error  TEXT,
  provider_id TEXT,
  send_after  TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at   TIMESTAMPTZ,
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_queue_idx ON notifications (status, send_after);
CREATE INDEX notifications_job_idx ON notifications (job_card_id);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

INSERT INTO settings (key, value) VALUES
  ('shop', '{"name":"Ratnam Service Station","address":"Jaffna, Sri Lanka","phone":"+94 21 000 0000","email":"","footer":"Thank you for choosing us. Your motorbike is your life."}'),
  ('billing', '{"tax_rate":0,"currency":"LKR"}'),
  ('service', '{"interval_days":90,"interval_km":3000,"reminder_days_before":3}'),
  ('notifications', '{"enabled":true,"channels":["whatsapp","sms"],"on_checkin":true,"on_waiting_parts":true,"on_ready":true,"on_delivered":true,"service_reminders":true}');
