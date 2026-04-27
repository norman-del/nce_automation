-- Make generate_product_sku() collision-safe.
--
-- Previous behaviour: returned 'NCE' || nextval('product_sku_seq'). The sequence
-- starts at 5200, but Shopify already had products with SKUs above that, so the
-- generator handed out SKUs that collided with live Shopify products.
--
-- New behaviour: take the greater of the next sequence value and one above the
-- highest NCE-prefixed integer SKU currently in the products table. The Shopify
-- side check still happens at the API layer (we can't call Shopify from inside
-- Postgres), but this stops the generator from regressing into already-used
-- territory inside our own table once the API layer has bumped the sequence.

-- Advance the SKU sequence past `target` (so the next nextval returns target+1).
-- Used by the API layer after probing Shopify for the highest existing NCE SKU.
-- No-op if the sequence is already ahead of target.
CREATE OR REPLACE FUNCTION bump_sku_sequence_to(target BIGINT)
RETURNS BIGINT AS $$
DECLARE
  current_val BIGINT;
BEGIN
  SELECT last_value INTO current_val FROM product_sku_seq;
  IF target > current_val THEN
    PERFORM setval('product_sku_seq', target, true);
    RETURN target;
  END IF;
  RETURN current_val;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_product_sku()
RETURNS TEXT AS $$
DECLARE
  next_seq BIGINT;
  max_local BIGINT;
  candidate BIGINT;
BEGIN
  -- Highest existing NCE\d+ SKU in our table
  SELECT COALESCE(MAX((substring(sku FROM '^NCE([0-9]+)$'))::BIGINT), 0)
    INTO max_local
    FROM products
    WHERE sku ~ '^NCE[0-9]+$';

  next_seq := nextval('product_sku_seq');
  candidate := GREATEST(next_seq, max_local + 1);

  -- If we had to skip ahead, advance the sequence so subsequent calls don't
  -- have to rediscover the same gap.
  IF candidate > next_seq THEN
    PERFORM setval('product_sku_seq', candidate);
  END IF;

  RETURN 'NCE' || candidate::TEXT;
END;
$$ LANGUAGE plpgsql;
