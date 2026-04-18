# Lessons Learned — Production Incidents

A running log of production incidents caused (or surfaced) by our automation, and the rules we've adopted to stop them recurring. Keep entries terse: what, why, what we changed.

## 2026-04-14 — Shopify inventory tracking turned off by our code

**What happened.** Our product-create and product-edit code pushed variants to Shopify without `inventory_management` or `inventory_policy` fields. Shopify interpreted the missing fields as "don't track stock." Any product we created or edited ended up with stock tracking off, and Shopify's "hide out of stock" toggle couldn't hide them when sold. 49 products were flagged (mix of ours + pre-existing Shopify config). Fixed in commit `254cd27`; `fix-shopify-inventory.mjs` remediated the 49.

**Lesson.** Every variant PUT/POST to Shopify must include both `inventory_management: 'shopify'` and `inventory_policy: 'deny'` explicitly. Never rely on Shopify's defaults.

## 2026-04-18 — "Sell when out of stock" ghosts (21 products)

**What happened.** Separate from the tracking bug. 21 legacy products on Shopify had `inventory_policy: 'continue'` ("keep selling when out of stock") from pre-automation setup. When sold, they stayed visible. Our audit script only checked `inventory_management`, so it missed them. Three surfaced as live ghosts (6129, 6187, others manually drafted by staff).

**Fix.** `flip-inventory-policy.mjs` flipped all 21 to `deny`. Our code paths already set `deny` correctly, so this is a one-time cleanup.

**Lesson.** When auditing Shopify state, check BOTH `inventory_management` AND `inventory_policy`. A ghost can hide behind either one.

## Standing rules — production safety

1. **Never run a remediation script against production without a dry-run first.** Every script in repo root (`audit-*.mjs`, `fix-*.mjs`, `flip-*.mjs`, `review-*.mjs`) must default to dry-run and require an explicit `--apply` flag to write.
2. **Never batch-update Shopify or QBO without an owner review step.** Produce a CSV, send it to the team, wait for confirmation, then apply.
3. **Every Shopify variant write must set `inventory_management: 'shopify'` and `inventory_policy: 'deny'` explicitly** — both in code and in one-off scripts. Missing either creates ghosts.
4. **Never assume a problem was caused by our automation just because it surfaced during our pilot.** Pre-existing Shopify config can look identical to our bugs. Investigate volume and dates before attributing cause.
5. **The Shopify app has `read_orders` scope (last ~60 days only).** Any historical reconciliation beyond that window needs `read_all_orders`, which must be requested explicitly on the app.
6. **Audits must check both switches, not one.** Inventory correctness on Shopify = `inventory_management='shopify'` AND `inventory_policy='deny'` AND `inventory_quantity` is accurate. All three independently can cause visible-when-sold-out bugs.
