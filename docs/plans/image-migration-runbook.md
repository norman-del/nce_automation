# Image migration runbook — Shopify CDN → Supabase Storage

**Bucket:** Strategic / cutover blocker (`docs/plans/now-vs-strategic.md` §12.3, item #6 in §9).
**Script:** `scripts/migrate-images-to-storage.mjs`
**Storage destination:** Supabase Storage bucket `product-images` (public-read, created in `20260502120000_strategic_product_images_bucket`).
**Path convention:** `<sku>/<position>-<filename>` — mirrors Phase 1 ingestion (`lib/strategic/products/photos.ts`).

## Why this exists

Today `product_images.src` for ~3,373 rows points at `cdn.shopify.com/...`. After cutover (`SHOPIFY_SYNC_ENABLED=false`) those URLs keep working for a while because Shopify keeps the CDN alive even on closed stores — but it is not a guarantee, and once we close the Shopify account the URLs die. Either way, every PDP image must be self-hosted before we depend on it.

## 🚦 Production-safety gate (read before any `--apply`)

**Per the umbrella rule in `~/CLAUDE.md` and `nce_automation/CLAUDE.md` Hard Rules:** no `--apply` on this script — at any batch size — until nce-site is proven working AND Norman + Rich have given explicit green light. The moment a row's `src` is rewritten, the live storefront serves the new Supabase URL for that image. If anything is wrong with the URL (CORS, bucket policy, encoding, network), that PDP image breaks for real customers immediately.

Dry-runs are safe — they only SELECT and write a single `sync_log` audit row. Run those freely. **Stop before pressing `--apply`.**

## Pre-flight (one-time)

1. **Confirm bucket capacity.** Estimate: 3,373 rows × ~300 KB avg = ~1.0 GB. Plus Phase 1 ingestion uploads. Supabase paid plan covers 100 GB, but check current usage in the Supabase dashboard → Storage before Run 3.
2. **Confirm env.** Need `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. Already present for the existing scripts.
3. **Confirm working directory.** Run from repo root (`C:\Users\norma\nce_automation`).

## Run sequence

### Run 1 — dry-run, full

```bash
node --env-file=.env.local scripts/migrate-images-to-storage.mjs
```

Reports:
- Total rows in `product_images`
- How many are on Shopify CDN (the migration target)
- How many are already on Supabase Storage (will skip)
- How many have null `src` (will skip)
- A `wouldMigrate` count

No downloads, no uploads, no DB writes. Owner reviews the numbers.

### Run 2 — small batch (50 products)

```bash
node --env-file=.env.local scripts/migrate-images-to-storage.mjs --apply --limit 50
```

Migrates the first 50 candidate rows. After it finishes:
1. Pick 5–10 of the affected SKUs from the script output (the `migrated` results include SKU + storagePath).
2. Open those product pages on https://nce-site-rho.vercel.app (or the equivalent strategic admin) and confirm the new image renders.
3. Re-run dry-run — `alreadyOnStorage` should have grown by 50.

### Run 3 — full

```bash
node --env-file=.env.local scripts/migrate-images-to-storage.mjs --apply
```

Resumable: rows whose `src` already starts with the Supabase Storage public URL prefix are skipped automatically. If the script crashes or you Ctrl-C, just re-run.

Expect ~1–2 hours for a full migration depending on Shopify CDN latency. The script processes rows sequentially to keep memory and connection-count predictable.

### Run 4 — verify

```bash
export PATH="$HOME/scoop/shims:$PATH"
supabase db query --linked "SELECT COUNT(*) FILTER (WHERE src LIKE '%cdn.shopify%' OR src LIKE '%shopifycdn%') AS still_on_shopify, COUNT(*) FILTER (WHERE src LIKE '%supabase.co/storage%') AS on_supabase, COUNT(*) FILTER (WHERE src IS NULL) AS null_src FROM product_images;"
```

Expected: `still_on_shopify = 0`. If non-zero, re-run Run 3 (it will pick up only the stragglers).

Spot-check 50 random PDPs across the storefront — every image should load with no broken-image icons.

## Recovery

- **Partial migration.** Just re-run Run 3 — already-migrated rows are skipped via the `STORAGE_PUBLIC_PREFIX` check.
- **A specific image fails to download (Shopify 404 / 5xx).** Logged in the script output with a `reason`. Investigate manually — usually means the product was edited in Shopify and the old image was replaced. Re-pull from Shopify Admin and retry, or accept the loss if the product is soon-to-be-archived.
- **Bucket quota exceeded.** Storage upload errors surface as `upload failed:`. Pause, expand the Supabase plan, then resume.
- **Need to roll back a single row.** The old Shopify CDN URL is in the `oldSrc` field of every `migrated` log entry. The full audit trail lives in `sync_log` rows where `action='image_migration'`.

## Audit query

```sql
SELECT created_at,
       details->>'mode' AS mode,
       details->>'processed' AS processed,
       details->>'migrated' AS migrated,
       details->>'errors' AS errors,
       details->>'durationMs' AS duration_ms
FROM sync_log
WHERE action='image_migration'
ORDER BY created_at DESC
LIMIT 20;
```

## Definition of done

- `still_on_shopify = 0` in Run 4 verify query.
- 50 random PDPs spot-checked — every image loads.
- `sync_log` shows the final `apply` run with `errors=0` (or any errors investigated and accepted).
