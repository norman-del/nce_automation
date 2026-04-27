-- Persist the Shopify delivery profile a product belongs to. Until now Rich
-- had to open Shopify admin → Settings → Shipping and manually move every
-- new product into one of the five delivery profiles (next-day pallet,
-- small courier, contact-us, large courier, free shipping). The new product
-- ingestion form picks the profile up front and the API attaches the
-- variant to it after the Shopify product is created.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS shopify_delivery_profile_id TEXT;

COMMENT ON COLUMN products.shopify_delivery_profile_id IS
  'Shopify GraphQL Delivery Profile ID (gid://shopify/DeliveryProfile/xxx) the product variant is attached to.';
