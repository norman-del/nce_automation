# Shopify-QBO Fee Sync

## What This Is
Standalone tool that automates Shopify payout fee reconciliation with QuickBooks Online.
Pulls Shopify payouts → creates QBO journal entries for fees → matches invoices → applies payments.

## Tech Stack
Next.js 15 (App Router), Supabase, Tailwind, @shopify/shopify-api, node-quickbooks, intuit-oauth

## Hard Rules
- NEVER store tokens in plaintext — always encrypt with AES-256-GCM
- NEVER create duplicate journal entries — always check payout.journal_entry_id first
- NEVER create duplicate payments — always check payout_transaction.qbo_payment_id first
- ALL QBO API calls must check token expiry and refresh if needed
- TypeScript strict mode. No `any`.

## Key Patterns
- Shopify auth: Custom App access token (stored in env), not OAuth
- QBO auth: OAuth 2.0 (access token 1hr, refresh token 100 days)
- Sync is idempotent: re-running for the same payout is safe
- Errors are isolated: one failed payment doesn't block the rest

## Commands
```
npm run dev        # Dev server (port 3000)
npm run build      # Verify build
npm run lint       # ESLint
```

## Database
Supabase Postgres. Migrations in supabase/migrations/.
Tables: shopify_connections, qbo_connections, payouts, payout_transactions, sync_log

## Folder Guide
```
lib/shopify/    — Shopify API client + data fetchers
lib/qbo/        — QBO OAuth, journal entries, invoice queries, payments
lib/sync/       — Orchestrator that ties Shopify → QBO
app/api/        — API routes (shopify sync, qbo auth, qbo journal, qbo payment, cron)
app/payouts/    — Payout list + detail pages
app/settings/   — Connection management + account mapping
app/sync-log/   — Sync history + error log
```
