-- WP-6 — `free_delivery_included` flag.
--
-- When true, the product's price already includes UK delivery — the
-- storefront should suppress shipping charges and show a "Free delivery"
-- badge on the PDP. nce_automation owns the data + admin; nce-site reads
-- and renders.
--
-- Default false so existing rows keep current behaviour (delivery charged
-- separately at checkout).

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS free_delivery_included BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN products.free_delivery_included IS
  'When true, the listed price includes UK delivery; storefront suppresses shipping charges and shows a free-delivery badge.';
