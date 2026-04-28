-- Collection CRUD admin fields (WP-A, Tier-1 cutover prep).
--
-- Storefront (nce-site) will read intro_html and the new SEO/hero fields once
-- the admin UI starts populating them. Coordinate via column names only —
-- intro_html is the agreed contract.
--
-- Note: a `sort_order TEXT` column already exists from the Shopify import
-- (manual / best-selling / etc.). Category-grid ordering is handled by the
-- existing `display_order INT` column, so no new int sort_order is added.

ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS intro_html         TEXT NULL,
  ADD COLUMN IF NOT EXISTS featured_image_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS parent_handle      TEXT NULL,
  ADD COLUMN IF NOT EXISTS meta_title         TEXT NULL,
  ADD COLUMN IF NOT EXISTS meta_description   TEXT NULL,
  ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS archived_at        TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS collections_parent_handle_idx
  ON collections (parent_handle)
  WHERE parent_handle IS NOT NULL;

CREATE INDEX IF NOT EXISTS collections_archived_at_idx
  ON collections (archived_at);

-- Auto-touch updated_at on every row update.
CREATE OR REPLACE FUNCTION set_collections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS collections_updated_at ON collections;
CREATE TRIGGER collections_updated_at
  BEFORE UPDATE ON collections
  FOR EACH ROW
  EXECUTE FUNCTION set_collections_updated_at();
