# Now vs Strategic — Scope, Bugs, Gap Analysis

**Last updated:** 2026-05-02
**Status:** Planning complete; segregation shipped (sidebar grouping + scope banners)

This is the **single source of truth** for how nce_automation is split between:
- **Current solution (Bridge)** — keeps the current Shopify/QBO business running until DNS cutover
- **Strategic (Post-Shopify)** — the stack that takes over at cutover

Other docs reference this one. Don't duplicate the rules below — link to them.

Related: `docs/handoffs/shopify-replacement-2026-04-10.md`, `docs/handoffs/shopify-admin-audit-2026-04-28.md`, `docs/lessons-learned.md`, `../nce-site/docs/PRD.md`.

---

## 1. Why this exists

Two risks drove this plan:

1. **Ghost-stock / duplicate-product incidents.** On 2026-04-14 and 2026-04-18 we had production incidents where Shopify variants ended up with stock tracking off or `inventory_policy='continue'`, causing sold items to stay visible on the storefront. See `docs/lessons-learned.md`. While we bridge to the new stack, any code that writes to Shopify has to keep respecting the standing rules from that doc.
2. **Confusion between "now" code and "strategic" code.** If a future session edits the wrong path — e.g. adds a "strategic" product form that *also* hits Shopify — we risk duplicates in Shopify, double journal entries in QBO, or a brand-new class of ghost product. We need an unambiguous rule for which code belongs to which world.

## 2. Segregation approach

**Decision (revised 2026-05-02):** visual sidebar grouping + per-page scope banner + parallel implementations for shared-domain features. No role-based hiding. Single env-var cutover switch.

The earlier "no code duplication" rule (option A, 2026-04-22) was over-restrictive: features that exist in both worlds (notably product ingestion + product editing) need both implementations to run **simultaneously** during the bridge so Norman/Rich can QA the Strategic flow against real data without breaking the live Shopify pipeline. A single env flag can't do that. So shared-domain features get parallel files; net-new Strategic features (collections, metafields, supplier feed, QBO sales sync, eBay, etc.) have no parallel and don't need one.

### 2.1 Visual rules

**Sidebar — grouped, Current at top.**

```
─── CURRENT SOLUTION (amber) ───  ← used most today; retired at cutover
  + New product            → /products/new
  Finance                  → /finance

─── STRATEGIC (green) ──────────  ← post-Shopify stack
  Dashboard
  Orders
  Products  (browse/view)
  Customers
  Settings
```

Implemented in `app/components/SidebarNav.tsx`. The Strategic Products entry is the read/browse view; the bridge "+ New product" entry is its own sidebar item so the active state is unambiguous. Edit (`/products/[id]/edit`) is reached from Products and is bridge — flagged via banner only, not the sidebar.

**Per-page scope banner.** Bridge pages render `<ScopeBanner mode="bridge" />` at the top. Strategic pages can render `mode="strategic"` if useful but it's optional — strategic is the default future state, banners aren't required. Component: `app/components/ScopeBanner.tsx`.

**Bridge action buttons on shared pages.** When a button on a Strategic page triggers a bridge action (the "+ New Product" button on `/products`, for example), give it an amber `ring-1 ring-amber-500/60` outline so the colour differentiation carries through.

### 2.2 Code rules

**Bridge folders are frozen.** Don't edit these as part of Strategic work; bridge bug-fixes go in their own commits:

```
app/products/new/                  ← bridge ingestion form
app/products/[id]/edit/            ← bridge edit form
app/finance/                       ← bridge payout reconciliation
app/api/cron/sync/                 ← bridge payout cron
lib/shopify/                       ← bridge Shopify client
lib/sync/payouts.ts                ← bridge payout sync
lib/qbo/items.ts                   ← bridge QBO item create/update (shared with Strategic but currently bridge-shaped)
```

**Strategic shared-domain features get parallel files.** When we build the post-Shopify product ingestion form, it goes in:

```
app/products/new-strategic/        ← Supabase + QBO only, photos to Vercel Blob
app/products/[id]/edit-strategic/  ← parallel edit
lib/strategic/products/            ← strategic-only server logic
```

(Final route names are a UX decision — `new-strategic` is fine for now; we may rename to `new-v2` or similar before cutover. Pick a convention and stick with it.)

**Strategic-only features have no bridge equivalent.** Collections CRUD, metafields editor, supplier feeds, QBO sales sync, eBay, shipping labels, draft orders, etc. — single implementation, lives in normal folders, no parallel needed.

**No role-based hiding.** Norman and Rich (both admin) must see everything so they can QA Strategic features.

**Every PR/commit declares its bucket.** If adding or fixing a feature, say in the commit message which bucket it belongs to. Never mix in one commit.

### 2.3 The single switch at cutover

`SHOPIFY_SYNC_ENABLED` env var (per CLAUDE.md § "Shopify Replacement Strategy") is the only cutover toggle:

1. Every Bridge feature respects this env var at runtime.
2. Every Strategic feature ignores it (or explicitly requires it `false`).
3. On cutover day, flip to `false` in production. Bridge code becomes no-ops; sidebar swaps the "+ New product" entry to point at the strategic route.
4. After ~3 months of stable operation, delete bridge folders + sidebar group entirely.

## 3. Feature inventory

### Now (Bridge) — must keep working until cutover

| Feature | Route / file | Status |
|---|---|---|
| Product ingestion form | `app/products/new`, `lib/shopify/products.ts`, `lib/qbo/items.ts` | Working w/ 3 known bugs (see §5) |
| Product editing sync | `app/products/[id]/edit`, `updateShopifyProduct`, `updateQboItem` | Same 3 bugs |
| Shopify payout fee sync | `app/finance`, `lib/sync/payouts.ts`, `/api/cron/sync` | Stable |
| Photo upload → Shopify CDN → activate | `lib/shopify/products.ts:271`, `updateProductStatus` | Stable |

### Strategic (Post-Shopify) — built Shopify-independent

| Feature | Status | Owner doc |
|---|---|---|
| Collection CRUD admin UI | In progress | PRD §3.4, §3.8 |
| Metafield / specs editor | In progress | PRD §3.4, §3.8 |
| Supplier feed ingestion (Stockeo replacement) | Done, disabled | PRD §3.5 |
| QBO sales sync (Supabase orders → QBO invoices) | Done, dry-run | PRD §3.2 |
| Image hosting off Shopify CDN | Blocked on Vercel Pro | PRD §3.4 |
| Draft orders / quotes | Not built | PRD §3.8 Tier 1 |
| Cross-channel stock sync (site + eBay + QBO) | Not built | This doc §7 |
| eBay listing + order + tracking | Not built | This doc §6 |
| Shipping labels (APC + Pallettrack) | Not built | PRD §3.7 |
| Returns / RMA | Not built | PRD §3.8 Tier 2 |
| B2B pricing / customer tags | Not built | PRD §3.8 Tier 2 |
| Gift cards | Not built | PRD §3.8 Tier 2 |
| Rewards backend | Not built | PRD §3.4 |
| Staff invite UI | Not built | PRD §3.4 |
| Ex/Inc VAT toggle (storefront) | Visual only | PRD §3.4 |
| Content management (nav, banners, blog, policies) | Not built | PRD §3.8 Tier 1 |

## 4. Safety invariants (carry over from lessons-learned)

All of these apply to **Now** code. Strategic code doesn't touch Shopify at all, so most are N/A.

1. **Every Shopify variant write must set `inventory_management: 'shopify'` AND `inventory_policy: 'deny'` explicitly.** No defaults. Checked: `lib/shopify/products.ts:104-105, 221-222, 307`. Both exist today.
2. **Audits must check both switches + `inventory_quantity`**, not one.
3. **Remediation scripts default to dry-run.** `--apply` required to write.
4. **No batch Shopify/QBO writes without owner review.** CSV → review → apply.
5. **Idempotency.** Every product-create path must check `products.shopify_product_id` / `qbo_item_id` before pushing. Current code does this; do not regress.
6. **The `SHOPIFY_SYNC_ENABLED` env var is the only cutover switch.** Do not add parallel toggles.

---

## 5. Bug fixes — detailed specs (Now bucket)

Execute in order: Bug 1 first (biggest QBO integrity risk), then Bugs 2+3 together (same file, same PR). Bug 4 (QBO token auto-refresh) is independent — can slot in anywhere.

### Diagnostic data captured 2026-04-22

QBO tax codes (realm `9130350116981876`), only 3 active:
- `id=5` **`20.0% S`** — Standard 20% VAT, sales + purchase rates both defined
- `id=18` **`Margin`** — Margin scheme, **sales rate only, no purchase rate**
- `id=9` **`No VAT`** — Zero/exempt, both rates defined

17 others exist but are inactive + hidden (EU-era codes). Current heuristic in `lib/qbo/items.ts:277` picks `id=15 "20.0% ECG"` first (EC Goods Standard, inactive, hidden) for the 20% case — QBO UI then shows VAT dropdown as blank because inactive codes don't render. That's Norman's "not selecting 20%" symptom.

For margin: `id=18` is correct for sales. Our code also writes it to `PurchaseTaxCodeRef`, but this code has no purchase rate, so QBO silently drops the purchase side. That's the "not selecting margin on purchases" symptom. Correct behaviour: for margin items, omit `PurchaseTaxCodeRef` + `PurchaseTaxIncluded` entirely.

Script: `scripts/dump-qbo-tax-codes.mjs` (kept for reuse).

### Bug 1 — QBO not applying margin / 20% VAT codes

**Symptom (Norman, 2026-04-20):** "When receiving information from the dashboard, it is not choosing margin or 20% on the dropdown boxes for sale or purchases."

**Impact:** Every product created since this started is potentially mis-coded in QBO. VAT returns could understate or overstate liability. Needs urgent audit + fix.

**Root cause (suspected):** `lib/qbo/items.ts:254-301` `findTaxCodes()` matches QBO tax codes by fragile string search — `name.includes('20')` for standard-rated, `name.includes('margin')` for margin scheme. If the live QBO instance has tax codes whose names don't contain those exact substrings (or contain them in unexpected places), the wrong code is selected or the throw at line 292 fires silently into the `createItem` catch.

Secondary suspects:
- `PurchaseTaxIncluded: true` + margin code (`lib/qbo/items.ts:139-140, 210-211`) — UK second-hand-goods margin scheme typically uses **no** purchase tax. QBO may silently drop `PurchaseTaxCodeRef` and leave the field blank in the UI.
- In-memory cache `cachedTaxCodes` (line 252) — survives across requests on a warm Lambda. If a bad match gets cached once, it persists until the container recycles.

**Fix plan:**

1. **Diagnostic first.** Add admin-only `GET /api/qbo/debug/tax-codes` that returns every tax code and account in the connected QBO instance with Name, Id, type. Ship this alone, run it, paste the output into the bug-fix chat so we know the actual names.
2. **Explicit mapping, not string search.** Add columns to `qbo_connections`:
   - `vat_standard_tax_code_id` (sales + purchase, 20%)
   - `vat_margin_sale_tax_code_id`
   - `vat_margin_purchase_tax_code_id` (nullable — may be blank/no-VAT for margin)
   Set on connect (like existing account mappings in `app/api/qbo/auth/route.ts`). Show them in Settings → Connections so Gus can verify visually.
3. **Replace `findTaxCodes()`** with a helper that reads the mapping from `qbo_connections`. Keep `findTaxCodes()` only as a fallback if mapping is null (with a loud warning in logs).
4. **Reconsider `PurchaseTaxIncluded` for margin items.** If `vat_margin_purchase_tax_code_id` is null, omit `PurchaseTaxCodeRef` and `PurchaseTaxIncluded` entirely.
5. **Audit script** (dry-run default): iterate `products` where `qbo_item_id is not null`, fetch current tax codes from QBO, report any mismatch vs what we'd set today. Owner reviews CSV, then `--apply` to fix in place via `updateQboItem`.

**Files touched:** `lib/qbo/items.ts`, `app/api/qbo/auth/route.ts`, `app/settings/SettingsTabs.tsx` (or Connections tab), `app/api/qbo/debug/tax-codes/route.ts` (already shipped), new `supabase/migrations/*_qbo_vat_mappings.sql`, new `scripts/audit-qbo-vat-codes.mjs`.

**Known values to seed for Gus's realm `9130350116981876`:**
- `vat_standard_tax_code_id = 5` ("20.0% S")
- `vat_margin_sale_tax_code_id = 18` ("Margin")
- `vat_margin_purchase_tax_code_id = NULL` (no-op — margin has no purchase rate)

**Definition of done:**
- Settings → Connections page shows the three tax code IDs + Names, editable.
- Creating a margin-scheme product in the sandbox and checking QBO shows the margin code on both sale and purchase (or sale only if purchase is null-by-design).
- Creating a 20%-VAT product shows 20% on both.
- Audit script reports 0 mismatches after the fix + remediation.

---

### Bug 2 — Shopify product not published to all sales channels

**Symptom (Norman, 2026-04-20):** "It is not selecting sales on all channels."

**Impact:** New products are only visible on the Online Store channel. Anyone shopping from POS, Shop app, or other channels can't see them.

**Root cause:** `lib/shopify/products.ts:131-149`. The loop *fetches* publications, then inside the loop calls `PUT /product_listings/{productId}.json` without referencing the publication ID — so it only publishes to one channel (the Online Store, implicit default) and every iteration is the same no-op. Additionally, REST's `/product_listings` endpoint only governs the Online Store channel; **multi-channel publishing moved to GraphQL** (`publishablePublish` mutation) in Shopify API 2020-07 and REST is effectively deprecated for this use case.

**Fix plan:**

1. Add GraphQL client helper in `lib/shopify/client.ts` (or extend `shopifyFetch` with a GraphQL variant).
2. Replace the REST loop with one GraphQL call:
   ```graphql
   mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
     publishablePublish(id: $id, input: $input) {
       publishable { ... on Product { id } }
       userErrors { field message }
     }
   }
   ```
   Build `$input` as `publications.map(p => ({ publicationId: p.id }))` after fetching publications once (cache for the request lifetime).
3. Do the same in `updateProductStatus` (draft → active transition) in case a product was created before this fix landed.
4. Verify scope: Custom App needs `write_publications` scope. Check `shopify.app.toml` — add if missing, re-deploy + release.

**Files touched:** `lib/shopify/products.ts`, `lib/shopify/client.ts`, possibly `shopify.app.toml`.

**Definition of done:**
- Create a product via dashboard. In Shopify Admin, the product shows all configured channels ticked (Online Store, Shop, POS, Google, any others in use).
- Activate a draft product via dashboard. Same result.

---

### Bug 4 — QBO token auto-refresh not running

**Symptom (Gus, 2026-04-22):** Production QBO access token was expired, forcing a full OAuth re-auth click-through. Happened again today.

**Impact:** Any QBO sync (product create, edit, payout journal, sales invoice cron) silently fails when the access token is stale. Staff don't know until something doesn't show up in QBO. Also breaks diagnostic scripts.

**Root cause (to investigate):** Access tokens last ~1 hour. Refresh tokens last 100 days and rotate on use. `lib/qbo/client.ts:getQboClient()` refreshes transparently when called during a normal API flow — so normal usage keeps the token fresh. But if QBO API isn't called for a full hour, the next call has an expired access token and must refresh. If the refresh succeeds, the new tokens should save via the `rotate_qbo_tokens` RPC. If that RPC is failing silently, tokens never save → every stale-call has to refresh from a refresh token that's already been consumed → chain breaks.

**Suspects to check:**
1. Is there an `/api/cron/qbo-refresh` or equivalent keep-alive? Look in `vercel.json` crons.
2. Does `rotate_qbo_tokens` RPC exist in Supabase and succeed? Check `sync_log` for refresh entries.
3. Is `refresh_token_expires_at` being written on every successful refresh? If null, the 100-day clock can't be tracked.
4. Are there concurrent requests both trying to refresh at once and racing (one saves, one gets a now-invalid token)?

**Fix plan:**
1. Add a lightweight keep-alive cron at `/api/cron/qbo-refresh` that runs every 45 min and calls `getQboClient()` just to trigger refresh cycle. Logs result to `sync_log`.
2. Add a /settings indicator showing last successful QBO API call + last refresh timestamp, so staleness is visible.
3. Audit `lib/qbo/client.ts` save-back path for race conditions (use `FOR UPDATE` or advisory lock).
4. Ensure `refresh_token_expires_at` is always written.

**Priority:** High — blocks every QBO-touching session and creates hidden data gaps.

**Files touched:** `lib/qbo/client.ts`, new `app/api/cron/qbo-refresh/route.ts`, `vercel.json`, possibly new migration.

### Bug 3 — Shopify description loses paragraph formatting

**Symptom (Norman, 2026-04-20):** "Ideally the description of the product should upload using the same format typed on the dashboard (separating paragraphs)."

**Impact:** Cosmetic, but every customer-facing PDP shows a single wall of text. Reduces conversion + looks unprofessional.

**Root cause:** Form textarea at `app/products/new` (and edit page) captures plain text with `\n\n` between paragraphs. It's passed through unchanged as `body_html` in `lib/shopify/products.ts:76-85, 182-195`. Shopify treats `body_html` as literal HTML; plain-text newlines collapse into one paragraph in the rendered theme.

**Fix plan:**

1. Create `lib/shopify/format.ts` with a single `plainTextToHtml(text: string): string` helper:
   - Normalise line endings (`\r\n` → `\n`)
   - Split on `\n{2,}` → each chunk becomes a `<p>`
   - Within a `<p>`, replace single `\n` with `<br>`
   - Escape HTML entities in the source (the user typed plain text, not HTML — `<`, `>`, `&` must be escaped)
   - If the input already contains `<p>` or `<br>`, return as-is (assume it's already HTML — defensive)
2. Call it in both `createShopifyProduct` and `updateShopifyProduct` right before assigning `body_html`.
3. Decision on storage format: **store plain text in Supabase** (rename the field conceptually — it's a description, not HTML), convert at Shopify push time. This way if we ever render the description from Supabase on the Strategic storefront, we control the formatting.
4. Migration: one-off script to re-push existing product descriptions through the new helper so old products also get paragraphs. Dry-run default. Owner review CSV before apply.

**Files touched:** new `lib/shopify/format.ts`, `lib/shopify/products.ts`, possibly `app/products/new/page.tsx` and `app/products/[id]/edit/page.tsx` (to label the field as "Description (plain text)"), new `scripts/reformat-shopify-descriptions.mjs`.

**Definition of done:**
- Form with paragraphs separated by blank lines → Shopify PDP shows those paragraphs.
- Existing products remediated via dry-run-then-apply script.
- `<script>` tags in the textarea (accidental or malicious) are escaped, not rendered.

---

## 6. eBay integration — architecture and sprint plan (Strategic)

Research summary from 2026-04-22:

### Auth model
- **OAuth 2.0** (no long-lived app token like Shopify Custom App).
- User access token: ~2 hours.
- **Refresh token: 18 months, NOT rotated on use.** Easier than QBO (which rotates every use). Store encrypted once, refresh silently.
- Mirror `qbo_connections` pattern → new `ebay_connections` table.

### APIs in use
- **Sell Inventory API** — 3-call publish: `createOrReplaceInventoryItem` → `createOffer` → `publishOffer`. Real-time, not batch. 225 listings is well within rate limits (5k calls/day).
- **Sell Fulfillment API** — `getOrders` for polling, `createShippingFulfillment` for tracking out.
- **Notification API** — webhooks for order events. Requires public HTTPS endpoint with signature verification.
- **Sell Account API** — manage Business Policies (payment/return/fulfillment). Mandatory in UK, set once.

### UK specifics
- Marketplace ID: `EBAY_GB` (header `X-EBAY-C-MARKETPLACE-ID`).
- VAT: set per-offer via `tax.vatPercentage`. eBay UK acts as marketplace facilitator for B2C — they remit, we still declare.
- Carriers: standard list (Royal Mail, Parcelforce, DPD, Evri, DHL, UPS, Yodel) via `shippingCarrierCode` string.
- Business Policies: must exist before any offer can publish.

### Compliance gotchas
- **Account Deletion webhook endpoint is mandatory** for production OAuth approval. Trivial to miss, blocks go-live.
- Category-specific **required item aspects** (brand, MPN, condition). Missing = publish rejected. Fetch via `getItemAspectsForCategory` per product.
- Images must be public HTTPS URLs (eBay fetches them). Or upload via Trading API `UploadSiteHostedPictures`. Note: once we migrate off Shopify CDN we'll need our own public image URLs anyway (PRD §3.4).

### Pricing + shipping (from Rich, 2026-04-20)
- Every listing = NCE price × 1.15 (covers eBay's ~15% fees). Store as computed field on product, not manually entered.
- Fixed-price only, no auctions.
- Shipping: £9.95 courier (parcel, tier 0), £75 pallet (tiers 1–2). Map to eBay `fulfillmentPolicy` templates — one per shipping tier.
- **Delivery pricing direction:** NCE is phasing out "delivery included" listings — all new and updated listings should use delivery cost on top, not free shipping. Do not build a "free shipping" path.
- ~225 active listings typical — only higher-value items go on eBay.

### Sprint breakdown

| Sprint | Scope | Outcome |
|---|---|---|
| **E1** | OAuth + `ebay_connections` + Settings tab "Connect eBay" + token refresh job + Account Deletion webhook stub | Gus can connect his eBay account; refresh cycle proven |
| **E2** | "List on eBay" admin button on product detail. Pre-flight: fetch category aspects, validate required fields. Build + publish 3-call flow. Store `ebay_listing_id` on product. | Norman can list a product in one click |
| **E3** | Notification API webhook → ingest sold orders into `orders` table with `source='ebay'`. Dedupe. Decrement stock. Cross-channel sync (see §7). | eBay sales appear in `/orders` dashboard automatically |
| **E4** | Outbound tracking: on ship action, call `createShippingFulfillment` with carrier + tracking number. | Ship once, tracking visible on all channels |

Not in scope v1: auctions, returns automation, Promoted Listings, best-offer, variation listings.

## 7. Cross-channel stock sync (Strategic)

Norman (2026-04-20): *"if a product is sold on website, QBO, or eBay, adjust stock accordingly."*

Source of truth: `products.stock_quantity` in Supabase. Fan-out pattern.

| Channel | Outbound (our stock change → channel) | Inbound (their sale → our stock) |
|---|---|---|
| Website (nce-site) | N/A — reads Supabase directly | Stripe webhook creates order; decrement on order create |
| eBay | `bulkUpdatePriceQuantity` (25 SKUs/call) | Notification API webhook → order create → decrement |
| Shopify (bridge) | `inventory_levels/set` on every change | Shopify order webhook → order create → decrement |
| QBO | Stocked items decrement via invoice; non-stock drop-ship exempt | No inbound — QBO never originates sales |

**Architecture:** Single fan-out service. Trigger on any write to `products.stock_quantity` (Supabase trigger → pg_net → `/api/stock-sync/fanout`, or post-write hook in our API layer). One adapter per outbound channel. One webhook handler per inbound channel, all writing into `orders` + `stock_adjustments`.

**Idempotency:** Every inbound adapter must dedupe by external order ID. `orders.source_order_id` + `orders.source` (unique composite).

## 8. Drop-ship product support (Strategic, small)

Norman (2026-04-20): *"We treat these products on QBO as 'non stock'… SKU used is the one the supplier uses instead of our sequential four numbers."*

Currently missing. `lib/qbo/items.ts:121` hard-codes `Type: 'Inventory'` — first drop-ship product through the new form will be mis-coded.

**Changes:**
- Migration: `products.is_dropship boolean default false`, `products.supplier_sku text`.
- Form: "Drop-ship?" toggle. When on:
  - SKU field accepts supplier's SKU (no NCE5xxx auto-generation).
  - On submit: `createQboItem` receives `isDropship=true` → sets `Type: 'NonInventory'`, omits `TrackQtyOnHand`, `QtyOnHand`, `AssetAccountRef`.
- Stock is managed only by supplier feed (PRD §3.5), never by staff.
- Shopify: set `inventory_management: 'shopify'` but `inventory_quantity` comes from feed. Still `inventory_policy: 'deny'` (invariant from lessons-learned).

---

## 9. Execution order (fresh chats)

Each bullet is a self-contained chat session. Deliver in order.

1. **Doc updates** — this file + CLAUDE.md addition + memory note. _(This session.)_
2. **Bug 1 diagnostic** — ship `GET /api/qbo/debug/tax-codes`, run it, capture output.
3. **Bug 1 fix** — explicit tax code mappings in `qbo_connections` + Settings UI + audit/remediation script.
4. **Bugs 2 + 3** — Shopify GraphQL multi-channel publish + plain-text-to-HTML description helper + remediation script for existing descriptions.
5. **Drop-ship support** — migration + form toggle + QBO non-inventory branch.
6. ~~**UI segregation banners** — Now / Strategic ribbons on every page.~~ Done 2026-05-02. `ScopeBanner` component on `/products/new`, `/products/[id]/edit`, `/finance`. Sidebar grouped (Current Solution at top, Strategic below) with amber/green outlines. `+ New Product` button on `/products` carries the amber ring as a bridge action.
7. **Strategic product ingestion — Phase 1 (create-only)** _(in progress 2026-05-02)_. Parallel form at `/products/new-strategic` + `app/api/products-strategic/` + `lib/strategic/products/`. Writes to Supabase + QBO; photos go to Supabase Storage `product-images` bucket; product status `active` on create. Gated by env `STRATEGIC_INGESTION_ENABLED` (default false). Bridge form untouched.
8. **Strategic product ingestion — Phase 2 (edit + list awareness)**. Parallel `/products/[id]/edit-strategic`, product list page routes Edit links to bridge or strategic based on `shopify_product_id IS NULL`, settings panel to flip the env var without redeploy.
9. **Collection CRUD admin UI** — Strategic, already in progress per PRD §3.4.
10. **Metafield / specs editor** — Strategic, already in progress per PRD §3.4.
11. **Strategic finance page** — Stripe (or Dojo, if approved) payouts → QBO journal entries. Different shape from bridge Finance page. Blocked on Stripe-vs-Dojo decision and on `nce-site` payout-data being available in Supabase.
12. **eBay E1** — OAuth + connection + webhook stub.
13. **Cross-channel stock sync foundation** — fan-out service, Website + Shopify adapters.
14. **eBay E2/E3/E4** — listing, inbound orders, outbound tracking. Plug into stock-sync.
15. **Image hosting migration** — for legacy Shopify-CDN URLs (Vercel Blob, blocked on Vercel Pro per PRD §3.4). Strategic-created products already use Supabase Storage.
16. **Shipping labels** — APC + Pallettrack (PRD §3.7).
17. **Remaining Tier 1/2** — draft orders, returns, B2B pricing, CMS, rewards (PRD §3.8).
18. **Cutover** — flip `SHOPIFY_SYNC_ENABLED=false`, swap sidebar `+ New product` to point at strategic route, monitor 3 months, delete bridge folders.

## 10. Testing-readiness gate

Before we ask Norman and Rich to QA product ingestion end-to-end (add test product → verify in Shopify + QBO → edit → remove), we need all three bugs fixed and the existing products remediated:

- [x] **Bug 1 fixed + VAT audit clean (2026-04-22).** Migration seeded mapping (standard=5, margin sale=18, margin purch=9). `findTaxCodes` replaced with DB-backed `getTaxCodeMapping`. Audit showed 43/45 correct; 2 items (NCE6410, NCE6396) remediated via `scripts/audit-qbo-vat-codes.mjs --apply`.
- [x] **Bug 2 fixed (2026-04-22).** GraphQL `publishablePublish` via new `shopifyGraphQL` helper + `publishToAllChannels()`. Called on create AND on draft→active. Scope `write_publications` added to `shopify.app.toml` — **needs `npx shopify app deploy` + `release` + reinstall before live** (see §11).
- [x] **Bug 3 fixed (2026-04-22).** `lib/shopify/format.ts` `plainTextToHtml()` wired into create + update. Existing descriptions will be reformatted on next staff edit (no mass-remediation script — natural drift is fine).
- [x] **Bug 4 fixed (2026-04-22).** Root cause: `intuit-oauth` v4.2.2's `client.refresh()` rejects valid tokens — confirmed by diagnostic showing raw HTTP 200 vs library "invalid". Replaced with raw fetch in `lib/qbo/auth.ts`. Hardened: 3× retry on DB save, 15-min refresh threshold, daily keepalive cron at `/api/cron/qbo-refresh`, visibility on Settings → Connections. Verified end-to-end on prod.
- [ ] Drop-ship toggle shipped (Norman has drop-ship products to add)
- [x] UI banner on product form clearly says "Current solution — writes to Shopify + QBO" (shipped 2026-05-02; sidebar also grouped Current at top, Strategic below)

Only then hand over for owner testing.

## 11. Outstanding actions for Gus (from 2026-04-22 session)

Before the Bug 2 fix is live in production, the Shopify app scope change must deploy:

```bash
# In nce_automation/ directory
npx shopify app deploy       # uploads new config to Shopify
npx shopify app release      # promotes to active
```

Then **reinstall the app in Shopify admin** (Apps → NCE Automation API → Uninstall → re-install via OAuth flow from the dashboard) so the stored access token picks up the new `write_publications` scope. Without this step, `publishToAllChannels()` will error with a 403 and the create/activate flow will log a warning but continue (product still created, just not cross-channel published).

Also needs committing + deploying:
- Supabase migration `20260422120000_qbo_vat_tax_code_mapping.sql` (already applied to prod DB directly; migration file is for future environments / replays)
- All code changes in `lib/qbo/items.ts`, `lib/shopify/products.ts`, `lib/shopify/client.ts`, `lib/shopify/format.ts`, `shopify.app.toml`
- New scripts: `scripts/dump-qbo-tax-codes.mjs`, `scripts/audit-qbo-vat-codes.mjs`
- New diagnostic route: `app/api/qbo/debug/tax-codes/route.ts`
