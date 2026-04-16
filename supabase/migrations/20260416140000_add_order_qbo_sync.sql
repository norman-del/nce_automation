-- ============================================================
-- Order → QBO sales sync (strategic replacement for Shopify→QBO app)
-- Writes only to nce_automation-owned tables. Reads orders/order_items.
-- Dry-run mode default (QBO_SALES_SYNC_ENABLED=false) writes NOTHING
-- to QBO — only the computed payload is stored locally for review.
-- ============================================================

CREATE TABLE IF NOT EXISTS order_qbo_sync (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'dry_run', 'success', 'error', 'skipped')),
  qbo_customer_id TEXT,
  qbo_invoice_id TEXT,
  qbo_payment_id TEXT,
  payload JSONB,
  error_message TEXT,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_order_qbo_sync_status ON order_qbo_sync(status);
CREATE INDEX IF NOT EXISTS idx_order_qbo_sync_created ON order_qbo_sync(created_at DESC);

-- Receipt account for Stripe payouts (distinct from Shopify Receipt Account).
-- Post-cutover, Stripe payouts land here in QBO. Nullable until mapped.
ALTER TABLE qbo_connections
  ADD COLUMN IF NOT EXISTS stripe_receipt_account_id TEXT;
