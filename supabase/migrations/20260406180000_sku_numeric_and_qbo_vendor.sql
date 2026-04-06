-- ============================================================
-- SKU: plain numbers starting from 6368, with gap reuse
-- ============================================================
CREATE OR REPLACE FUNCTION generate_product_sku()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER := 6368;
  max_num INTEGER;
BEGIN
  -- Get the max numeric SKU currently in use
  SELECT MAX(sku::INTEGER) INTO max_num
  FROM products WHERE sku ~ '^\d+$' AND sku::INTEGER >= 6368;

  IF max_num IS NULL THEN
    RETURN '6368';
  END IF;

  -- Check for gaps starting from 6368
  FOR next_num IN 6368..max_num LOOP
    IF NOT EXISTS (SELECT 1 FROM products WHERE sku = next_num::TEXT) THEN
      RETURN next_num::TEXT;
    END IF;
  END LOOP;

  -- No gaps found, use next number after max
  RETURN (max_num + 1)::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Products: add QBO vendor columns (replaces supplier_id for new products)
-- ============================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS qbo_vendor_id TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS qbo_vendor_name TEXT;
