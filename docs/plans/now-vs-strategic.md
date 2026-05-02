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

Each numbered item is a self-contained chat session. **Build in this order — top to bottom.** Detailed specs for every cutover-blocker live in §12.

### Done
1. ~~Doc updates, bug fixes (1–4), drop-ship support carried forward~~ — completed pre-2026-05-02.
2. ~~**UI segregation banners** — sidebar grouped (Current Solution / Strategic), `ScopeBanner` on bridge pages.~~ Done 2026-05-02.
3. ~~**Strategic product ingestion — Phase 1 (create-only)**.~~ Done 2026-05-02. Form at `/products/new-strategic`, photos to Supabase Storage, no env-var gate, real QBO writes.

### Cutover blockers — build in this order

| # | Item | Spec | Why this position |
|---|---|---|---|
| 4 | **Strategic product edit (Phase 2)** | §12.1 | Small. Builds directly on Phase 1. Unblocks staff editing strategic-created products. ~1 session. |
| 5 | **Inventory + sales sync — Phase 0 (shadow read)** | §12.2 / PRD §3.11 | Small. Kicks off the 1-week soak window that gates Phase 1. The earlier Phase 0 ships, the earlier Phase 1 unblocks. ~1 session. |
| 6 | **Image hosting migration** | §12.3 | Independent. Bulk download from Shopify CDN → Supabase Storage + DB URL update. Has to land before cutover or every PDP goes blank-image. ~1–2 sessions. |
| 7 | **Metafields / specs editor** | §12.4 | Long-tail spec data on PDPs has no admin UI today. Without this, post-cutover staff can't update detailed specs. ~1–2 sessions. |
| 8 | **Inventory + sales sync — Phases 1+2** | §12.2 / PRD §3.11 | After Phase 0 soak shows clean drift data. Phase 1 = stock-in cron points at `stock_quantity`. Phase 2 = decrement on sale + post Sales Receipt to QBO. ~2 sessions. |
| 9 | **Strategic finance** | §12.5 | Replaces bridge payout sync. Blocked on Stripe-vs-Dojo decision; can be deferred to a manual-reconciliation week if needed. ~1 session once unblocked. |
| 10 | **Content management (CMS)** | §12.6 | Nav, hero, banners, blog, pages, policies admin UI. Biggest scope. Operationally painful without; not strictly cutover-blocking if owner accepts dev-task copy changes. ~3–4 sessions. |
| 11 | **Draft orders / quotes** | §12.7 | Used by reps for negotiated B2B sales. Operationally painful without; not strictly cutover-blocking if reps fall back to manual quotes for a few weeks. ~1–2 sessions. |
| 12 | **Inventory sync — Phase 3 (refunds + backfill)** | PRD §3.11 | Refund inverts both sides; one-shot backfill at cutover. Build right before cutover. ~1 session. |
| 13 | **Cutover** | §13 | Flip `SHOPIFY_SYNC_ENABLED=false`, swap sidebar default route, monitor 3 months, delete bridge folders. |

### Deferred (post-cutover, separate track)
- eBay integration (E1–E4), cross-channel stock sync foundation, shipping labels (APC + Pallettrack)
- Returns/RMA workflow, gift cards, B2B pricing, reports dashboard, staff invite UI
- AI chatbot (WP-9), iwocaPay calculator (WP-8), brand refresh (WP-10) — owner-feedback items in PRD §3.10

**Convention reminder:** every commit declares its bucket. Bridge folders (`app/products/new/`, `app/products/[id]/edit/`, `app/finance/`, `lib/shopify/`, `lib/sync/payouts.ts`, `lib/qbo/items.ts`, `app/api/cron/sync/`) are frozen — do not edit them as part of strategic work.

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

---

## 12. Cutover-blocker specs

Each subsection is a self-contained spec for a fresh chat session. Format:
- **Scope** — what gets built
- **Files** — paths to create/modify
- **Phasing** — if multi-step
- **Open decisions** — things to resolve before coding (or before merging)
- **Definition of done** — how we know it's shipped

### 12.1 Strategic product edit (Phase 2 of strategic ingestion)

**Bucket:** Strategic. **Depends on:** §12 item §3 (Phase 1 create) — done.

**Scope.** Parallel of `/products/[id]/edit` that doesn't touch Shopify. Edit existing strategic products (those with `shopify_product_id IS NULL`) by writing back to Supabase + updating the QBO Item if the SKU/title/price/VAT changed. Photo management (add/remove/reorder) on the same page using the same Supabase Storage bucket.

**Files.**

```
app/products/[id]/edit-strategic/page.tsx             ← new
app/products/[id]/edit-strategic/EditFormStrategic.tsx ← new (mirror of EditProductForm minus Shopify)
app/products/[id]/edit-strategic/PhotosManagerStrategic.tsx ← new (or split out)
app/api/products-strategic/[id]/route.ts              ← new (PATCH handler)
app/api/products-strategic/[id]/photos/[imageId]/route.ts ← new (DELETE individual photo)
app/api/products-strategic/[id]/photos/order/route.ts ← new (PATCH reorder)
lib/strategic/products/update.ts                      ← new (orchestrator: Supabase update + optional QBO updateQboItem)
app/products/page.tsx                                 ← modify: route Edit links to bridge or strategic based on shopify_product_id IS NULL
app/products/[id]/page.tsx                            ← modify: Edit button picks the right route; gallery handles Supabase Storage src for strategic products
app/components/SidebarNav.tsx                         ← already correct; isActive regex covers both edit routes
docs/plans/now-vs-strategic.md                        ← mark §9 item 4 done
```

**Reused.** `lib/qbo/items.ts:updateQboItem` (call only — frozen file). `lib/strategic/products/photos.ts` for new uploads.

**Open decisions.**
- Should the product detail page (`/products/[id]`) merge strategic-photo URLs from `product_images.src` (column already exists, populated by Phase 1 photo upload) when `shopify_product_id IS NULL`? **Yes** — read straight from DB, skip Shopify image fetch in the existing branch.
- What happens if a staff member tries to open `/products/[id]/edit` (bridge) on a strategic product? **Redirect to `/products/[id]/edit-strategic`** if `shopify_product_id IS NULL`. Belt-and-braces routing.

**Definition of done.**
- Create a strategic product → click Edit on the products list → lands on edit-strategic page → change title and price → save → Supabase row updated, QBO Item updated (verified in QBO admin), no Shopify call attempted (verify in network log).
- Add a new photo via the edit page → file lands in `product-images` Supabase Storage bucket, `product_images` row inserted, gallery refreshes.
- Delete a photo → file removed from Storage, `product_images` row deleted, gallery refreshes.
- Reorder photos → `position` updates persist.
- Open a bridge-created product (with `shopify_product_id`) → Edit link still routes to bridge `/products/[id]/edit` (untouched).

---

### 12.2 Inventory + sales sync — Phase 0 (shadow read)

**Bucket:** Strategic. **Depends on:** nothing.

**Authoritative spec lives at PRD §3.11.** Read that first; this is the implementation summary for Phase 0 only.

**Scope.** Add `products.qbo_qty_on_hand` (nullable int). New cron `app/api/cron/qbo-inventory-pull` runs every 10 min, pulls `Item.QtyOnHand` from QBO for every product with `qbo_item_id`, writes to the shadow column. **No reads consume it yet** — the storefront still reads `stock_quantity`. Purpose: surface drift between QBO and Supabase before Phase 1 cuts the storefront over.

**Files.**

```
supabase/migrations/<date>_qbo_qty_on_hand.sql        ← ALTER TABLE products ADD COLUMN qbo_qty_on_hand integer;
lib/qbo/inventory.ts                                  ← new (paginated Item query, returns id → qty map)
app/api/cron/qbo-inventory-pull/route.ts              ← new (every 10 min)
vercel.json                                           ← add cron entry
app/settings/SettingsTabs.tsx                         ← optional: surface latest pull timestamp + drift count
```

**Phasing.** This issue covers Phase 0 only. Phases 1–3 are item §8 / §12 in §9 above and PRD §3.11.

**Definition of done.**
- Cron runs every 10 min for ≥1 week.
- `qbo_qty_on_hand` populated for ≥99% of products with `qbo_item_id`.
- Drift query (`SELECT COUNT(*) FROM products WHERE qbo_qty_on_hand IS DISTINCT FROM stock_quantity`) shows <1% of catalogue. If higher, root-cause before promoting to Phase 1.

---

### 12.3 Image hosting migration

**Bucket:** Strategic / Cutover. **Depends on:** decision on Vercel Blob vs Supabase Storage (recommend Supabase Storage — same bucket as Phase 1 ingestion uses; no extra cost; Vercel Blob is gated on Pro plan).

**Scope.** Today every PDP image URL points at Shopify CDN. After cutover, those URLs stop working. We need a one-shot migration that:
1. Lists every `product_images` row with a Shopify CDN URL (or fetches the current image set from Shopify per product).
2. Downloads each image.
3. Uploads to Supabase Storage `product-images` bucket using the same path convention as Phase 1 (`<sku>/<position>-<filename>`).
4. Updates `product_images.src` to the new public URL.
5. Logs every step to `sync_log` for resumability.

**Files.**

```
scripts/migrate-images-to-storage.mjs                 ← new (Node script, dry-run by default, --apply to write)
lib/strategic/images/migrate.ts                       ← new (per-product migration helper, callable from script and from a future on-demand admin button)
docs/plans/image-migration-runbook.md                 ← new (operator runbook: how to run, how to recover)
```

**Phasing.**
- **Run 1 — dry-run.** Counts only; no downloads. Reports total images to migrate + estimated bandwidth + estimated bucket size. Owner reviews.
- **Run 2 — small batch (`--apply --limit 50`).** Migrates 50 products. Spot-check 10 PDPs on staging — confirm new URLs work and original Shopify URLs are not the source of truth anymore.
- **Run 3 — full (`--apply`).** Resumable — skips products whose `product_images.src` already starts with the Supabase Storage public URL prefix.
- **Run 4 — verify.** A SELECT that asserts every active product has ≥1 `product_images` row with a Supabase Storage URL.

**Open decisions.**
- **Storage bucket size estimate.** ~2,700 products × avg 4 images × ~300 KB = ~3.2 GB. Supabase free tier is 1 GB, paid plan covers 100 GB. Confirm Supabase plan before Run 3.
- **Image format.** Re-encode to WebP for size, or pass-through as-is? **Pass-through** for simplicity — re-encoding adds risk without clear benefit. nce-site can convert at render time if needed.
- **Original alt-text and order.** Preserve exactly. The migration is structure-preserving.

**Definition of done.**
- Every active product has `product_images.src` URLs pointing at `daesvkeogxuqlrskuwpg.supabase.co/storage/v1/object/public/product-images/...`.
- Spot-check on 50 random PDPs across the storefront: every image loads, no broken-image icons.
- Migration is rerunnable safely (idempotent).

---

### 12.4 Metafields / specs editor

**Bucket:** Strategic.

**Scope.** Today `metafield_definitions` (per CLAUDE.md) holds ~40+ structured spec field definitions, and `product_metafields` holds per-product values. Some fields (the common ones) are surfaced in the ingestion form. The long tail has no admin UI — staff can't add or edit them post-cutover. This builds:
1. A definitions admin (Settings → Specs Fields tab) — already exists per CLAUDE.md. Verify it covers full CRUD on `metafield_definitions`. If not, complete it.
2. A per-product metafields editor — already on the product edit page (per `app/products/[id]/edit/MetafieldsEditor.tsx`). Mirror to the strategic edit page (item 12.1). Verify it handles all `field_type` values defined in the schema.

**Files.**

```
app/settings/SettingsTabs.tsx                         ← verify Specs Fields tab is complete; add CRUD if missing
app/settings/MetafieldDefinitionsEditor.tsx           ← may exist; verify or build
app/products/[id]/edit-strategic/MetafieldsEditorStrategic.tsx ← new or symlink to existing component
app/api/metafield-definitions/route.ts                ← may exist; verify CRUD
app/api/products/[id]/metafields/route.ts             ← may exist; verify
```

**Open decisions.**
- **Which `field_type` values are supported today?** Audit `metafield_definitions.field_type` distinct values. Common: text, number, boolean, select. Long-tail may include: rich text, date, multi-select, dimension, file. Build editors for each.
- **Validation.** `metafield_definitions.required` exists — enforce on save.
- **Reuse.** Don't fork the existing MetafieldsEditor for the strategic edit page — import it. It's not bridge code (no Shopify deps).

**Definition of done.**
- All 40+ `metafield_definitions` rows have a working editor input on the product edit page (strategic + bridge).
- New definition can be added via Settings → Specs Fields and immediately appears in the ingestion form + edit pages.
- Required fields block save when empty.
- Storefront re-render: edited specs appear on the PDP within the next ISR window.

---

### 12.5 Strategic finance

**Bucket:** Strategic. **Depends on:** Stripe-vs-Dojo decision (see `docs/plans/stripe-to-dojo-migration.md`); also depends on nce-site exposing payout-level data in Supabase (currently nce-site stores per-order Stripe payment intent IDs but not payout summaries).

**Scope.** A new finance page for Stripe (or Dojo) payouts that mirrors what the bridge `/finance` page does for Shopify payouts: list payouts, show the orders inside each, post the fee deduction as a QBO journal entry, mark the payout as reconciled. Shopify-side bridge `/finance` keeps running until cutover; this is the parallel.

**Files.**

```
supabase/migrations/<date>_strategic_payouts.sql      ← new tables: stripe_payouts, stripe_payout_transactions (mirror existing payouts/payout_transactions shape)
lib/strategic/finance/stripe-payouts.ts               ← new (paginated list + transaction expansion via Stripe API)
lib/strategic/finance/post-to-qbo.ts                  ← new (build a QBO journal entry for the payout fee total; idempotent on stripe_payout.journal_entry_id)
app/api/cron/strategic-finance-sync/route.ts          ← new (daily; pull recent Stripe payouts, populate Supabase, optionally post to QBO)
app/finance-strategic/page.tsx                        ← new (the actual UI — list payouts, status pills, manual sync button)
app/finance-strategic/[id]/page.tsx                   ← new (per-payout detail with the transaction list)
app/components/SidebarNav.tsx                         ← add "Finance" entry under Strategic group, alongside the bridge "Finance" under Current Solution
vercel.json                                           ← register cron
```

**Phasing.**
- **Phase A.** Stripe payouts pulled into Supabase, surfaced in UI, no QBO writes yet. Read-only review.
- **Phase B.** Add the QBO journal-entry post (gated by reusing `SHOPIFY_SYNC_ENABLED=false` as the post-cutover signal — we don't want both bridge and strategic posting QBO journals during the bridge window).

**Open decisions.**
- **If Dojo migration approved**, add a parallel `lib/strategic/finance/dojo-payouts.ts` and switch the cron based on `PAYMENTS_PROVIDER` env var (see Dojo plan doc). For now, build for Stripe.
- **QBO accounts.** The bridge sync uses `qbo_connections.shopify_fee_account_id` and `qbo_connections.bank_account_id`. Strategic should use `qbo_connections.stripe_receipt_account_id` (already added per PRD §3.4 QBO Sales Sync work) + a new `stripe_fee_account_id` column. Migration needed.
- **Currency / date.** Stripe payouts are in pence GBP, dated by `arrival_date`. Match bridge convention.

**Definition of done.**
- Stripe payouts from the last 30 days appear in `/finance-strategic`. Manual sync button works.
- For each payout, fee total matches Stripe dashboard.
- Phase B: posting a payout creates exactly one QBO journal entry; rerunning is a no-op (idempotent on `journal_entry_id`).

---

### 12.6 Content management (CMS)

**Bucket:** Strategic. **Largest scope of any blocker — split across multiple sessions.**

**Scope.** Today every banner, nav item, hero slide, blog post, page, and policy is either hard-coded or sits in Supabase tables that have no admin UI. Staff need a way to edit:
- **Top nav / mega menu structure** — categories, links, featured cards
- **Homepage above-fold** — hero carousel slides (image + headline + CTA + link), Featured Deals tiles, NCE Rewards banner
- **Homepage below-fold** — product rails (already config-driven via collection handles), category grid tiles (handle + image)
- **Blog** — `blog_articles` already has CRUD-able schema; just no admin UI
- **Pages** — `pages` table; same
- **Policies** — `policies` table; same

**Files (split per scope chunk).**

Chunk 1 — pages + policies + blog (smallest, highest value-per-line):
```
app/settings/cms/pages/page.tsx                       ← list + create
app/settings/cms/pages/[handle]/edit/page.tsx         ← rich-text editor (TipTap or similar; Lexical also fine)
app/settings/cms/policies/...                         ← parallel
app/settings/cms/blog/...                             ← parallel + cover image upload to Supabase Storage
app/api/cms/{pages,policies,blog}/route.ts            ← CRUD endpoints
```

Chunk 2 — homepage hero + Featured Deals tiles:
```
supabase/migrations/<date>_homepage_blocks.sql        ← new: homepage_blocks table (kind=hero_slide|featured_deal, position, image_url, headline, subheading, cta_text, cta_href, active)
app/settings/cms/homepage/page.tsx                    ← reorderable list per kind
app/api/cms/homepage-blocks/route.ts                  ← CRUD
nce-site: app/page.tsx + components — read homepage_blocks instead of hard-coded arrays
```

Chunk 3 — top nav / mega menu:
```
supabase/migrations/<date>_nav_structure.sql          ← new: nav_categories table (sort_order, label, href, parent_handle, featured_image_url)
app/settings/cms/nav/page.tsx                         ← drag-reorder tree editor
nce-site: components/shop/NavBar.tsx — read nav_categories instead of hard-coded
```

**Open decisions.**
- **Rich-text editor choice.** TipTap (React-friendly, headless, mature) recommended. Lexical is heavier. Plain-Markdown also viable for blog/policies if rich formatting isn't needed.
- **Image upload.** Reuse `product-images` bucket or a new `cms-images` bucket? **New `cms-images`** — different lifecycle (CMS images may be deleted/replaced often; product images shouldn't be).
- **Preview.** Editor needs a preview-on-storefront button. Stretch goal — ship without first, add later.
- **Sequence within the chunk.** Chunk 1 first (smallest, unblocks copy edits day one). Chunk 2 next. Chunk 3 last (most disruptive — touches nce-site nav).

**Definition of done (per chunk).**
- Staff can create / edit / delete the relevant content type from the dashboard.
- Storefront re-renders within ISR window (or on next deploy if SSG).
- No hard-coded copy remains in code for that content type.

---

### 12.7 Draft orders / quotes

**Bucket:** Strategic.

**Scope.** Used by reps for negotiated B2B sales. The flow:
1. Rep builds a draft order in the dashboard — pick customer (or create new), add line items (search products), set custom prices/discounts, add notes.
2. Rep generates a **payment link** for the customer (Stripe Checkout Session in invoice mode, or hosted invoice — decide).
3. Customer clicks the link, pays via Stripe, the existing webhook converts the draft to a real order.
4. Rep can also mark the draft as "won — paid offline" or "lost".

**Files.**

```
supabase/migrations/<date>_draft_orders.sql           ← new: draft_orders + draft_order_items tables (status: open|sent|paid|cancelled, payment_link_url, customer_id nullable, custom_price_cents per item)
app/quotes/page.tsx                                   ← list of draft orders
app/quotes/new/page.tsx                               ← builder (customer typeahead, product line item picker, custom pricing, notes)
app/quotes/[id]/page.tsx                              ← edit + send + status transitions
app/api/quotes/route.ts                               ← CRUD
app/api/quotes/[id]/payment-link/route.ts             ← creates Stripe Checkout Session in invoice/payment-link mode, persists URL
nce-site: app/api/webhooks/stripe/route.ts            ← extend to recognise draft_order_id metadata and convert draft → order
app/components/SidebarNav.tsx                         ← add "Quotes" entry to Strategic group
```

**Open decisions.**
- **Stripe payment-link mode.** Stripe supports two patterns: a [Payment Link](https://stripe.com/docs/payment-links) (URL-only, no customer attached) or a [Checkout Session in `mode: 'payment'`](https://stripe.com/docs/api/checkout/sessions/create) (URL + customer attached). **Use Checkout Session** — it can carry our `draft_order_id` in metadata and pre-fill the customer.
- **Email delivery.** Send the link via existing Resend transactional email (mirror the order-confirmation pattern), or expect rep to copy-paste into their own email? **Send via Resend** — looks professional, tracks open/click via Resend dashboard.
- **Tax/VAT on draft.** Custom prices are entered ex-VAT (rep negotiates ex-VAT). Inc-VAT shown alongside. Same logic as PDP.
- **Inventory reservation.** Don't reserve stock when a draft is created — too much complexity. Stock check at conversion time. If a line item is OOS at conversion, mark the draft as `failed_inventory` and notify rep. Document this clearly so reps know.

**Definition of done.**
- Rep creates a draft → adds 3 line items with custom prices → sends.
- Customer receives email → clicks link → lands on Stripe Checkout pre-filled → pays.
- Stripe webhook fires → draft is converted to real order in `orders` table → confirmation email goes out via existing flow.
- Draft can be cancelled before payment.
- Draft list page shows status filters (open / sent / paid / cancelled).

---

## 13. Cutover runbook (high level)

When all §9 cutover-blocker items are checked off:

1. **Pre-flight (24h before).** Final QA pass on the strategic ingestion + edit + finance + inventory sync end-to-end on production with a clearly-named test product. Owner sign-off.
2. **DNS-day actions (in this exact order):**
   1. Disable QuickBooks Online Global app's "Sync inventory" toggle in Shopify (already in PRD §8 urgent action — confirm done).
   2. Disable QBO Global's "create QBO item from Shopify" toggle (PRD §8 — confirm done).
   3. Run inventory backfill script (PRD §3.11 Phase 3) — copies QBO `QtyOnHand` → `products.stock_quantity` for every active product.
   4. Set Vercel env: `SHOPIFY_SYNC_ENABLED=false` (both projects).
   5. Update sidebar default route — change `+ New product` (Current Solution group) to point at `/products/new-strategic` and remove or hide the Current Solution group. (Or keep both visible for the soak window — owner call.)
   6. Flip DNS from Shopify to Vercel for `nationwidecatering.co.uk`.
   7. Put Shopify into maintenance/password mode.
3. **Soak (3 months).** Monitor `sync_log` for errors, watch Stripe payouts reconcile, verify QBO inventory stays in sync. If anything breaks, flipping `SHOPIFY_SYNC_ENABLED` back to `true` is the rollback (DNS rollback is independent and slower).
4. **Decommission (post-soak).** Delete bridge folders (listed in §2.2), drop `SHOPIFY_SYNC_ENABLED` env var, remove `lib/shopify/`, archive old migrations.