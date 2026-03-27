-- Shopify connection (single store — one row)
CREATE TABLE shopify_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_domain TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  scopes TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- QBO connection (single company — one row)
CREATE TABLE qbo_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  realm_id TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  company_name TEXT,
  shopify_fees_account_id TEXT,
  bank_account_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Synced payouts from Shopify
CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_payout_id BIGINT UNIQUE NOT NULL,
  status TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  gross_amount NUMERIC(12,2),
  total_fees NUMERIC(12,2),
  currency TEXT DEFAULT 'GBP',
  payout_date DATE NOT NULL,
  journal_entry_id TEXT,
  journal_synced_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'pending',
  sync_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_payouts_date ON payouts(payout_date DESC);
CREATE INDEX idx_payouts_status ON payouts(sync_status);

-- Individual transactions within a payout (one per order)
CREATE TABLE payout_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID NOT NULL REFERENCES payouts(id) ON DELETE CASCADE,
  shopify_transaction_id BIGINT UNIQUE NOT NULL,
  shopify_order_id BIGINT,
  order_number TEXT,
  transaction_type TEXT NOT NULL,
  customer_name TEXT,
  company_name TEXT,
  amount NUMERIC(12,2) NOT NULL,
  fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  net NUMERIC(12,2) NOT NULL,
  qbo_invoice_id TEXT,
  qbo_payment_id TEXT,
  payment_synced_at TIMESTAMPTZ,
  payment_status TEXT DEFAULT 'pending',
  payment_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_payout_txns_payout ON payout_transactions(payout_id);
CREATE INDEX idx_payout_txns_order ON payout_transactions(order_number);

-- Sync log for audit trail
CREATE TABLE sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  payout_id UUID REFERENCES payouts(id),
  status TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sync_log_created ON sync_log(created_at DESC);
