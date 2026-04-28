-- WP-4 follow-up — extend products.status check to include 'archived'.
--
-- The earlier WP-4 migration (20260428120000_archive_stale_stock_columns.sql)
-- added the auto_archived_at + last_sold_at columns and the candidate index,
-- but didn't touch the products_status_check constraint, which still only
-- allowed ('processing','active'). The /api/cron/archive-stale-stock route
-- and the corresponding manual SQL apply both failed with 23514 in the
-- 2026-04-28 dry-run because of this gap. This migration closes it.

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_status_check;
ALTER TABLE products ADD CONSTRAINT products_status_check
  CHECK (status IN ('processing','active','archived'));
