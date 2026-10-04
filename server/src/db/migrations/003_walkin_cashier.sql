-- v3: walk-in flow – free services, pay at the cashier before work starts, receipts

-- Bikes: date of sale (for free-service checks and Honda claims)
ALTER TABLE bikes ADD COLUMN sale_date DATE;

-- Job cards: which kind of service, and whether the customer pays before work starts
ALTER TABLE job_cards ADD COLUMN service_kind TEXT CHECK (service_kind IN ('FREE_1', 'FREE_2', 'PAID'));
ALTER TABLE job_cards ADD COLUMN pay_upfront BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX job_cards_service_kind_idx ON job_cards (service_kind) WHERE service_kind IN ('FREE_1', 'FREE_2');

-- Every amount received (or refunded) for a job card. The invoice's paid_amount is kept equal to the sum.
CREATE SEQUENCE receipt_no_seq;
CREATE TABLE job_payments (
  id           SERIAL PRIMARY KEY,
  receipt_no   TEXT NOT NULL UNIQUE,
  job_card_id  INT NOT NULL REFERENCES job_cards(id),
  kind         TEXT NOT NULL DEFAULT 'PAYMENT' CHECK (kind IN ('PAYMENT', 'REFUND')),
  amount       NUMERIC(12,2) NOT NULL CHECK (amount > 0),          -- always positive; REFUND is money given back
  method       TEXT NOT NULL CHECK (method IN ('Cash', 'Card', 'Bank Transfer', 'Other')),
  cash_given   NUMERIC(12,2),                                     -- cash handed over by the customer
  change_given NUMERIC(12,2),
  reference    TEXT,                                              -- card slip / bank reference
  received_by  INT REFERENCES users(id),
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX job_payments_job_idx ON job_payments (job_card_id);
CREATE INDEX job_payments_date_idx ON job_payments (received_at);

-- Payments recorded on invoices before this version become receipts
INSERT INTO job_payments (receipt_no, job_card_id, amount, method, received_by, received_at)
SELECT 'RC-OLD-' || i.id, i.job_card_id, i.paid_amount,
       CASE WHEN i.payment_method IN ('Cash', 'Card', 'Bank Transfer', 'Other') THEN i.payment_method ELSE 'Other' END,
       i.issued_by, i.issued_at
FROM invoices i WHERE i.paid_amount > 0;

-- Cashier role: takes payments, prints receipts, hands bikes over. Cannot change job cards.
INSERT INTO roles (name, description, permissions, is_system) VALUES
  ('Cashier', 'Takes payments, prints receipts, hands over bikes',
   ARRAY['jobs.view','jobs.view_all','jobs.print','jobs.delivery','payments.record','invoices.view','customers.view']::text[], FALSE)
ON CONFLICT (name) DO NOTHING;
