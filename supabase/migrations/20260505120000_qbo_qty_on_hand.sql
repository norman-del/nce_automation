-- Phase 0 of inventory + sales sync (PRD §3.11, plan §12.2).
-- Shadow column populated by the qbo-inventory-pull cron every 10 min.
-- Nothing reads it yet — purpose is to surface drift between QBO and
-- Supabase before Phase 1 cuts the storefront over.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS qbo_qty_on_hand integer,
  ADD COLUMN IF NOT EXISTS qbo_qty_pulled_at timestamptz;

COMMENT ON COLUMN products.qbo_qty_on_hand IS
  'Live QtyOnHand pulled from QBO Item, every 10 min. Phase 0 shadow column — not consumed by storefront. NULL if product has no qbo_item_id or pull never ran.';

COMMENT ON COLUMN products.qbo_qty_pulled_at IS
  'Timestamp of the last successful pull that populated qbo_qty_on_hand for this row.';
