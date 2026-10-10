-- v5: cash change rounding, workshop hours

-- Cash change is rounded down (e.g. to LKR 50) because small coins aren't kept.
-- cash_over = the small amount the customer didn't get back (kept as "rounding").
ALTER TABLE job_payments ADD COLUMN cash_over NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cash_over >= 0);

INSERT INTO settings (key, value) VALUES
  ('cashier', '{"round_change_to": 50}'),
  ('workshop', '{"open": "08:00", "close": "17:00"}')
ON CONFLICT (key) DO NOTHING;
