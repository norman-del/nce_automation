# Phase 2 Operations Dashboard — Handoff

**Date:** 2026-04-10
**Session:** nce_automation — Phase 2 + Phase 3 high-priority items

## What was built

### Phase 2 — Order Management (Sprints A/B/C)
- `/orders` — list page with status filters, search by order number/email
- `/orders/[id]` — detail with line items, addresses, customer info, Stripe payment card
- `/api/orders/[id]/status` — PATCH with validated transitions
- `/api/orders/[id]/ship` — POST sets tracking + marks shipped + triggers email to customer
- `/api/orders/[id]/refund` — POST issues Stripe refund, updates status, logs to sync_log
- `/customers` — list with order count + total spend
- `/customers/[id]` — detail with stats + order history
- Migration: `order_number` (auto NCE-1001+) and `tracking_number` on orders

### Phase 3 — High Priority Items
- **Product editing** — edit page unlocked for all statuses, PATCH syncs to Shopify + QBO
- **Bulk CSV import** — `/products/import` with column mapping, preview, batched insert
- **Inventory tracking** — `stock_quantity` + `low_stock_threshold` on products, `stock_adjustments` audit table, StockManager component on product detail
- **Promotions** — `/promotions` page to view/create Stripe promo codes
- **Shipping rates** — `/shipping` page to edit rates per tier, `shipping_rates` table in Supabase
- **Shipping email** — ship endpoint calls nce-site `/api/email/shipping` to notify customer

### Navigation
- Sidebar: Orders, Customers, Promotions, Shipping added
- Mobile tab bar: Orders + Customers tabs
- Header: renamed to "NCE Automation"

### Env vars configured
- `STRIPE_SECRET_KEY` — all envs on nce_automation
- `INTERNAL_API_KEY` — all envs on both projects (same key)
- `NCE_SITE_URL` — all envs on nce_automation

### Commits (7 total, all pushed to main)
1. `fb1ddb6` Phase 2: Order management, Stripe refunds, customers dashboard
2. `559c3df` Product editing: update across Supabase + Shopify + QBO in one save
3. `f85c873` Bulk CSV import for existing products into Supabase
4. `1642e7e` Inventory tracking: stock levels, adjustments, low-stock alerts
5. `3a8163d` (includes SKU edit validation from other session)
6. `c20a5af` Promotions, shipping rates, and shipping email trigger

## Current state

**What works:** Everything listed above is built, builds clean, and is deployed.

**What's partially done:** Nothing — all items are complete.

**What's untouched:**
- Staff accounts + permissions (medium priority in PRD section 3.3)
- Advanced analytics (medium priority)
- Abandoned cart recovery (medium priority)

## PRD status

PRD at `~/nce-site/docs/PRD.md` is fully up to date. Section 3.2 has all completed items documented. Section 3.3 shows remaining items. New Section 8 has "Action Needed From Gus" checklist.

## Next steps

The next nce_automation session should either:
1. **Staff accounts + permissions** — role-based access (admin vs staff), login system for the dashboard
2. **Help nce-site with Sprint 11** — pre-launch polish items that need nce_automation coordination (e.g. ensuring shipping rates table is read by nce-site instead of hardcoded values)

## Open questions
- Should nce-site read shipping rates from the `shipping_rates` table instead of hardcoded values? The table exists and is seeded, but nce-site hasn't been updated to read from it yet.
- When is the bulk CSV import needed? The page is ready, but the CSV file needs to be prepared with the right column headers.
