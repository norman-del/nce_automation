-- #14b: widen products.condition + warranty_templates.applies_to_condition to
-- include 'b-grade' and 'clearance'. Strategic-only (bridge form is unaffected
-- because the column type stays TEXT — old 'new'/'used' values remain valid).

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_condition_check;

ALTER TABLE products
  ADD CONSTRAINT products_condition_check
  CHECK (condition IN ('new', 'used', 'b-grade', 'clearance'));

ALTER TABLE warranty_templates
  DROP CONSTRAINT IF EXISTS warranty_templates_applies_to_condition_check;

ALTER TABLE warranty_templates
  ADD CONSTRAINT warranty_templates_applies_to_condition_check
  CHECK (applies_to_condition IN ('new', 'used', 'b-grade', 'clearance') OR applies_to_condition IS NULL);
