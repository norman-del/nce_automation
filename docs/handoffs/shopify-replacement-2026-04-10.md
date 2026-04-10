# Shopify Replacement — Handoff

**Date:** 2026-04-10
**Goal:** Make nce_automation a complete Shopify admin replacement with a sync toggle

## Context

nce_automation is the internal operations dashboard for NCE. All operational features are built (orders, products, customers, inventory, promotions, shipping rates, finance, staff RBAC). But the product pipeline still depends on the Shopify API in several places. The goal is to add a `SHOPIFY_SYNC_ENABLED` toggle so that when Shopify is turned off, everything works through Supabase directly.

**nce-site (the storefront) already reads from Supabase, not Shopify.** So the storefront is already independent. This work is purely about nce_automation's admin workflows.

## What Currently Depends on Shopify

### 1. Product type/vendor/collection dropdowns — `lib/shopify/products.ts:fetchProductMetadata()`
The product creation form (`/products/new`) and edit form (`/products/[id]/edit`) call `fetchProductMetadata()` which hits the Shopify API to get:
- Product types (44 unique values) — from `GET /products.json?fields=product_type`
- Vendors (13 unique values) — from same endpoint
- Collections (58 custom) — from `GET /custom_collections.json`

**Fix:** Read from Supabase instead:
- `SELECT DISTINCT product_type FROM products WHERE product_type IS NOT NULL ORDER BY product_type`
- `SELECT DISTINCT vendor FROM products WHERE vendor IS NOT NULL ORDER BY vendor`
- `SELECT id, title FROM collections WHERE collection_type = 'custom' ORDER BY title`

This should ALWAYS read from Supabase regardless of the toggle — no reason to hit Shopify for dropdown data.

### 2. Product creation → Shopify draft — `lib/shopify/products.ts:createShopifyProduct()`
Called from `POST /api/products` after saving to Supabase. Creates a draft product in Shopify with title, price, description, tags, collections, metafields (condition, dimensions), variant (SKU, weight, price).

**Fix:** Wrap in toggle check. If `SHOPIFY_SYNC_ENABLED=false`, skip. The product exists in Supabase and that's sufficient for nce-site.

### 3. Product editing → Shopify update — `lib/shopify/products.ts:updateShopifyProduct()`
Called from `PATCH /api/products/[id]`. Updates existing Shopify product.

**Fix:** Wrap in toggle check. Skip if disabled.

### 4. Product activation — `lib/shopify/products.ts:activateShopifyProduct()`
Called when photos are uploaded. Changes Shopify draft → active.

**Fix:** Wrap in toggle check. When disabled, just update `products.status = 'active'` in Supabase directly.

### 5. Photo upload → Shopify CDN — `lib/shopify/products.ts:uploadImageToShopify()`
Product photos are uploaded to Shopify's CDN via the Products API. The CDN URL is stored in `product_images`.

**Fix:** When Shopify sync is disabled, upload to Vercel Blob instead. Store the Blob URL in `product_images`. **Note:** Vercel Blob requires Vercel Pro plan — check if this is available. If not, can use Supabase Storage as a fallback.

### 6. Payout sync — `lib/shopify/payouts.ts`
Pulls payout data from Shopify Payments API for the finance page and QBO fee reconciliation.

**Fix:** No code change needed. When Shopify is gone, payments come through Stripe. The finance page will show historical Shopify payout data only. The daily cron (`/api/cron/sync`) should be disabled (or made toggle-aware) since there'll be no new Shopify payouts to sync.

## What Needs Building

### A. SHOPIFY_SYNC_ENABLED toggle
- Add `SHOPIFY_SYNC_ENABLED` env var (default: `true` for backward compatibility)
- Create `lib/shopify/config.ts` with a helper: `isShopifySyncEnabled()`
- Wrap all Shopify API write calls in this check
- When disabled, product create/edit/activate skip Shopify, photo upload goes to Blob/Storage
- The cron sync should also check this flag

### B. Supabase-sourced metadata for dropdowns
- New function `fetchProductMetadataFromSupabase()` in a new file (e.g. `lib/products/metadata.ts`)
- Returns same shape as `fetchProductMetadata()`: `{ productTypes: string[], vendors: string[], collections: {id, title}[] }`
- Update `/products/new/page.tsx` and `/products/[id]/edit/page.tsx` to call this instead
- **Also allow staff to add new product types and vendors** that don't exist yet — the form should accept free-text input (typeahead with existing values but allows new entries)

### C. Product description field
- The `body_html` column already exists on `products` table
- 2,695 of 2,704 products already have descriptions (imported from Shopify)
- Add a textarea/rich-text field to both the new product form and edit form
- When pushing to Shopify (while sync is enabled), include `body_html` in the payload
- The product form component is at `app/products/new/ProductForm.tsx`

### D. Collection management page
- Collections table already exists in Supabase with all 68 collections (58 custom + 10 smart)
- Schema: `id, shopify_id, handle, title, description, image_url, sort_order, collection_type, published_at, synced_at`
- Build a CRUD page in Settings (new tab) or as a standalone `/collections` route
- Features needed:
  - List all collections
  - Create new collection (title, handle auto-generated, description, type)
  - Edit collection (title, description)
  - Delete collection
- For smart collections: store the rules (which product types map to which parent collection). Currently these rules live in Shopify. Options:
  - **Simple approach:** Convert smart collections to explicit product-collection junction table entries. The `products.collections` array field already stores collection names per product. nce-site uses this to show products on collection pages.
  - **Rule-based approach:** Add a `collection_rules` table with rules like "product_type IN (Fryers, Chargrills, ...) → Cooking Equipment". A DB trigger or app-level logic auto-assigns products to smart collections based on their product_type.
  - **Recommended:** Simple approach. The products already have their collections assigned. New products get collections assigned via the form. Smart collections are just a display concept for the mega menu — nce-site already groups them.

### E. Image hosting switch
- When `SHOPIFY_SYNC_ENABLED=false`, photos need alternative hosting
- Option 1: **Vercel Blob** — requires Pro plan, native integration, best performance
- Option 2: **Supabase Storage** — already available, free tier sufficient for images
- The `product_images` table stores URLs — just needs to point to the new host instead of Shopify CDN
- Existing 2,704 products' images are on Shopify CDN. These URLs will break when Shopify is deactivated. The image migration (Shopify CDN → new host) is noted in the PRD as a separate task.

## What Does NOT Need Building (Already Independent)

| Feature | Why it's fine |
|---|---|
| Orders (view, fulfill, ship, cancel) | Stripe webhook → Supabase. No Shopify dependency. |
| Refunds | Stripe API. No Shopify dependency. |
| Customers | Supabase Auth + customers table. No Shopify dependency. |
| Inventory/stock tracking | Supabase stock_quantity + adjustments. No Shopify dependency. |
| Shipping rates | Supabase shipping_rates table. No Shopify dependency. |
| Promotions/discounts | Stripe promotion codes. No Shopify dependency. |
| Transactional email | Resend. No Shopify dependency. |
| QBO sync (items) | Pushes from Supabase product data. No Shopify dependency. |
| Search | Postgres FTS on products table. No Shopify dependency. |
| Auth/RBAC | Supabase Auth + staff_users table. No Shopify dependency. |

## Shopify Store Configuration Summary (from API audit)

### Products: 2,704
- 2,389 active, 315 draft
- Single-variant only (no size/colour options) — all use "Default Title"
- No barcodes used
- 2 template suffixes: default (2,245) and default-product-new (459)

### Product Types: 44
Bain maries, Bottle coolers, Chargrills, Chip Scuttles / Food Warmers, Coffee Grinders, Coffee Machines, Combi Ovens, Convection Ovens, Counter Fridges, Dishwasher, Display Fridge, Display freezer, Equipment Stands, Food Processors / Blenders, Fryers, Griddles, Hobs, Hotcupboards, Ice Machines, Microwaves, Mixers, Multideck chillers, Other cooking equipment, Oven, Panini / Contact Grills, Passthrough / Hood Dishwashers, Pizza Oven, Salamander Grills, Shelving, Sinks, Sundries, Tables, Toasters, Topping Fridges, Trolleys, Undercounter Freezers, Undercounter Fridges, Upright Freezers, Upright Fridges, Warming Displays, Water Boilers, clothing, tableware, utensils

### Vendors: 13
Adexa, Angelo Po, BKI, Black and White, Blizzard, Blue Seal, Blueseal, Buffalo, Burco, Gastronorm, Nationwide Catering Equipment, Rational, Sous Vide Tools

### Collections: 68 (all in Supabase already)
- 58 custom collections (manually curated category pages like "Fryers", "Coffee Machines")
- 10 smart collections (auto-populated by rules):
  - Cooking Equipment (13 product types)
  - Refrigeration (14 product types)
  - Stainless Steel (7 types)
  - Warewashing (4 types)
  - Hot Holding (5 types)
  - Drink Equipment (4 types)
  - Food Preparation (4 types)
  - Utensils (4 types)
  - New (condition metafield = "New")
  - Used (condition metafield = "Used – *")

### Metafields (custom, actually used by NCE):
- `custom.condition-new-used` — list field with values: New, Used – Like New, Used – Very Good, Used – Good, Used – Fair
- `custom.dimensions` — single text field (e.g. "100x100mm")
- All other metafields (30+ shopify.* fields) are Shopify's auto-suggested taxonomy attributes — NCE doesn't manually fill these.

### Shipping (Shopify config — for reference, NOT what nce_automation uses):
- 5 shipping zones, all UK, using weight-based and price-based rates
- nce_automation has its own simplified 3-tier system (Parcel/Single Pallet/Double Pallet) stored in `shipping_rates` table — this is the system that will be used going forward

### Tags: 70 unique values
Mix of brand names (Blizzard, Buffalo, Hobart, Lincat, etc.) and descriptive tags (barista, cleaning, gas, griddle, etc.)

## Implementation Order

1. **Shopify sync toggle + Supabase metadata** — env var, config helper, swap dropdown source
2. **Product description field** — textarea on create + edit forms
3. **Collection management** — CRUD in Settings
4. **Image hosting switch** — Vercel Blob or Supabase Storage fallback
5. **Cron sync toggle** — make payout cron respect the flag

## What Was Done This Session

1. Nav restructured (9 → 6 sidebar items)
2. Tabbed Settings page (Connections, Promotions, Shipping Rates, Activity Log)
3. `/payouts` renamed to `/finance`
4. Staff accounts + RBAC (admin/staff roles, admin-only pages and API routes)
5. Full QA pass with Playwright (3 bugs found and fixed)
6. Comprehensive Shopify API audit (products, collections, metafields, shipping, templates)
7. Gap analysis completed
8. PRD updated

### Commits
- `d8bed9e` Nav restructure, tabbed settings, staff RBAC, and QA fixes
