# Project Handoff — Shopify-QBO Fee Sync

> Give this file to Claude Code at the start of a new session to resume work instantly.

---

## What This Project Is

Automates Shopify payout fee reconciliation with QuickBooks Online for a UK e-commerce business (Gus).
- Pulls Shopify payouts via API
- Creates QBO journal entries for Shopify fees (debit Shopify Fees, credit Bank)
- Finds matching QBO invoices by order number (DocNumber)
- Applies payments (net amount) to each invoice

Saves ~30 min/day of manual bookkeeping.

---

## Environment

- **Machine:** Windows 11, `C:\Users\norma\nce_automation\shopify-qbo-sync\`
- **GitHub:** https://github.com/norman-del/nce_automation (branch: `main`)
- **Supabase:** https://daesvkeogxuqlrskuwpg.supabase.co (project ref: `daesvkeogxuqlrskuwpg`)
- **Supabase CLI:** was downloaded to `C:\Users\norma\nce_automation\supabase.exe` — re-download if needed from https://github.com/supabase/cli/releases
- **Node.js:** v24 installed, npm works
- **Git:** installed

---

## Current Status (as of 2026-03-27)

### Completed — Phase 1: Foundation
- [x] Next.js 15 app scaffolded (App Router, TypeScript strict, Tailwind)
- [x] All deps installed: `@shopify/shopify-api`, `node-quickbooks`, `intuit-oauth`, `@supabase/supabase-js`
- [x] Full project structure created (lib/, app/api/, components/, supabase/migrations/)
- [x] CLAUDE.md written with project rules
- [x] `lib/crypto.ts` — AES-256-GCM encrypt/decrypt for token storage
- [x] `lib/shopify/client.ts` — REST client with access token auth
- [x] `lib/shopify/payouts.ts` — fetch payouts + balance transactions
- [x] `lib/shopify/orders.ts` — fetch order details (customer/company name)
- [x] `lib/qbo/auth.ts` — OAuth 2.0 authorize URL + token exchange + refresh
- [x] `lib/qbo/client.ts` — QBO client with auto-refresh (checks expiry, refreshes, saves new tokens)
- [x] `lib/qbo/journal.ts` — create journal entries (debit per order, single credit)
- [x] `lib/qbo/invoices.ts` — find invoice by DocNumber
- [x] `lib/qbo/payments.ts` — create payment with LinkedTxn to invoice
- [x] `lib/sync/orchestrator.ts` — full idempotent pipeline: fetch → journal → match → pay
- [x] `app/api/shopify/sync/route.ts` — pull payouts from Shopify, upsert to DB
- [x] `app/api/qbo/auth/route.ts` — OAuth callback, store encrypted tokens
- [x] `app/api/qbo/journal/route.ts` — create journal entry for a payout
- [x] `app/api/qbo/payment/route.ts` — create payment for a transaction
- [x] `app/api/cron/sync/route.ts` — daily cron (secured with CRON_SECRET)
- [x] `app/page.tsx` — Dashboard with KPI cards
- [x] `app/payouts/page.tsx` — Payout list table
- [x] `app/payouts/[id]/page.tsx` — Payout detail with transactions table
- [x] `app/settings/page.tsx` — Connection status + QBO connect button
- [x] `app/sync-log/page.tsx` — Audit log table
- [x] `supabase/migrations/001_initial_schema.sql` — all 5 tables + indexes
- [x] `vercel.json` — daily cron at 7am UTC
- [x] TypeScript type declarations for `intuit-oauth` and `node-quickbooks` (in `types/`)
- [x] Build passes clean (`npm run build`)
- [x] Git repo initialised, initial commit, pushed to GitHub
- [x] Supabase project linked, migration pushed — all 5 tables live

### .env.local Status
File exists at `shopify-qbo-sync/.env.local`. Already filled in:
- `NEXT_PUBLIC_SUPABASE_URL` ✓
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` ✓
- `SUPABASE_SERVICE_ROLE_KEY` ✓
- `TOKEN_ENCRYPTION_KEY` ✓ (generated, do not change)
- `CRON_SECRET` ✓ (generated)

Still needed:
- `SHOPIFY_STORE_DOMAIN` — e.g. `my-store.myshopify.com`
- `SHOPIFY_ACCESS_TOKEN` — from Shopify Admin → Settings → Apps → Custom app
- `QBO_CLIENT_ID` / `QBO_CLIENT_SECRET` — from developer.intuit.com (Phase 3)

---

## Next Steps — Phase 2: Shopify Integration

1. User creates Shopify Custom App:
   - Shopify Admin → Settings → Apps and sales channels → Develop apps → Create app
   - Admin API scopes: `read_shopify_payments_payouts`, `read_orders`
   - Install app → copy `shpat_...` token
   - Fill in `.env.local`: `SHOPIFY_STORE_DOMAIN` and `SHOPIFY_ACCESS_TOKEN`

2. Test Shopify sync:
   - `npm run dev`
   - POST to `http://localhost:3000/api/shopify/sync` (with date range)
   - Check `/payouts` page shows data

3. Verify payout detail page shows order breakdown (may need to test with real payout IDs)

---

## Phase 3: QBO OAuth + Journal Entries

1. Go to https://developer.intuit.com → create app → QuickBooks Online and Payments
2. Copy Client ID + Client Secret → fill in `.env.local`
3. Add redirect URI: `http://localhost:3000/api/qbo/auth`
4. Click "Connect QuickBooks" on `/settings` page
5. Test journal entry creation on a payout

---

## Key Architecture Decisions

- **Shopify:** Custom App (not OAuth) — single store, access token is permanent
- **QBO:** OAuth 2.0 — access token expires in 1hr, refresh token in 100 days
- **Idempotency:** Always checks `journal_entry_id` / `qbo_payment_id` before creating
- **Error isolation:** One failed payment doesn't block others
- **Token storage:** AES-256-GCM encrypted in Supabase, key in env var
- **Currency:** GBP, amounts stored as NUMERIC(12,2), never integers

---

## Database Tables

All in Supabase Postgres (project: `daesvkeogxuqlrskuwpg`):

| Table | Purpose |
|-------|---------|
| `shopify_connections` | Shopify store + encrypted access token |
| `qbo_connections` | QBO company + encrypted OAuth tokens + account mappings |
| `payouts` | Shopify payouts (one row per payout period) |
| `payout_transactions` | Individual orders within a payout |
| `sync_log` | Audit trail of all sync actions |

---

## Known Gotchas

- `QBO_REDIRECT_URI` in `.env.local` must exactly match what's registered in developer.intuit.com
- QBO sandbox and production use different base URLs — controlled by `QBO_ENVIRONMENT`
- Shopify order number in QBO appears as `DocNumber` (e.g. `NCE1573`, not `#NCE1573`)
- Journal entries require balanced debits/credits — credit line = sum of all debit lines
- `node-quickbooks` and `intuit-oauth` have no TypeScript types — custom `.d.ts` files in `types/`
