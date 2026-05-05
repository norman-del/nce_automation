# NCE Automation

## What This Is
Internal operations dashboard for Nationwide Catering Equipment.
See parent `../CLAUDE.md` for shared context, table ownership, and the migration master plan.

Current pipelines:
1. **Payout Fee Sync** — Shopify payout fee reconciliation with QuickBooks Online
2. **Product Ingestion** — Single-form entry that pushes to Supabase, Shopify (draft), and QBO simultaneously

## Scope: Current Solution (Bridge) vs Strategic (Post-Shopify)

**Authoritative plan: `docs/plans/now-vs-strategic.md`. Read §2 before editing any product, inventory, order, or sync code.** Don't duplicate the rules here — they live in the plan.

### Quick summary

- **Current solution (Bridge)** — only two features today: product ingestion (`app/products/new` + `app/products/[id]/edit`) and Shopify payout sync (`app/finance`). Retired at Shopify cutover.
- **Strategic** — everything else: orders, customers, collections CRUD, metafields editor, supplier feed ingestion, QBO sales sync, eBay (planned), shipping labels (planned), etc.

### Bridge folders — frozen during Strategic work

Don't edit these as part of Strategic work. Bridge bug-fixes live in their own commits.

```
app/products/new/                  ← bridge ingestion form
app/products/[id]/edit/            ← bridge edit form
app/finance/                       ← bridge payout reconciliation
app/api/cron/sync/                 ← bridge payout cron
lib/shopify/                       ← bridge Shopify client
lib/sync/payouts.ts                ← bridge payout sync
lib/qbo/items.ts                   ← bridge QBO item create/update
```

### Strategic shared-domain features → parallel files

Features that exist in both worlds (currently: product ingestion + edit) get **parallel implementations** so both flows can run simultaneously during the bridge:

```
app/products/new-strategic/        ← (when built) Supabase + QBO only, photos to Vercel Blob
app/products/[id]/edit-strategic/  ← parallel edit
lib/strategic/products/            ← strategic-only server logic
```

Net-new Strategic features (collections, metafields, supplier feeds, QBO sales sync, eBay, etc.) have no bridge equivalent — single implementation, no parallel.

### Visual segregation (shipped 2026-05-02)

- Sidebar groups: **Current solution** (amber outline, top) + **Strategic** (green outline, below).
- Bridge pages render `<ScopeBanner mode="bridge" />` at the top — `app/components/ScopeBanner.tsx`.
- Bridge action buttons on Strategic pages get an amber ring (`ring-1 ring-amber-500/60`).

### Standing rules (carry over from `docs/lessons-learned.md`)

- Strategic builds are read-only against prod Shopify and QBO until cutover. No Shopify mutations, no QBO Bill/Invoice/Sales Receipt/Item writes from Strategic code.
- Every Shopify variant write **must** set `inventory_management: 'shopify'` AND `inventory_policy: 'deny'` explicitly.
- Remediation scripts default to dry-run; `--apply` required to write.
- No role-based hiding for Now-vs-Strategic — Norman and Rich (both admin) must QA both worlds.
- Every PR/commit states its bucket. Never mix Bridge and Strategic in one commit.

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

## Self-testing — use Playwright before asking the user
If a change is testable in a browser (UI, OAuth flow, settings page, button click, form submit), drive it yourself with the playwright-cli skill before asking the user to test. Use Monitor on `vercel logs` in parallel to see exactly what happens server-side. Only ask the user to test things that genuinely require their account (e.g. third-party admin pages we can't auth into) or carry real-money / real-customer risk. Don't make the user click buttons you could click yourself.

## Hard Rules
- **No production-affecting strategic migration runs until nce-site is proven working AND owners (Norman + Rich) have given explicit green light.** "Production-affecting" means anything that mutates shared Supabase data the live storefront reads (e.g. rewriting `product_images.src`, backfilling `stock_quantity`, posting to QBO), changes prod env vars, or flips `SHOPIFY_SYNC_ENABLED`. Dry-runs and shadow reads are fine. Building scripts is fine. Pressing `--apply` on those scripts is **not** fine without sign-off — it doesn't matter how small the batch. If in doubt, ask. Applies to image migration (§12.3), inventory Phases 1–3 (§12.2), strategic finance posting (§12.5), and anything else under `now-vs-strategic.md` §12.
- NEVER store tokens in plaintext — always encrypt with AES-256-GCM
- NEVER create duplicate journal entries — always check payout.journal_entry_id first
- NEVER create duplicate payments — always check payout_transaction.qbo_payment_id first
- NEVER create duplicate QBO items — always check products.qbo_item_id first
- ALL QBO API calls must check token expiry and refresh if needed
- TypeScript strict mode. No `any` (except `node-quickbooks` client which has incomplete types — use `QboAny` cast pattern from `lib/qbo/items.ts`).
- **Inventory sync Phase 2 (sale → QBO Sales Receipt) MUST be gated on `SHOPIFY_SYNC_ENABLED=false`.** The bridge payout sync books sales income via journal entries; Phase 2 booking Sales Receipts at the same time double-counts. Both the decrement endpoint and the Sales Receipt writer stay dormant until cutover. Full rules: `docs/plans/now-vs-strategic.md` §12.2 + §13.
- **Inventory sync Phase 1 (cron → `stock_quantity`) requires owner sign-off before flipping on.** The 10-minute pull overwrites manual stock edits, so Norman/Rich must move stock management into QBO first (or we hide the in-app stock-adjust widget at the same time).

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
- **Customer-name match is the only strategy.** Two-step lookup: `findCustomers` by DisplayName → `findInvoices` by customer ID. Tries company name first, then personal name — Shopify sometimes has the company name only in the shipping address, not the customer record, so QBO may have the person's name instead. If the customer can't be resolved, the transaction is surfaced as `no_invoice` for manual handling.
- **Do not reintroduce a date+amount fallback.** It previously matched a Shopify £620 payment (NCE1610, Pear Tree) against an unrelated in-store invoice of the same amount belonging to a different customer ("The Rum Life"). Identity must anchor every match.
- PONumber and CustomerMemo searches always returned HTTP 400 from QBO via node-quickbooks — those fields are not queryable through the criteria API. Removed.
- `client.query()` does NOT exist in node-quickbooks. Use `findCustomers` / `findInvoices` with criteria instead.

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

`SHOPIFY_SYNC_ENABLED` is the single env-var toggle. `true` today (bridge writes to Shopify), `false` post-cutover (Shopify calls become no-ops, photos go to Vercel Blob, products managed in Supabase). Helper: `lib/shopify/config.ts`.

Full strategy, parallel-implementation rules, gaps to build, and feature inventory live in **`docs/plans/now-vs-strategic.md`**. Pre-cutover audit (44 product types, 13 vendors, 68 collections, metafield defs, shipping zones from live Shopify) is in `docs/handoffs/shopify-replacement-2026-04-10.md`.

## Next Steps
For active backlog and execution order see `docs/plans/now-vs-strategic.md` §9. The PRD (`../nce-site/docs/PRD.md` §3.4) tracks work-package status across both repos.
