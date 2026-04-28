# Owner feedback 2026-04-28 — work owned by nce_automation

Master spec: `nce-site/docs/PRD.md` §3.10. This file is the same work packages, scoped down to what ships from this repo. Where a WP is cross-repo, only the automation-side tasks are listed here, with the dependency direction noted.

Work packages are sequenced; tick boxes as built.

---

## WP-2 Step 1 — `condition` data audit & fix
**Sequencing:** must complete before nce-site WP-2 Step 2 (badge UI bump) and before WP-5 (VAT margin treatment) and before WP-9 (chatbot grounding).

- [ ] Run audit: `SELECT condition, status, COUNT(*) FROM products WHERE status='active' GROUP BY 1,2`
- [ ] Diagnose root cause — likely default at ingestion or bulk-import omission
- [ ] Fix at source: ingestion form, CSV importer, and any seed migrations set `condition` correctly going forward
- [ ] Backfill SQL against the live catalogue, cross-referencing Shopify "Used Equipment" collection / tags
- [ ] Re-run audit; verify a plausible distribution
- [ ] Sign off with Rich before nce-site flips badge UI

---

## WP-4 Step 1 — Auto-hide-on-OOS rule + cleanup
**Sequencing:** must complete and run cleanly for at least one cycle before nce-site removes its Availability filter.

- [ ] Define rule with Rich: archive when `stock_quantity = 0` AND not on order AND no sale in N days (suggest N=30)
- [ ] New cron `/api/cron/archive-stale-stock`, daily 06:30 UTC (after supplier feeds at 06:00)
- [ ] Safety cap: abort + email if a single run would archive >5% of catalogue
- [ ] Audit log entries written to `sync_log`
- [ ] One-off backfill cleanup pass against the existing tail
- [ ] Spot-check 5 known-OOS items disappear from `/collections/*` on nce-site

---

## WP-6 — `free_delivery_included` flag (automation half)
**Sequencing:** schema + admin land first, then nce-site renders the consequence.

- [ ] Migration: `products.free_delivery_included BOOLEAN NOT NULL DEFAULT false`
- [ ] Tickbox on product **edit** form, label: "Delivery included in price"
- [ ] Same tickbox on the **ingestion** form
- [ ] CSV importer reads optional `free_delivery_included` column, default false
- [ ] During cutover window only: keep the flag synced to Shopify so the live store stays consistent
- [ ] Hand off to nce-site: PDP badge + cart shipping logic

---

## WP-7 — Warranty templates (automation half)
**Sequencing:** schema + seed templates + admin UI land first; nce-site renders the resolved block.

**Schema:**
- [ ] Migration `warranty_templates` table
  - `code TEXT PRIMARY KEY`
  - `label TEXT NOT NULL`
  - `body_html TEXT NOT NULL`
  - `applies_to_condition TEXT` — `'new' | 'used' | NULL`
  - `default_for_vendor TEXT` — for auto-fill
  - `display_order INT NOT NULL DEFAULT 0`
  - `active BOOLEAN NOT NULL DEFAULT true`
- [ ] Migration: `products.warranty_term_code TEXT REFERENCES warranty_templates(code)` (nullable)

**Seed (with Rich):**
- [ ] `used_no_warranty`
- [ ] `used_14_day_returns`
- [ ] `1yr_parts_labour`
- [ ] `2yr_parts_labour`
- [ ] `6mo_parts_only`
- [ ] `manufacturer_combisteel_2yr` (pre-fill on vendor=Combisteel)
- [ ] Any further codes Rich names

**Admin UI:**
- [ ] Settings → new tab **"Warranty templates"**, full CRUD, admin-only (server-side `staff_users.admin` check)
- [ ] Ingestion form: warranty dropdown; auto-preselect when `vendor` matches `default_for_vendor` AND condition matches `applies_to_condition`
- [ ] Edit form: same dropdown, swappable
- [ ] Bulk-set tool: "set warranty for all products where vendor=X, condition=Y" (admin-only)

---

## Sequencing summary

```
Sprint 1 (this repo):  WP-2 Step 1  → unblocks nce-site quick wins
Sprint 2:              WP-4 Step 1  → unblocks Availability-filter removal
Sprint 3:              WP-6 schema+admin → hand off to nce-site
Sprint 4:              WP-7 schema+seed+admin → hand off to nce-site
```

Nothing here is a Shopify-cutover blocker on its own, but WP-2 Step 1, WP-4 Step 1 and WP-7 are all customer-visible quality-of-life wins that should land before launch day.
