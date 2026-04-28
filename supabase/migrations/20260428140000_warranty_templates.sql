-- WP-7 — Warranty templates.
--
-- Used and new equipment ship under different warranty terms; rather than
-- writing free-text warranty paragraphs into every product body, we keep
-- a small library of named templates and reference one per product. The
-- storefront resolves the code at render time and shows the body_html.
--
-- Auto-fill rule: when a product's vendor matches a template's
-- default_for_vendor *and* its condition matches applies_to_condition,
-- the ingestion / edit forms preselect that template. Staff can override.

CREATE TABLE IF NOT EXISTS warranty_templates (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  body_html TEXT NOT NULL,
  applies_to_condition TEXT
    CHECK (applies_to_condition IN ('new', 'used') OR applies_to_condition IS NULL),
  default_for_vendor TEXT,
  display_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warranty_templates_active_order
  ON warranty_templates (active, display_order);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS warranty_term_code TEXT
    REFERENCES warranty_templates(code) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_warranty_term_code
  ON products (warranty_term_code) WHERE warranty_term_code IS NOT NULL;

-- Seed templates. Body copy is a reasonable first draft; Rich will refine
-- through the admin UI. Use ON CONFLICT DO NOTHING so re-running the
-- migration is safe.
INSERT INTO warranty_templates (code, label, body_html, applies_to_condition, default_for_vendor, display_order)
VALUES
  (
    'used_no_warranty',
    'Used — sold as seen',
    '<p>This item is sold as seen. We have inspected it before listing and it is in working order at the time of dispatch, but no warranty is provided beyond the statutory 14-day return window.</p><p>If the item arrives damaged or materially different from the description, please contact us within 14 days of delivery to arrange a return for a full refund. After 14 days, no claims for performance or condition can be accepted.</p><p>For larger commercial kitchen equipment, we strongly recommend a qualified engineer is on site for installation and first use.</p>',
    'used',
    NULL,
    10
  ),
  (
    'used_14_day_returns',
    'Used — 14-day returns',
    '<p>This used item comes with our standard 14-day return window. If you change your mind or the item is not as described, contact us within 14 days of delivery and we will arrange collection for a full refund.</p><p>The item has been tested and is in working order at the point of dispatch. Beyond the 14-day window, no warranty on parts or labour is provided — used catering equipment is sold without an extended manufacturer guarantee.</p><p>We recommend a Gas Safe or qualified electrical engineer is involved in installation and commissioning, especially for gas, three-phase, and water-connected items.</p>',
    'used',
    NULL,
    20
  ),
  (
    '6mo_parts_only',
    '6 months parts only',
    '<p>This new item ships with a 6-month parts-only warranty from the date of delivery. Any component that fails under normal commercial use within the warranty period will be replaced free of charge.</p><p>Labour, call-out, and travel costs are not included — the customer is responsible for engaging a qualified engineer to fit replacement parts. The warranty covers manufacturing defects only and excludes consumables, glass, seals, lamps, and damage caused by misuse, incorrect installation, or inadequate cleaning.</p><p>To make a claim, contact our support team with your order number and a brief description of the fault.</p>',
    'new',
    NULL,
    30
  ),
  (
    '1yr_parts_labour',
    '1 year parts & labour',
    '<p>This new item ships with a 12-month parts-and-labour warranty from the date of delivery. Any component that fails under normal commercial use within the warranty period will be repaired or replaced at no cost to you, including the engineer''s labour and call-out.</p><p>The warranty covers manufacturing defects only and excludes consumables, glass, seals, lamps, customer-fault damage, and faults caused by incorrect installation or inadequate cleaning. Servicing must be carried out by an approved engineer to keep the warranty valid.</p><p>To make a claim, contact our support team with your order number and a brief description of the fault.</p>',
    'new',
    NULL,
    40
  ),
  (
    '2yr_parts_labour',
    '2 years parts & labour',
    '<p>This new item ships with a 24-month parts-and-labour warranty from the date of delivery. Any component that fails under normal commercial use within the warranty period will be repaired or replaced at no cost to you, including the engineer''s labour and call-out.</p><p>The warranty covers manufacturing defects only and excludes consumables, glass, seals, lamps, customer-fault damage, and faults caused by incorrect installation or inadequate cleaning. Servicing must be carried out by an approved engineer to keep the warranty valid.</p><p>To make a claim, contact our support team with your order number and a brief description of the fault.</p>',
    'new',
    NULL,
    50
  ),
  (
    'manufacturer_combisteel_2yr',
    'Combisteel 2-year manufacturer warranty',
    '<p>This Combisteel item ships with a 24-month manufacturer warranty covering parts and labour from the date of delivery. Combisteel''s authorised service network handles claims directly; we will register your unit on dispatch.</p><p>The warranty covers manufacturing defects only and excludes consumables, glass, seals, lamps, customer-fault damage, and faults caused by incorrect installation or inadequate cleaning. Annual servicing by a qualified engineer is recommended to keep the warranty valid.</p><p>To make a claim, contact our support team with your order number — we will route the claim through to Combisteel and keep you updated on the engineer visit.</p>',
    'new',
    'Combisteel',
    60
  )
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE warranty_templates IS
  'Library of named warranty terms; products reference one via products.warranty_term_code.';
