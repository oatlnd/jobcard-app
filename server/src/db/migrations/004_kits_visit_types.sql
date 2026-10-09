-- v4: visit types, bike groups (oil chart), bike models list, service kits

-- ----- Visit types (what the customer came for) -----
--   FREE_1 / FREE_2  Honda free services (labour free, claimed from Honda)
--   WARRANTY         paid service, bike still under warranty
--   PAID             paid service, out of warranty / older bikes
--   MINOR            minor repair (brake pads, cables ...)
--   MAJOR            major / mechanical repair
ALTER TABLE job_cards DROP CONSTRAINT IF EXISTS job_cards_service_kind_check;
ALTER TABLE job_cards ADD CONSTRAINT job_cards_service_kind_check
  CHECK (service_kind IN ('FREE_1', 'FREE_2', 'WARRANTY', 'PAID', 'MINOR', 'MAJOR'));

-- ----- Bike groups = the oil chart -----
-- Each group says which oil bottle (a part) and how many, and which filter/washer, a service uses.
CREATE TABLE bike_groups (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE,
  oil_part_id    INT REFERENCES parts(id),
  oil_qty        INT NOT NULL DEFAULT 1 CHECK (oil_qty > 0),   -- number of oil bottles/units
  filter_part_id INT REFERENCES parts(id),                     -- oil filter or drain washer (optional)
  sort_order     INT NOT NULL DEFAULT 0,
  active         BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO bike_groups (name, sort_order) VALUES
  ('Scooter 110cc', 1), ('Bike 100–125cc', 2), ('Bike 150–200cc', 3), ('Big bike 250cc+', 4);

-- ----- Bike models (the model dropdown), each in a group -----
CREATE TABLE bike_models (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  group_id   INT REFERENCES bike_groups(id),
  sort_order INT NOT NULL DEFAULT 0,
  active     BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO bike_models (name, group_id, sort_order)
SELECT m.name, g.id, m.ord FROM (VALUES
  ('Dio', 'Scooter 110cc', 1), ('Activa', 'Scooter 110cc', 2), ('Grazia', 'Scooter 110cc', 3),
  ('Shine 100', 'Bike 100–125cc', 4), ('CB Shine', 'Bike 100–125cc', 5), ('CB Shine SP', 'Bike 100–125cc', 6),
  ('SP 125', 'Bike 100–125cc', 7), ('Livo', 'Bike 100–125cc', 8), ('CD 110 Dream', 'Bike 100–125cc', 9), ('Dream Neo', 'Bike 100–125cc', 10),
  ('Unicorn', 'Bike 150–200cc', 11), ('X-Blade', 'Bike 150–200cc', 12), ('Hornet 2.0', 'Bike 150–200cc', 13),
  ('CB200X', 'Bike 150–200cc', 14), ('XR150L', 'Bike 150–200cc', 15), ('CB350', 'Big bike 250cc+', 16)
) AS m(name, grp, ord) JOIN bike_groups g ON g.name = m.grp;
-- Models already typed on bikes but not in the list: add them without a group (admin assigns later)
INSERT INTO bike_models (name, sort_order)
SELECT DISTINCT b.model, 100 FROM bikes b
WHERE b.model IS NOT NULL AND b.model <> '' AND NOT EXISTS (SELECT 1 FROM bike_models m WHERE lower(m.name) = lower(b.model))
ON CONFLICT DO NOTHING;

-- ----- Kits: a ready-made set of lines added with one tap -----
CREATE TABLE kits (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  visit_types TEXT[] NOT NULL DEFAULT '{}',   -- which visit types show this kit as a tile
  sort_order  INT NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE kit_lines (
  id          SERIAL PRIMARY KEY,
  kit_id      INT NOT NULL REFERENCES kits(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('labour', 'part', 'oil', 'filter')),  -- oil/filter come from the bike's group
  description TEXT,                      -- labour lines
  unit_price  NUMERIC(12,2) NOT NULL DEFAULT 0,
  part_id     INT REFERENCES parts(id),  -- part lines
  qty         INT NOT NULL DEFAULT 1 CHECK (qty > 0),
  sort_order  INT NOT NULL DEFAULT 0
);
CREATE INDEX kit_lines_kit_idx ON kit_lines (kit_id);

-- Which kit a job card line came from (for reports)
ALTER TABLE job_items ADD COLUMN kit_id INT REFERENCES kits(id) ON DELETE SET NULL;

-- Starter kits (admin can change everything on the Kits screen)
WITH k AS (
  INSERT INTO kits (name, visit_types, sort_order) VALUES
    ('Free service 1 kit', '{FREE_1}', 1),
    ('Free service 2 kit', '{FREE_2}', 2),
    ('Periodic service', '{WARRANTY,PAID}', 3),
    ('Oil change only', '{WARRANTY,PAID}', 4)
  RETURNING id, name
)
INSERT INTO kit_lines (kit_id, kind, description, unit_price, sort_order)
SELECT k.id, l.kind, l.description, l.price, l.ord
FROM k JOIN (VALUES
  ('Free service 1 kit', 'labour', 'Free service 1 – labour', 0, 1), ('Free service 1 kit', 'oil', NULL, 0, 2), ('Free service 1 kit', 'filter', NULL, 0, 3),
  ('Free service 2 kit', 'labour', 'Free service 2 – labour', 0, 1), ('Free service 2 kit', 'oil', NULL, 0, 2), ('Free service 2 kit', 'filter', NULL, 0, 3),
  ('Periodic service', 'labour', 'Periodic service – labour',
     COALESCE((SELECT default_price FROM service_types WHERE name = 'Periodic Service'), 2500), 1),
  ('Periodic service', 'oil', NULL, 0, 2), ('Periodic service', 'filter', NULL, 0, 3),
  ('Oil change only', 'labour', 'Oil change – labour',
     COALESCE((SELECT default_price FROM service_types WHERE name = 'Oil Change'), 500), 1),
  ('Oil change only', 'oil', NULL, 0, 2), ('Oil change only', 'filter', NULL, 0, 3)
) AS l(kit, kind, description, price, ord) ON l.kit = k.name;

-- Warranty length used to show "under warranty until ..." (months from date of sale)
INSERT INTO settings (key, value) VALUES ('warranty', '{"months": 24}')
ON CONFLICT (key) DO NOTHING;
