# Handoff: Product Ingestion Pipeline

**Date:** 2026-04-04
**Session:** Opus 4.6 (1M context)
**Branch:** `main` (commit `e644527`)

---

## What Was Built

### New files (19 files, ~2,600 lines)

| File | Purpose |
|---|---|
| **Database** | |
| `supabase/migrations/20260404140000_add_suppliers_and_products.sql` | `suppliers`, `products`, `product_images` tables + `product_sku_seq` sequence (starts NCE5200) |
| **Backend API** | |
| `app/api/products/route.ts` | GET (list with filters/search/pagination) + POST (create with auto-SKU → Shopify draft → QBO item) |
| `app/api/products/[id]/route.ts` | GET (single product + relations) + PATCH (update with shipping recalc) |
| `app/api/products/[id]/images/route.ts` | POST multipart image upload → Shopify images → auto-activate product |
| `app/api/suppliers/route.ts` | GET (list + typeahead search) + POST (create) |
| `app/api/shopify/auth/route.ts` | OAuth initiation — redirects to Shopify authorize URL |
| `app/api/shopify/auth/callback/route.ts` | OAuth callback — exchanges code for access token |
| **Libraries** | |
| `lib/products/shipping.ts` | `calculateShippingTier()` — auto-derives parcel/pallet/double from dimensions + weight |
| `lib/shopify/products.ts` | Create draft products, upload images, set active, fetch product metadata (types/vendors/collections) |
| `lib/qbo/items.ts` | Create QBO Items (with cost, VAT, purchase tax, supplier), create/find QBO Vendors, find tax codes + accounts |
| **Frontend** | |
| `app/products/page.tsx` | Product list page wrapper |
| `app/products/ProductList.tsx` | Client component — table with status filters, search, pagination, sync status indicators |
| `app/products/new/page.tsx` | New product page — fetches Shopify metadata for dropdowns |
| `app/products/new/ProductForm.tsx` | Main ingestion form — batch mode, auto shipping calc, cancel button |
| `app/products/new/SupplierTypeahead.tsx` | Typeahead supplier search with inline "Add new supplier" form |
| `app/products/[id]/page.tsx` | Product detail page — all fields, sync status, photo upload area |
| `app/products/[id]/PhotoUpload.tsx` | Photo upload component with drag-and-drop |
| `app/products/[id]/PhotoUploadWrapper.tsx` | Client wrapper for server component integration |
| **Config** | |
| `shopify.app.toml` | Shopify CLI config for NCE Automation API app |
| `manual_processes/PRD-product-ingestion.md` | Full PRD with architecture decisions |

### Modified files

| File | Change |
|---|---|
| `app/components/SidebarNav.tsx` | Added "Products" nav link |
| `CLAUDE.md` | Major rewrite — added product ingestion docs, Shopify app details, deployment info |

---

## Current State

### What works (code complete, deployed to Vercel)
- Product ingestion form with all structured fields
- Supplier typeahead with inline creation
- Auto-SKU generation (NCE5200+)
- Auto-shipping tier calculation from dimensions + weight
- Batch mode (add multiple products at once, shared supplier)
- Product list with status filters, search, pagination
- Product detail page with sync status
- Shopify API access (new token: `[set in Vercel + .env.local — do not commit]`)
- Product types (43) and vendors (13) populate form dropdowns from Shopify

### What's NOT been tested end-to-end yet
- **Creating a product through the form** — the full flow: form → Supabase → Shopify draft → QBO item
- **Photo upload** → Shopify images → auto-activation
- **QBO item creation** — tax codes, accounts, and vendor creation logic needs live testing
- **Collections** — not yet confirmed whether the multi-select populates correctly (custom_collections endpoint may need `read_products` scope to work)

### What's NOT built yet
- **Existing product migration** — importing 5000+ products from the CSV/spreadsheet into Supabase (see strategy below)
- **Edit/retry** — the product detail page displays data but doesn't have an edit form or "retry sync" button yet
- **Sync error recovery** — if Shopify or QBO push fails, the error is stored but there's no retry UI

---

## Shopify App Situation (important)

Two Shopify apps exist on the store:

1. **QuickBooks Integration** (Dev Dashboard app, client_id `2889f596368d03e88e08aead7af2a2fe`)
   - This is the third-party "QuickBooks Online Global" sync app
   - Has a setting: "When a Product is created in Shopify, create a new item in QuickBooks Online" — currently **ticked**
   - **Must be unticked** before our product ingestion goes live, or it will create duplicate QBO items
   - It matches by SKU, so even if both create items, it might just update — but safer to untick
   - This app is NOT used for our API access

2. **NCE Automation API** (Custom App, client_id `5f1c7aa2f0559a3fc7ff2cac0e77b659`)
   - This is OUR app for API access
   - Managed via `shopify.app.toml` + Shopify CLI
   - Current version: `nce-automation-api-4`
   - Access token: `[set in Vercel + .env.local — do not commit]` (set in Vercel + .env.local)

---

## Go-Live Strategy (for next sessions)

### Phase A: Test the pipeline
1. Create a single test product through the form
2. Verify it appears in Supabase, Shopify (as draft), and QBO (with correct cost/VAT/supplier)
3. Upload a photo — verify it appears in Shopify and product goes active
4. Fix any issues found

### Phase B: Disable the QBO duplicate path
1. Go to the "QuickBooks Online Global" app in Shopify admin
2. **Untick** "When a Product is created in Shopify, create a new item in QuickBooks Online"
3. This makes our pipeline the sole path for product → QBO creation
4. The existing hourly sync can keep running for other things (orders, invoices)

### Phase C: Migrate existing products (continuity)
The 5000+ existing products are already in both Shopify and QBO. We need them in Supabase too so the product list is complete. Strategy:

**Option 1 (recommended): Supabase-only import**
- Write a migration script that reads from Shopify API (all products) and creates Supabase records
- Map: Shopify product_id → `shopify_product_id`, extract SKU, price, vendor, type, dimensions from metafields/description
- Mark all as `status: active`, `shopify_status: active`, `qbo_synced: true` (they already exist in QBO)
- Don't push anything to Shopify or QBO — just backfill Supabase
- Supplier data would need to come from the CSV (Shopify doesn't store supplier info)

**Option 2: CSV import**
- Parse the existing `Nce Equipment List 5000+ - 5000.csv`
- Import into Supabase `products` table with the original SKU numbers
- Cross-reference with Shopify products by SKU to get `shopify_product_id`
- Mark as already synced

### Phase D: Deprecate the spreadsheet
1. Once Supabase has all existing products, the spreadsheet becomes read-only archive
2. All new products go through the form
3. Train the team on the new workflow

---

## Decisions Made
1. **Supabase replaces the spreadsheet** — single source of truth for product data
2. **Push to Shopify + QBO simultaneously** — no waiting for the hourly sync
3. **SKU auto-generated** — sequential from NCE5200+
4. **Shipping tier auto-calculated** — from dimensions + optional weight
5. **VAT is independent of condition** — driven by `vat_applicable` flag (Y/N in the old spreadsheet Column E)
6. **Supplier directory** — reusable, with QBO Vendor auto-creation
7. **Photos auto-activate** — uploading photos sets product from draft → active in Shopify
8. **Used the admin Custom App** (NCE Automation API) for API access, not the Dev Dashboard app — Dev Dashboard apps have OAuth incompatibilities with Shopify's token exchange endpoints

## Open Questions
1. **QBO tax code IDs** — the code does a runtime lookup for "20% Standard" and "Exempt" tax codes. This should work but hasn't been tested live. If it picks wrong codes, they'll need hardcoding.
2. **QBO income/expense account IDs** — same runtime lookup pattern. The third-party sync app uses "Sales of Product Income" and "Cost of Sales" which our code searches for.
3. **Collections population** — need to verify the Shopify custom_collections endpoint works with our token. If not, smart_collections might be needed too.
4. **Existing product count accuracy** — the CSV goes to ~5168 but there may be more recent products. The SKU sequence starts at 5200 to leave buffer.

---

## Parallel Sessions (for awareness)
- **Mobile redesign** — another session rebuilt the frontend for mobile users (bottom nav, card layouts, sticky buttons). Committed to `main`.
- **Logging** — another session is adding structured logging across routes. May have commits on `main`.

---

## How to Continue

Paste this into the next Claude Code session:

```
Read docs/handoffs/product-ingestion-pipeline.md and CLAUDE.md for full context.

URGENT BUG FIRST: The QBO API is returning 403 on journal entry creation for the April 2nd payout. Debug logging was just added (commit b444350). Steps:
1. Reset the payout: UPDATE payouts SET sync_status='pending', sync_error=NULL WHERE payout_date='2026-04-02'; and same for payout_transactions payment_status/payment_error
2. Have the user retry "Post to QuickBooks" from https://nce-automation.vercel.app/payouts (April 2nd payout)
3. Check Vercel logs: `vercel logs nce-automation.vercel.app --no-follow` — look for [qbo-client] and [qbo-journal] entries
4. The 403 might be: wrong QBO_ENVIRONMENT (should be "production"), sandbox flag misconfigured, token refresh failing silently, or realm_id mismatch. The new logging will reveal which.
5. QBO was just reconnected (2026-04-04 ~20:16 UTC) so the refresh token is fresh (expires July 2026). The access token auto-refreshes every hour.
6. If token refresh itself fails, user needs to re-auth: Settings → Disconnect QBO → Connect QuickBooks. The QBO_REDIRECT_URI on Vercel is now set to https://nce-automation.vercel.app/api/qbo/auth (updated this session). This must also match what's in the Intuit developer portal.

AFTER fixing the QBO bug, then:
1. Test the product ingestion pipeline end-to-end: /products/new → create test product → verify Supabase + Shopify draft + QBO item
2. Plan existing product migration (5000+ products from Shopify/CSV into Supabase)
3. Plan QBO sync app deactivation (untick "create new item" in QuickBooks Online Global)

Important context:
- Shopify access token: working (set in Vercel + .env.local)
- Two Shopify apps exist: "QuickBooks Integration" (third-party sync) and "NCE Automation API" (ours, managed via shopify.app.toml)
- The "QuickBooks Online Global" Shopify app still has "create new item in QBO" ticked — don't untick until product ingestion is validated
- Product types (43) and vendors (13) populate from Shopify API
- SKU sequence starts at NCE5200
- Use Vercel CLI for all Vercel operations (not MCP)
- Parallel sessions: mobile redesign + logging — both committed to main
```
