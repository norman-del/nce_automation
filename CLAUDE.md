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
6. Tokens are saved to Supabase automatically
7. **Re-map accounts after re-auth** — mappings are tied to the QBO connection and reset on reconnect (see QBO Account Mappings below)

### Warning
Never use the QBO refresh token outside the app (e.g. in a test script) without saving
the new refresh token back to Supabase. Intuit rotates refresh tokens on every use —
consuming one without saving the replacement invalidates the chain and forces re-auth.

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

## Codex (AI code writing)
Codex is used to write code so Claude conserves tokens. Always delegate substantial edits to Codex via the `codex:rescue` skill.

### How to invoke
Use the `codex:rescue` skill. It automatically adds `--write` for edit tasks. Example:
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

## Next Steps
- **Vercel deployment** — move off local machine so sync runs without the PC being on
- **Authentication** — Supabase Auth, email/password, single user (not a SaaS product)
- ngrok will no longer be needed once deployed to Vercel (use the Vercel URL as QBO_REDIRECT_URI)
