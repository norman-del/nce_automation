# WP-4 Archive Dry-Run — 2026-04-28

## Candidate count

| metric | value |
|---|---|
| active_total | 2395 |
| archive_candidates | 5 |
| percent | 0.21% |

By the percentage rule alone (≤ 5%), this would proceed to apply.

## Decision: REPORT ONLY — do not apply

**Blocker found:** the `products_status_check` constraint in production only allows
`status IN ('processing', 'active')`. The WP-4 migration
`20260428120000_archive_stale_stock_columns.sql` added the `auto_archived_at` and
`last_sold_at` columns and a candidate index, but did NOT update the status check
constraint to permit `'archived'`.

Attempting the apply produced:

```
ERROR: 23514: new row for relation "products" violates check constraint "products_status_check"
DETAIL: Failing row contains (... archived ...)
```

The cron route at `app/api/cron/archive-stale-stock/route.ts` would hit the same
error if Norman flipped it on today. This is a real schema gap, not a data anomaly.

## Recommended fix (needs human eye)

Add a follow-up migration extending the constraint, e.g.:

```sql
ALTER TABLE products DROP CONSTRAINT products_status_check;
ALTER TABLE products ADD CONSTRAINT products_status_check
  CHECK (status IN ('processing', 'active', 'archived'));
```

Then re-run the dry-run (still expected to be ~5 candidates / 0.21%) and apply.

## Post-state

No products archived. No `sync_log` row written. Production state unchanged from pre-state.
