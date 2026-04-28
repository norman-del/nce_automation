# WP-2 Step 1 — `condition` data audit & backfill

**Date:** 2026-04-28
**Scope:** active products in shared Supabase (`daesvkeogxuqlrskuwpg`)

## Before

```
condition | status | count
----------+--------+------
new       | active |  2391
used      | active |     4
```

Of 2,395 active products, only 4 were marked `condition='used'`. Reality on the
Shopify side is that ~1,400 of the active catalogue is used equipment.

## Diagnosis

Two ingestion paths can write `condition`:

1. **Form** (`app/products/new/ProductForm.tsx`) — defaults to `'used'` and
   exposes a Used/New select. Writes `condition` correctly via
   `app/api/products` POST. Same on the edit form
   (`app/products/[id]/edit/EditProductForm.tsx`).
2. **CSV importer** (`app/products/import/CsvImporter.tsx` →
   `app/api/products/import/route.ts`) — already maps a `condition` column
   case-insensitively, validates `new|used`, and rejects rows with anything
   else. The header alias `newused → condition` is also wired.

Both paths handle `condition` correctly going forward, so the issue is purely
historical: the bulk seed/import that populated the live catalogue did not
carry through a `condition` column. New rows from the form are fine, used rows
were lost in the bulk legacy import.

**No code change needed at the ingestion layer** — both paths already write
`condition` from explicit user input. The fix is a one-off backfill against
the existing rows.

## Backfill strategy

Cross-reference: 1,443 active products are members of the Shopify
`used-equipment` collection (slug: `'used'` in `products.collections`). Of
those, 1,443 were incorrectly flagged `condition='new'`.

```sql
UPDATE products
SET condition = 'used'
WHERE status = 'active'
  AND 'used' = ANY(collections)
  AND condition = 'new';
-- 1443 rows
```

No tag-based fallback was needed — no `'used'`, `'Used'`, `'secondhand'`, or
`'refurb*'` tags appear in the active set. The `'used'` collection slug is the
only signal in the imported data.

## After

```
condition | status | count
----------+--------+------
used      | active |  1447
new       | active |   948
```

Distribution is now plausible. The 4 originally-flagged used items are still
correct; the additional 1,443 are the backfilled rows.

## Not changed

- Schema: `products.condition` is already `NOT NULL TEXT` (no enum, no check
  constraint) — no migration needed.
- Form: defaults to `'used'`, writes correctly.
- CSV importer: already reads `condition` column.
- Sign-off with Rich (per the spec) is still pending — Norman to action.
