-- #16(b): vendor logo bank — admin-managed brand logos that auto-attach to
-- products at create/edit time based on the vendor field.
--
-- Strategic-only. The bridge ingestion form (app/products/new) and bridge
-- update flows are unaffected. Files live in Supabase Storage (matches the
-- strategic decision in docs/plans/now-vs-strategic.md §12.3 — no Vercel
-- Blob, same bucket-style approach as product-images).

CREATE TABLE IF NOT EXISTS vendor_logos (
  handle TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}', -- lowercased, whitespace-trimmed
  logo_url TEXT,                         -- Supabase Storage public URL; NULL until uploaded
  storage_path TEXT,                     -- path within the vendor-logos bucket; NULL when no file
  content_type TEXT,                     -- e.g. image/svg+xml, image/png
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast alias lookup. Aliases are stored lowercased so the resolver can do a
-- straight `?` containment query.
CREATE INDEX IF NOT EXISTS vendor_logos_aliases_gin ON vendor_logos USING GIN (aliases);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS vendor_logo_url TEXT;

-- Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vendor-logos',
  'vendor-logos',
  true,
  2 * 1024 * 1024, -- 2 MB per file (logos are tiny)
  ARRAY['image/svg+xml','image/png','image/webp','image/jpeg']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'vendor-logos public read'
  ) THEN
    CREATE POLICY "vendor-logos public read"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'vendor-logos');
  END IF;
END $$;

-- Seed catalogue. Mirrors nce-site/lib/brand-logos.ts — same handles, same
-- aliases. Logo files are uploaded later via the admin UI or the Shopify
-- scrape script (see docs/plans/now-vs-strategic.md §16(b)).
INSERT INTO vendor_logos (handle, name, aliases) VALUES
  ('prodis',       'Prodis',       ARRAY['prodis']),
  ('ecofrost',     'Ecofrost',     ARRAY['ecofrost']),
  ('hamoki',       'Hamoki',       ARRAY['hamoki']),
  ('combisteel',   'Combisteel',   ARRAY['combisteel']),
  ('foster',       'Foster',       ARRAY['foster']),
  ('lincat',       'Lincat',       ARRAY['lincat']),
  ('rational',     'Rational',     ARRAY['rational']),
  ('polar',        'Polar',        ARRAY['polar']),
  ('vogue',        'Vogue',        ARRAY['vogue']),
  ('burco',        'Burco',        ARRAY['burco']),
  ('falcon',       'Falcon',       ARRAY['falcon']),
  ('buffalo',      'Buffalo',      ARRAY['buffalo']),
  ('blue-seal',    'Blue Seal',    ARRAY['blue seal','blueseal']),
  ('hobart',       'Hobart',       ARRAY['hobart']),
  ('williams',     'Williams',     ARRAY['williams']),
  ('adexa',        'Adexa',        ARRAY['adexa']),
  ('infernus',     'Infernus',     ARRAY['infernus']),
  ('gram',         'Gram',         ARRAY['gram']),
  ('winterhalter', 'Winterhalter', ARRAY['winterhalter']),
  ('blizzard',     'Blizzard',     ARRAY['blizzard']),
  ('tefcold',      'Tefcold',      ARRAY['tefcold'])
ON CONFLICT (handle) DO NOTHING;
