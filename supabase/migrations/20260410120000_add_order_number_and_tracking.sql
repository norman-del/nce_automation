-- Add order_number (auto-generated display ID) and tracking_number to orders
-- order_number is a sequential human-readable ID like "NCE-1001"

-- Sequence for order numbers starting at 1001
CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 1001;

-- Add columns
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_number text UNIQUE,
  ADD COLUMN IF NOT EXISTS tracking_number text;

-- Auto-generate order_number on insert if not provided
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS trigger AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := 'NCE-' || nextval('order_number_seq')::text;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_number
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION generate_order_number();

-- Backfill existing orders (if any) that lack an order_number
UPDATE orders
  SET order_number = 'NCE-' || nextval('order_number_seq')::text
  WHERE order_number IS NULL;
