-- WP-4 Step 1 — Auto-hide-on-OOS rule support columns.
--
-- Adds two columns the daily cron `/api/cron/archive-stale-stock` uses:
--
--   * `auto_archived_at` — set to NOW() whenever the cron archives a row,
--     so we can tell auto-archives apart from manual archives Rich does
--     in the admin. NULL means "manual or never archived".
--
--   * `last_sold_at` — best-effort timestamp of the most recent sale for
--     this SKU. Backfilled from order_items joined to orders. The cron
--     uses this to decide whether a 0-stock product is genuinely stale
--     (no sale in 30 days) vs. about to be restocked.
--
-- Backfill is best-effort: any product that has never sold stays NULL,
-- which the cron treats as "stale" (alongside the stock=0 check).

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS auto_archived_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS last_sold_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN products.auto_archived_at IS
  'Set by the archive-stale-stock cron when this row is auto-archived. NULL = manual archive or active.';

COMMENT ON COLUMN products.last_sold_at IS
  'Best-effort timestamp of most recent sale for this SKU, derived from order_items + orders.';

-- Best-effort backfill from existing orders. Joins by SKU rather than
-- product_id because order_items.product_sku is the historically reliable
-- column (product_id may be NULL on older rows).
UPDATE products p
SET last_sold_at = sub.max_created_at
FROM (
  SELECT oi.product_sku AS sku, MAX(o.created_at) AS max_created_at
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE oi.product_sku IS NOT NULL
  GROUP BY oi.product_sku
) sub
WHERE p.sku = sub.sku
  AND p.last_sold_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_archive_candidates
  ON products (status, stock_quantity, last_sold_at)
  WHERE status = 'active' AND stock_quantity = 0;
