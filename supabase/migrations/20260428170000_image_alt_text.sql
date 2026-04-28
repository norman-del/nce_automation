-- Per-image alt text for SEO + accessibility.
--
-- Background: nce-site/docs/handoffs/seo-image-alt-audit-2026-04-28.md
-- recommends storing dedicated alt text rather than always falling back to
-- `products.title`. Adding the columns here lets the storefront read them
-- and the admin (eventually) edit them.
--
-- Both columns are NULL-able — when missing, callers should fall back to a
-- sensible default (product title for products, article title for blog).

ALTER TABLE product_images
  ADD COLUMN IF NOT EXISTS alt_text TEXT NULL;

-- blog_articles stores the featured image as a single URL in `image_url`.
-- Add a paired alt-text column for it.
ALTER TABLE blog_articles
  ADD COLUMN IF NOT EXISTS image_alt_text TEXT NULL;
