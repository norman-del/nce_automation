# NCE Automation

## What This Is
Internal operations dashboard for Nationwide Catering Equipment.
See parent `../CLAUDE.md` for shared context, table ownership, and the migration master plan.

Current pipelines:
1. **Payout Fee Sync** — Shopify payout fee reconciliation with QuickBooks Online
2. **Product Ingestion** — Single-form entry that pushes to Supabase, Shopify (draft), and QBO simultaneously

## Scope: Now (Bridge) vs Strategic (Post-Shopify)

**Before editing any product, inventory, order, or sync code, decide which bucket the change belongs in. Don't mix them in one commit.**

Full plan, bug specs, and execution order: **`docs/plans/now-vs-strategic.md`**. Read it first.

### "Now" (Bridge) — keeps the current Shopify/QBO business running
Exists only because Shopify is still our storefront. Gated by `SHOPIFY_SYNC_ENABLED` where applicable. Decommissioned after DNS cutover + 3 months stability.
- Product ingestion form + Shopify draft push + QBO item create — `app/products/new`, `lib/shopify/products.ts`, `lib/qbo/items.ts`
- Product editing sync to Shopify + QBO — `updateShopifyProduct`, `updateQboItem`
- Photo upload → Shopify CDN → draft→active flip
- Shopify payout fee sync → QBO journal — `app/finance`, `lib/sync/payouts.ts`, `/api/cron/sync`

Known bugs (see plan doc §5): QBO VAT codes not applied, Shopify multi-channel publish broken, description paragraphs collapse. Fix these before owner QA.

### "Strategic" (Post-Shopify) — built Shopify-independent
- Collection CRUD, metafield editor, supplier feed ingestion, QBO sales sync (dry-run), image hosting migration
- eBay integration, cross-channel stock sync, drop-ship product support
- Shipping labels (APC + Pallettrack), draft orders, returns, B2B pricing, rewards, CMS, staff invite UI

### Rules
- UI ribbon on every page ("Bridge mode" amber / "Strategic" blue) — not yet built, tracked in plan doc §9 step 6.
- No role-based hiding (Norman and Rich must be able to QA Strategic features as they ship).
- No duplicate Now/Strategic versions of the same screen. Single switch at cutover is `SHOPIFY_SYNC_ENABLED`.
- Every Shopify variant write **must** set `inventory_management: 'shopify'` AND `inventory_policy: 'deny'` explicitly (see `docs/lessons-learned.md`).
- Remediation scripts default to dry-run; `--apply` required to write.

## Tech Stack
Next.js 16 (App Router), React 19, Supabase, Tailwind 4, node-quickbooks, intuit-oauth

## Deployment
- **Production**: https://nce-automation.vercel.app (auto-deploys from `main` branch)
- **Vercel project**: `prj_8zIpLhyV521wE3vzKAAmvTUnS0eV` / org `team_8W8KmJZHBpZtLVAOJAcWPNoC`

## CLIs — Always Use CLI Over MCP
Both Vercel and Supabase have CLIs installed. **Always use CLI commands via Bash, never MCP tools.** MCP has permission limitations and higher token overhead. CLIs work directly in the terminal with no friction.

### Vercel CLI (v50+)
- Installed globally via npm (`vercel`)
- Use for: env vars (`vercel env`), logs (`vercel logs`), deployments (`vercel deploy`), project info (`vercel ls`)
- Already authenticated and linked to the project

### Supabase CLI (v2.84+)
- Installed via Scoop — **must prefix commands with**: `export PATH="$HOME/scoop/shims:$PATH"`
- Use for: running SQL (`supabase db query --linked "SQL"`), migrations, project management
- Already authenticated and linked to project `daesvkeogxuqlrskuwpg`
- Example: `export PATH="$HOME/scoop/shims:$PATH" && supabase db query --linked "SELECT * FROM products LIMIT 5;"`

## Lessons Learned
Before touching production Shopify/QBO data or writing any remediation script, read `docs/lessons-learned.md`. It records past incidents and the standing rules we've adopted (dry-run defaults, owner-review gates, mandatory inventory field sets).

## Hard Rules
- NEVER store tokens in plaintext — always encrypt with AES-256-GCM
- NEVER create duplicate journal entries — always check payout.journal_entry_id first
- NEVER create duplicate payments — always check payout_transaction.qbo_payment_id first
- NEVER create duplicate QBO items — always check products.qbo_item_id first
- ALL QBO API calls must check token expiry and refresh if needed
- TypeScript strict mode. No `any` (except `node-quickbooks` client which has incomplete types — use `QboAny` cast pattern from `lib/qbo/items.ts`).

## Key Patterns
- Shopify auth: Custom App access token (stored in env), not OAuth
- QBO auth: OAuth 2.0 (access token 1hr, refresh token 100 days)
- Sync is idempotent: re-running for the same payout/product is safe
- Errors are isolated: one failed item doesn't block the rest
- Product ingestion: Supabase is source of truth → pushes to Shopify + QBO

## Commands
```
npm run dev        # Dev server (port 3000)
npm run build      # Verify build
npm run lint       # ESLint
```

## Database
Supabase Postgres. Migrations in supabase/migrations/.

### Tables
**Payout sync:**
- `shopify_connections` — single store connection
- `qbo_connections` — QBO OAuth tokens + account mappings
- `payouts` — synced Shopify payouts
- `payout_transactions` — individual orders within payouts
- `sync_log` — audit trail

**Product ingestion:**
- `suppliers` — supplier directory (name, contact, address, qbo_vendor_id)
- `products` — core product table (replaces the Google Sheet)
- `product_images` — photo tracking for Shopify uploads
- `product_sku_seq` — sequence for auto-generating SKU numbers (starts at NCE5200)

**Staff & auth:**
- `staff_users` — staff accounts with role (admin/staff), linked to Supabase Auth via auth_user_id

**Collections & metafields:**
- `collections` — collection catalog (title, handle, description, image_url, display_order for sidebar ordering). Managed via Settings → Collections.
- `metafield_definitions` — schema for structured product specs (key, label, field_type, unit, options, display_group, sort_order, required). Managed via Settings → Specs Fields (admin only).
- `product_metafields` — per-product values for the definitions above. Edited on the product edit page.

## Folder Guide
```
lib/shopify/       — Shopify API client, payouts, orders, products
lib/qbo/           — QBO OAuth, journal entries, invoices, payments, items
lib/sync/          — Orchestrator that ties Shopify → QBO (payouts)
lib/products/      — Shipping tier calculation
lib/auth/          — Staff user lookup, role checking
app/api/           — API routes
  api/products/    — Product CRUD, batch create, image upload
  api/suppliers/   — Supplier CRUD + typeahead search
  api/shopify/     — Shopify sync + OAuth auth flow
  api/qbo/         — QBO auth, journal, payment, accounts
  api/cron/        — Automated sync
  api/orders/      — Order status, shipping, refunds (admin-only)
  api/promotions/  — Stripe promo codes (admin-only write)
  api/shipping-rates/ — Shipping rate config (admin-only write)
app/orders/        — Order list + detail (all staff)
app/products/      — Product list, detail, ingestion form (all staff)
app/customers/     — Customer list + detail (all staff)
app/finance/       — Payout reconciliation (admin only, was /payouts)
app/settings/      — Tabbed: Connections, Promotions, Shipping, Activity Log (admin only)
app/login/         — Login page (public)
proxy.ts           — Auth middleware (redirects unauthenticated to /login)
```

## Navigation
Sidebar: Dashboard, Orders, Products, Customers, Finance (admin), Settings (admin)
Mobile tab bar: Orders, Products, Dashboard, Customers, Settings (admin)

## Staff Roles
- **admin** — full access: all pages, refunds, settings, finance
- **staff** — orders (view, fulfill, ship), products (add, edit, stock), customers (view)
- Role stored in `staff_users.role`, checked via `lib/auth/staff.ts`
- API routes for refunds, promotions (POST), shipping-rates (PATCH) require admin
- Finance and Settings pages redirect non-admin to dashboard

## Shopify Apps (two apps exist)
1. **QuickBooks Integration** (Dev Dashboard) — the third-party sync app. Has a setting "When a Product is created in Shopify, create a new item in QuickBooks Online" which should be **unticked** once our product ingestion goes live (to prevent duplicates).
2. **NCE Automation API** (Custom App) — our app. Managed via Shopify CLI (`shopify.app.toml` in project root).
   - Client ID: `5f1c7aa2f0559a3fc7ff2cac0e77b659`
   - Scopes: `read_orders, read_products, write_products, read_shopify_payments_payouts`
   - Versions managed via `npx shopify app deploy` + `npx shopify app release`

### Shopify OAuth gotchas
- Shopify's new Dev Dashboard uses internal store IDs (e.g. `80a273-f0.myshopify.com`) that DON'T work with the OAuth token exchange endpoint. Always use `ncequipment.myshopify.com` (the `SHOPIFY_STORE_DOMAIN` env var) for token exchange.
- The OAuth callback is at `/api/shopify/auth/callback`
- The auth initiation (redirects to Shopify authorize URL) is at `/api/shopify/auth`
- Access tokens are permanent (no expiry). Only change if app is reinstalled.

## Product Ingestion Pipeline

### How it works
1. User fills in structured form at `/products/new`
2. On save: Supabase record created with auto-generated SKU + auto-calculated shipping tier
3. Shopify draft product created (title, price, type, vendor, tags, collections, metafields)
4. QBO Item created with full fields (cost, selling price, VAT, purchase tax, preferred supplier)
5. Later: user uploads photos → pushed to Shopify → product auto-activates (draft → active)

### Shipping tier auto-calculation
- **Parcel (0)**: fits 120x55x50cm AND ≤30kg (or 60x60x60 cube AND ≤30kg)
- **Single Pallet (1)**: exceeds parcel but footprint ≤100x120cm
- **Double Pallet (2)**: exceeds 100x120cm footprint

### VAT logic
- `vat_applicable = true` → 20% standard rate (both sales and purchase tax in QBO)
- `vat_applicable = false` → Margin scheme (exempt/no VAT in QBO)
- This is independent of new/used condition

### Supplier management
- Suppliers stored in `suppliers` table with typeahead search
- When a product is created, if the supplier doesn't exist in QBO, a Vendor is created automatically
- QBO Vendor ID cached in `suppliers.qbo_vendor_id` for reuse

## QBO OAuth re-auth (production)
The OAuth flow runs entirely on production at https://nce-automation.vercel.app. `QBO_REDIRECT_URI` env var in Vercel points at `/api/qbo/auth` there. No ngrok, no local tunnel.

### Steps
1. Go to https://nce-automation.vercel.app/settings → **Connections** tab → **Disconnect QuickBooks** → **Connect QuickBooks**
2. Log in to Intuit and authorise
3. Tokens are saved to Supabase automatically on callback
4. Account mappings are set automatically by the OAuth callback (see QBO Account Mappings below) — no manual step

Refresh tokens last 100 days. Access tokens last ~1 hour and refresh silently on every API call. If the app has been idle for >100 days the refresh token itself expires and full re-auth (above) is required.

### Warning — never refresh tokens from a standalone script
Intuit rotates refresh tokens on every use. If a test/diagnostic script calls `oauth.refresh()` and doesn't save the new refresh token back to `qbo_connections`, the chain is invalidated and full re-auth is forced. All token refresh must go through `lib/qbo/client.ts` `getQboClient()`, which handles save-back.

## QBO Account Mappings
These are hardcoded into the OAuth callback (`app/api/qbo/auth/route.ts`) and set automatically on every connect/reconnect. No manual mapping needed.

| Field | Account Name | Account ID | Type |
|---|---|---|---|
| Shopify Fees account | Shopify Charges | 133 | Cost of Goods Sold |
| Bank / Receipt account | Shopify Receipt Account | 1150040008 | Bank |

## Invoice Matching — Known Behaviours
- **Strategies 1 (PONumber) and 3 (CustomerMemo)** always return HTTP 400 from QBO — these fields are not queryable via node-quickbooks criteria. They can be removed in future.
- **Strategy 2 (date+amount)** works when the QBO invoice date is within ±3 days of the payout date.
- **Strategy 4 (customer name)** is the main fallback. It uses a two-step lookup: `findCustomers` by DisplayName → `findInvoices` by customer ID. It tries company name first, then personal name — this is necessary because Shopify sometimes has the company name only in the shipping address, not the customer record, so QBO may have the person's name instead.
- `client.query()` does NOT exist in node-quickbooks. Use `findCustomers` / `findInvoices` with criteria instead.

## Codex (optional, use sparingly)
Codex (GPT-5.4) is available via the `codex:rescue` skill and can be useful for large,
self-contained code edits where its tokens are essentially free. It is **not** the default
— prefer writing code directly. Only reach for Codex when the edit is large enough that
the token savings clearly outweigh the overhead of delegating.

**Don't** auto-delegate routine edits, small fixes, refactors, or anything requiring
back-and-forth judgement. Most work should be done directly in this chat.

### Concurrency caveat
Codex runs through a single shared broker on this machine, so only one Claude chat can
use it at a time. Other chats on this machine may also be invoking it. If a `codex:rescue`
call stalls or returns stale/unrelated context, the broker is likely busy or carrying
state from another session — start a fresh `codex:rescue` invocation rather than
retrying, and if it keeps stalling, just do the edit directly.

### How to invoke (when appropriate)
```
/codex:rescue Fix the bug in lib/qbo/client.ts where ...
```

### Known fix — write permissions
The Codex plugin defaults to a read-only sandbox which blocks all file writes. This has been patched in two plugin files. **If the plugin auto-updates and writes break again, re-apply these changes:**

**File 1: `~/.claude/plugins/cache/openai-codex/codex/1.0.2/scripts/codex-companion.mjs`**
Line ~460 — change `"workspace-write"` to `"danger-full-access"`:
```js
// Before:
sandbox: request.write ? "workspace-write" : "read-only",
// After:
sandbox: request.write ? "danger-full-access" : "read-only",
```

**File 2: `~/.claude/plugins/cache/openai-codex/codex/1.0.2/scripts/lib/codex.mjs`**
Lines ~60 and ~74 — change the `approvalPolicy` default so write sandboxes use `"on-request"` instead of `"never"`:
```js
// Before:
approvalPolicy: options.approvalPolicy ?? "never",
// After:
approvalPolicy: options.approvalPolicy ?? (sandbox === "workspace-write" || sandbox === "danger-full-access" ? "on-request" : "never"),
```
(Apply to both `buildThreadParams` and `buildResumeParams`.)

The root cause: `approvalPolicy: "never"` means the app server declines all tool calls. `on-request` + `danger-full-access` sandbox matches what `codex exec --dangerously-bypass-approvals-and-sandbox` does internally.

## Claude Code — Windows quirks

### context7 MCP server fails to start (Windows)
The context7 plugin's `.mcp.json` ships with `command: "npx"`, which fails on Windows because Node's `child_process.spawn` doesn't auto-resolve `.cmd` files. Patched in two files — re-apply if plugin updates overwrite:

- `~/.claude/plugins/cache/claude-plugins-official/context7/unknown/.mcp.json`
- `~/.claude/plugins/marketplaces/claude-plugins-official/external_plugins/context7/.mcp.json`

```json
{
  "context7": {
    "command": "cmd",
    "args": ["/c", "npx", "-y", "@upstash/context7-mcp"]
  }
}
```

### `claude update` warns "C:\Users\norma\.local\bin is not in your PATH"
Even when `.local\bin` is in the User PATH registry, the warning fires because `~/.claude/settings.json` injects a curated `env.PATH` for every Claude subprocess that didn't include it. Fix is to keep `/c/Users/norma/.local/bin` at the front of `env.PATH` in `~/.claude/settings.json`. Don't rely on the trailing `$PATH` — it doesn't expand for non-shell child processes.

## Shopify Replacement Strategy

nce_automation must work with Shopify **today** (product sync to Shopify is live) and without Shopify **after migration**. This is controlled by a toggle.

### SHOPIFY_SYNC_ENABLED env var
- `true` (current default): product create/edit/activate push to Shopify, photos go to Shopify CDN, payout cron runs
- `false` (post-migration): Shopify calls are skipped, photos go to Vercel Blob or Supabase Storage, products managed entirely in Supabase

### What depends on Shopify today (must be toggle-aware)
1. `fetchProductMetadata()` in `lib/shopify/products.ts` — populates form dropdowns. **Should always read from Supabase** (product types, vendors from `products` table; collections from `collections` table).
2. `createShopifyProduct()` — pushes new product as draft. Skip when disabled.
3. `updateShopifyProduct()` — syncs edits. Skip when disabled.
4. `activateShopifyProduct()` — draft → active. When disabled, just set `products.status = 'active'` in Supabase.
5. `uploadImageToShopify()` — photos to Shopify CDN. When disabled, upload to Vercel Blob or Supabase Storage.
6. Payout cron (`/api/cron/sync`) — pulls from Shopify Payments. Disable when sync is off.

### What's already Shopify-independent (no work needed)
Orders, refunds, customers, inventory, shipping rates, promotions, email, search, auth, QBO item sync — all use Supabase/Stripe directly.

### Gaps to build before migration
1. **Shopify sync toggle** — `SHOPIFY_SYNC_ENABLED` env var + `lib/shopify/config.ts` helper
2. **Supabase-sourced metadata** — replace `fetchProductMetadata()` Shopify calls with Supabase queries
3. **Product description field** — `body_html` column exists (2,695 products have data), add textarea to create + edit forms
4. **Collection management UI** — CRUD page for the 68 collections already in Supabase
5. **Image hosting switch** — Vercel Blob or Supabase Storage when Shopify CDN is unavailable

See `docs/handoffs/shopify-replacement-2026-04-10.md` for full audit including all 44 product types, 13 vendors, 68 collections, metafield definitions, and shipping zone configs from the live Shopify store.

## Next Steps
- **Shopify replacement gaps** — build the 5 items listed above (see handoff doc for details)
- **Test product ingestion end-to-end** — form → Supabase → Shopify draft → QBO item → photo upload → active
- **Existing product migration** — strategy needed to import 5000+ existing products from spreadsheet into Supabase (not into Shopify/QBO — they already exist there)
- **QBO sync app deactivation** — untick "create new item in QBO" in the QuickBooks Online Global app once our pipeline is validated
- **Mobile frontend** — being rebuilt in a parallel session
