# NULL-handle products investigation — 2026-04-28

Recon only. **No rows modified.** Triggered by today's archive run flagging 5 archived rows with `handle = NULL`.

## Counts per status

| status     | null_handle | total | % null |
|------------|-------------|-------|--------|
| active     | 0           | 2,390 | 0.0%   |
| processing | 49          | 362   | 13.5%  |
| archived   | 5           | 5     | 100%   |

(`null_handle` and `null_or_empty` were identical for every status — there are no empty-string handles, only true NULLs.)

## Headline findings

- **Zero active products are affected.** The storefront-facing catalogue is clean. None of these rows render a URL via `app/(shop)/products/[handle]/page.tsx`, so customers cannot reach them.
- The problem is concentrated entirely in `processing` (in-flight intake, expected to be messy) and the 5 `archived` rows from today's run (which were `processing` rows that never got a handle and have now been archived as stale stock).
- The 5 archived rows are exactly: Hamoki char-grill, Lincat fryer, Atosa fridge, Polar fridge, Stainless Steel Over Table Shelf — all `stock_quantity = 0`, none ever published.

## Vendor breakdown (NULL-handle, all statuses)

| vendor                            | count |
|-----------------------------------|-------|
| Nationwide Catering Equipment     | 14    |
| Polar                             | 7     |
| Lincat                            | 6     |
| Hamoki                            | 4     |
| Panasonic                         | 3     |
| Falcon, Combisteel                | 2 ea  |
| 16 other vendors                  | 1 ea  |

## Pattern — is it a single bad import?

**No, this is not one bulk import gone wrong.** The 54 rows are spread across 18 vendors and 17 different `created_at` days between 2026-04-10 and 2026-04-27. Several days do show 4–6 rows created in the same minute (e.g. 2026-04-11 13:24 — Polar, Lincat, Rowlett Rutland, Gram, Williams, Polar, Vogue, Nationwide), which looks like a single intake batch where the handle step was skipped, but no single batch dominates.

The `Nationwide Catering Equipment` cluster (14 rows, including several titled just "Stainless Steel Wash Hand Basin" or "Pasta Boiler" with no model number) looks like an in-house intake habit — staff creating used-stock entries quickly without filling the handle field. There is also one obvious test row: id `50e8e0e6-…`, vendor `Claude`, title `"Claude Test Product (PLZ DELETE)"` — should be deleted outright.

All 54 rows have `stock_quantity = 0`. Combined with `processing` status, the picture is "intake-in-progress, never published" rather than "live SKUs missing handles."

## Sample rows

| id (short) | vendor                          | title                                              | status     |
|------------|---------------------------------|----------------------------------------------------|------------|
| e0a69b81   | Hamoki                          | Hamoki 60cm Two Burner NG Tabletop Char-Grill      | archived   |
| 0335ebf2   | Lincat                          | Lincat Twin Tank Electric Fryer With New Baskets   | archived   |
| 3ec3b1e0   | Atosa                           | Atosa Four Door Flat Counter Fridge EPF344GR       | archived   |
| 3cd6f66b   | Polar                           | Polar Two Door Flat Counter Fridge U636            | archived   |
| 27884874   | Nationwide Catering Equipment   | SS Over Table Single Tier Shelf 85x50cm            | archived   |
| 50e8e0e6   | Claude                          | Claude Test Product (PLZ DELETE)                   | processing |
| 9d056fd0   | Combisteel                      | Combisteel SS Cocktail Station/Sink 140cm 7490.0405| processing |
| efda0804   | Hamoki                          | Hamoki SS Gastronorm Garnish Rail 180cm            | processing |
| 7e94415c   | Rational                        | Rational Five Senses 10 Grid Combi On Stand        | processing |
| f181246c   | Nationwide Catering Equipment   | New Stainless Steel Tabletop                       | processing |

(Full list of 50 in the investigation transcript — vendor + title patterns match the breakdown above.)

## Recommendation — Norman to decide per-vendor

1. **Delete outright:** `50e8e0e6-…` (`Claude Test Product (PLZ DELETE)`). Obvious test row.
2. **Archive (not backfill):** the 13 `Nationwide Catering Equipment` rows. Generic titles ("Stainless Steel Wash Hand Basin" x3, "Pasta Boiler") with no model numbers would generate colliding or near-meaningless handles. Better to retire these and let intake recreate them properly when stock arrives.
3. **Backfill handles:** branded rows with specific model numbers (Combisteel `7490.0405`, Atosa `EPF344GR`, Polar `U636`, Hamoki rails, Lincat fryers) — these are real products that just missed the handle step. `slugify(title)` would produce sensible URLs; uniqueness check needed against the existing 2,390 active handles before applying.
4. **Process fix:** whatever path creates `processing` rows is allowing a NULL handle. A `NOT NULL` constraint can't be added safely until the 54 existing rows are resolved, but adding handle-generation to the intake form (or a `BEFORE INSERT` trigger that calls `slugify(title)`) would stop the bleeding.

No automated fix has been applied. This is a recon report only.
