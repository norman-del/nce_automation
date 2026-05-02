-- Strategic product ingestion: photos go to Supabase Storage instead of Shopify CDN.
-- Bucket is public-read so nce-site can serve images via storage.googleapis-style URLs.
-- Bridge code (lib/shopify/products.ts) is unaffected — it continues to upload to Shopify.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  20 * 1024 * 1024, -- 20 MB per file
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read policy (anyone can fetch). Writes are service-role only — done
-- via lib/strategic/products/photos.ts which uses the service client.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'product-images public read'
  ) THEN
    CREATE POLICY "product-images public read"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'product-images');
  END IF;
END $$;
