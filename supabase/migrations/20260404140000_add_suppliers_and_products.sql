-- ============================================================
-- Suppliers directory (reusable across products)
-- ============================================================
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  county TEXT,
  postcode TEXT,
  qbo_vendor_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_suppliers_name ON suppliers(name);

-- ============================================================
-- Products (replaces the Google Sheet)
-- ============================================================

-- Sequence for auto-generating SKU numbers
CREATE SEQUENCE product_sku_seq START WITH 5200;

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  condition TEXT NOT NULL CHECK (condition IN ('new', 'used')),
  vat_applicable BOOLEAN NOT NULL DEFAULT false,
  cost_price NUMERIC(10,2) NOT NULL,
  selling_price NUMERIC(10,2) NOT NULL,
  original_rrp NUMERIC(10,2),
  model_number TEXT,
  year_of_manufacture INTEGER,
  electrical_requirements TEXT,
  notes TEXT,
  width_cm NUMERIC(6,1) NOT NULL,
  height_cm NUMERIC(6,1) NOT NULL,
  depth_cm NUMERIC(6,1) NOT NULL,
  weight_kg NUMERIC(6,1),
  shipping_tier INTEGER NOT NULL CHECK (shipping_tier IN (0, 1, 2)),
  supplier_id UUID REFERENCES suppliers(id),
  product_type TEXT NOT NULL,
  vendor TEXT NOT NULL,
  collections TEXT[],
  tags TEXT[],
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'active')),
  shopify_product_id BIGINT,
  shopify_status TEXT DEFAULT 'draft' CHECK (shopify_status IN ('draft', 'active')),
  qbo_item_id TEXT,
  qbo_synced BOOLEAN DEFAULT false,
  sync_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_supplier ON products(supplier_id);
CREATE INDEX idx_products_created ON products(created_at DESC);

-- ============================================================
-- Product images (tracks photos uploaded to Shopify)
-- ============================================================
CREATE TABLE product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  shopify_image_id BIGINT,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_product_images_product ON product_images(product_id);

-- ============================================================
-- Function: generate next SKU as "NCE{sequence_number}"
-- ============================================================
CREATE OR REPLACE FUNCTION generate_product_sku()
RETURNS TEXT AS $$
BEGIN
  RETURN 'NCE' || nextval('product_sku_seq')::TEXT;
END;
$$ LANGUAGE plpgsql;
