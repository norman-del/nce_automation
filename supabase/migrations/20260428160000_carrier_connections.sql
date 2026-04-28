-- PRD §3.7 prep: schema scaffold for direct carrier integrations (APC Overnight, Pallettrack, future).
-- No API calls, no UI, no logic — just storage tables so the eventual integration is unblocked.

CREATE TABLE carrier_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_code TEXT NOT NULL,                  -- 'apc' | 'pallettrack' | future
  display_name TEXT NOT NULL,
  account_number TEXT,                          -- carrier-issued
  api_endpoint TEXT,                            -- base URL
  credentials_encrypted TEXT,                   -- AES-256-GCM via lib/crypto.ts
  active BOOLEAN NOT NULL DEFAULT false,
  test_mode BOOLEAN NOT NULL DEFAULT true,
  last_health_check_at TIMESTAMPTZ,
  last_health_check_status TEXT,                -- 'ok' | 'error' | NULL
  last_health_check_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (carrier_code)
);

-- Optional helper for label storage when integration goes live
CREATE TABLE shipping_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  carrier_code TEXT NOT NULL,
  tracking_number TEXT NOT NULL,
  label_url TEXT,                               -- Supabase Storage / Vercel Blob URL
  label_pdf_bytes BYTEA,                        -- inline storage option for now
  weight_grams INT,
  service_level TEXT,
  cost_pence INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_response JSONB
);
CREATE INDEX shipping_labels_order_idx ON shipping_labels(order_id);
CREATE INDEX shipping_labels_tracking_idx ON shipping_labels(tracking_number);
