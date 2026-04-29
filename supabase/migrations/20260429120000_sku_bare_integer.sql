-- Owner request 2026-04-29: SKUs should be bare sequential integers, no "NCE"
-- prefix. The NCE-prefixed label is presentation-only on the storefront.
--
-- Background: the 2026-04-27 collision-safe migration auto-advanced the SKU
-- sequence to one above the highest NCE-prefixed SKU in Shopify. That produced
-- non-sequential, random-looking numbers when Rich added products. Owner
-- corrected by hand and asked us to start from 6428.

-- Reset the sequence so the next nextval() returns 6428.
SELECT setval('product_sku_seq', 6427, true);

-- Bare integer generator. No prefix, no MAX-of-table fallback — the unique
-- constraint on products.sku still protects against duplicate inserts.
CREATE OR REPLACE FUNCTION generate_product_sku()
RETURNS TEXT AS $$
BEGIN
  RETURN nextval('product_sku_seq')::TEXT;
END;
$$ LANGUAGE plpgsql;

-- The Shopify watermark helper is no longer used — Shopify SKUs use the NCE
-- prefix, ours won't, so there's no shared collision space.
DROP FUNCTION IF EXISTS bump_sku_sequence_to(BIGINT);
