-- ============================================================
-- Inline supplier creation from product ingestion form
-- Adds company_name (so QBO Vendor.CompanyName can be set) and
-- sync_error (mirrors products.sync_error pattern: row still saves
-- in Supabase if QBO push fails, error captured for retry).
-- ============================================================

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS company_name TEXT,
  ADD COLUMN IF NOT EXISTS sync_error TEXT;
