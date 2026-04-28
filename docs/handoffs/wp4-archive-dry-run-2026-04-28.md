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

## Re-run resolution — 2026-04-28 (later same day)

### Bugs fixed

**Bug 1 — `products_status_check` did not allow `'archived'`.**
Resolved with new migration `supabase/migrations/20260428150000_allow_archived_status.sql`,
applied to prod via `supabase db query --linked`. Verified:

```
CHECK ((status = ANY (ARRAY['processing'::text, 'active'::text, 'archived'::text])))
```

**Bug 2 — claimed `sync_log` column mismatch in the cron route.**
On inspection the shipped `app/api/cron/archive-stale-stock/route.ts` was already writing
to the correct columns: `action`, `status`, `details` (with `payout_id` left implicit/NULL).
This matches prod's `sync_log` schema (`id, action, payout_id, status, details, created_at`)
and matches the pattern used by `app/api/orders/[id]/refund/route.ts` and other working
routes. The bug as described in the brief was stale — no code change was needed for the
cron route. Recording here so the next reader doesn't go looking.

### Re-run dry-run

Same SQL as the original dry-run, post-constraint-fix:

| metric | value |
|---|---|
| active_total | 2395 |
| archive_candidates | 5 |
| percent | 0.21% |

Identical to the morning run. Safe to apply.

### Apply

Ran the documented `WITH archived AS (UPDATE ...) INSERT INTO sync_log ...` block.
5 products moved from `active` to `archived` with `auto_archived_at = NOW()`.
1 `sync_log` row written.

### Verification

Status counts after apply:

| status | count |
|---|---|
| active | 2390 |
| archived | 5 |
| processing | 362 |

Sample of archived rows (top 5, all auto-archived at `2026-04-28 12:40:40 UTC`):
vendors `Hamoki`, `Nationwide Catering Equipment`, `Atosa`, `Polar`, `Lincat`.
(`handle` is NULL on these five rows — not caused by this run, just how they sit
in the catalogue. Worth a separate look but not a blocker.)

`sync_log` row written:

```
id:         f11b67d3-4b66-4a51-bb33-4daa0cc60d9f
action:     auto_archive_stale_stock
status:     success
details:    {"archived_count": 5, "message": "Manual run via Norman session 2026-04-28"}
created_at: 2026-04-28 12:40:40 UTC
```

### Commit

`WP-4 fixes — allow archived status + correct sync_log shape`
(commit SHA recorded in git log; not pushed per instructions).

