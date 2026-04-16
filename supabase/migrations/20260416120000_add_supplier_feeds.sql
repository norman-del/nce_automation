-- ============================================================
-- Supplier stock feed ingestion (Stockeo replacement)
-- Writes to Supabase products.stock_quantity only. Never touches
-- Shopify or QBO. Runs alongside Stockeo until Shopify cutover.
-- ============================================================

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS stock_feed_url TEXT,
  ADD COLUMN IF NOT EXISTS stock_feed_format TEXT CHECK (stock_feed_format IN ('csv', 'xml')),
  ADD COLUMN IF NOT EXISTS stock_feed_parser TEXT,
  ADD COLUMN IF NOT EXISTS stock_feed_schedule TEXT,
  ADD COLUMN IF NOT EXISTS stock_feed_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_feed_last_run_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stock_feed_last_status TEXT,
  ADD COLUMN IF NOT EXISTS stock_feed_last_row_count INTEGER,
  ADD COLUMN IF NOT EXISTS stock_feed_last_matched_count INTEGER,
  ADD COLUMN IF NOT EXISTS stock_feed_last_error TEXT;

CREATE INDEX IF NOT EXISTS idx_suppliers_feed_enabled
  ON suppliers(stock_feed_enabled) WHERE stock_feed_enabled = true;

-- Seed Prodis + Combisteel supplier rows with feed config (idempotent).
-- Both start DISABLED. Gus flips the toggle when ready.
INSERT INTO suppliers (name, stock_feed_url, stock_feed_format, stock_feed_parser, stock_feed_schedule, stock_feed_enabled)
VALUES
  ('Prodis', 'https://prodis.co.uk/stock_feed/stock_feed.csv', 'csv', 'prodis', 'daily 06:00 UTC', false),
  ('Combisteel', 'https://combisteel.com/feeds/stock/stockstatus-tst.xml', 'xml', 'combisteel', 'weekdays 06:00 UTC', false)
ON CONFLICT DO NOTHING;

-- If suppliers already exist by name (no unique constraint on name), update them to attach feed config
UPDATE suppliers SET
  stock_feed_url = 'https://prodis.co.uk/stock_feed/stock_feed.csv',
  stock_feed_format = 'csv',
  stock_feed_parser = 'prodis',
  stock_feed_schedule = 'daily 06:00 UTC'
WHERE LOWER(name) = 'prodis' AND stock_feed_url IS NULL;

UPDATE suppliers SET
  stock_feed_url = 'https://combisteel.com/feeds/stock/stockstatus-tst.xml',
  stock_feed_format = 'xml',
  stock_feed_parser = 'combisteel',
  stock_feed_schedule = 'weekdays 06:00 UTC'
WHERE LOWER(name) IN ('combisteel', 'ecofrost', 'ecofrost / combisteel') AND stock_feed_url IS NULL;
