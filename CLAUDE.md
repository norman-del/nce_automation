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

## ngrok (QBO OAuth only)
ngrok is only needed when re-doing the QBO OAuth flow (tokens last 100 days, so this is rare).
The redirect URI must be HTTPS — ngrok provides this tunnel for local dev.

### Current fixed domain
```
https://tameka-beholden-alexia.ngrok-free.dev → http://localhost:3000
```
This is a reserved free-tier domain (doesn't change on restart).

### Start ngrok
```bash
ngrok http 3000
```
Auth token (already configured on this machine):
```
ngrok config add-authtoken 3BWi7Po675XO8cq0oLXWqdaN3ro_3uxLpZeiPVRz7EW3nBcuP
```

### If the URL ever changes
1. Update `QBO_REDIRECT_URI` in `.env.local`
2. Go to https://developer.intuit.com → your app → Keys & credentials → Redirect URIs → update to the new URL
3. Re-do QBO OAuth via /settings → Disconnect → Connect QuickBooks

### QBO OAuth re-auth steps
1. Start dev server: `npm run dev`
2. Start ngrok: `ngrok http 3000`
3. Confirm ngrok URL matches `QBO_REDIRECT_URI` in `.env.local`
4. Go to http://localhost:3000/settings → Disconnect QBO → Connect QuickBooks
5. Log in to Intuit and authorise
6. Tokens are saved to Supabase automatically (account mappings persist — no need to re-map)

### Warning
Never use the QBO refresh token outside the app (e.g. in a test script) without saving
the new refresh token back to Supabase. Intuit rotates refresh tokens on every use —
consuming one without saving the replacement invalidates the chain and forces re-auth.
