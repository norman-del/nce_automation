# Handoff — Shopify-QBO Fee Sync

## Current State (2026-03-27)

### What's built and working
- Next.js app at `http://localhost:3000`
- Project root: `C:\Users\norma\nce_automation\` (moved from subfolder today)
- Supabase database, all tables, all env vars set
- Shopify sync — pulls payout summaries (Sync Payouts button on /payouts)
- QBO OAuth connected, tokens auto-refresh, disconnect button on /settings
- Account mappings: `shopify_fees_account_id = 133`, `bank_account_id = 1150040008`
- Invoice matching — 3-strategy auto-discovery (PONumber → date+amount → CustomerMemo)
- Payment creation — gross amount deposited to Shopify Receipt Account (id 1150040008)
- Journal entry creation — Debit Shopify Charges, Credit Shopify Receipt Account
- Full sync button on payout detail page with result summary UI
- Search by order number on /payouts page
- Build passes clean, pushed to GitHub

### How the accounting works
For each payout:
1. **Payment** (one per order): gross amount applied to QBO invoice → deposited to Shopify Receipt Account
2. **Journal entry** (one per payout): Debit Shopify Charges (fee) / Credit Shopify Receipt Account (fee)

Net result: invoice cleared in full, fee expensed, Shopify Receipt Account balance = net bank deposit.

### Daily workflow
1. `npm run dev` from `C:\Users\norma\nce_automation\`
2. Go to http://localhost:3000/payouts
3. Click Sync Payouts (pulls any new payouts from Shopify)
4. Click View on latest payout → Run Full Sync
5. Done — journal + payments created, already-done items skipped safely

---

## Next Task: UI Polish

See full plan below. Start a fresh session and hand it this file.

**Prompt for next session:**
> "Read docs/HANDOFF.md. Execute the UI Polish Plan phases A–D in order. Dark mode Dynatrace-style as default. Use recharts for charts. Be thorough — every page should feel consistent and polished."

---

## UI Polish Plan

### Phase A — Design System Foundation
- Install `recharts`
- `tailwind.config.ts`: add `darkMode: 'class'`, define colour tokens
- `app/globals.css`: dark background `#0d1117`, surface `#161b22`, border `#30363d`
- `app/layout.tsx`:
  - Force dark mode class on `<html>`
  - Restyle sidebar: dark bg, accent colours for active nav item
  - Remove the two quicklink buttons from dashboard (View Payouts / Settings) — redundant with sidebar nav

### Phase B — Dashboard Rebuild (`app/page.tsx`)
Pull these metrics from Supabase:
1. **Payouts this month** — count from `payouts` where `payout_date >= first of month`
2. **Fees recorded this month** — sum of `total_fees` where synced this month
3. **Payments applied this month** — sum of `amount` from `payout_transactions` where `payment_status = payment_created` this month
4. **Needs attention** — count of payouts where `sync_status = pending or error`

Charts:
- **Bar chart** (recharts): fees recorded per payout, last 30 days — spot unusually high fee days
- **Recent payouts table**: last 5 payouts, date / gross / fee / status badge / View link

Design: Dynatrace-style dark cards, glowing accent numbers, subtle grid lines on charts.

### Phase C — Button & Response Polish
Every action should return a styled result, never raw JSON:
- **Sync Payouts** (`/payouts` page): currently returns raw API response — replace with banner: "X payouts pulled, Y new" or "Already up to date"
- **Connect QBO** (`/settings`): after OAuth redirect, show green "Connected successfully" confirmation
- **Disconnect QBO**: currently silent refresh — show inline "Disconnected" confirmation before reload
- **View QBO accounts list**: currently opens raw JSON in new tab — replace with a modal/drawer showing a searchable accounts table
- **Run Full Sync**: already polished ✓

### Phase D — Page Polish
- `/payouts`: status badge colours (synced=green, pending=amber, error=red), currency formatting consistent
- `/payouts/[id]`: cleaner order table, journal status pill, better empty states
- `/settings`: token expiry shown as "expires in X days" not raw datetime, connection health at a glance
- `/sync-log`: currently scaffold only — build it out with filterable history table from `sync_log` table

---

## Known Gotchas

- **Stale journal_entry_id**: if a journal is deleted from QBO manually, DB won't know. Fix: `UPDATE payouts SET journal_entry_id = null, journal_synced_at = null WHERE payout_date = 'YYYY-MM-DD'` in Supabase SQL editor. Don't delete journals from QBO in production.
- **QBO refresh token rotation**: never use the refresh token outside the app without saving the new one back to Supabase. See CLAUDE.md ngrok section.
- **Account mappings**: stored in `qbo_connections` table. If QBO is disconnected and reconnected, mappings persist — tokens update but account IDs stay.
- **Shopify order name**: includes `#` prefix (e.g. `#NCE1580`) — stripped before storing as `NCE1580`
- **Payment amount**: always use gross (`txn.amount`), not net. Journal handles the fee split.
- **Intuit Production keys**: development keys connect to sandbox only. Production keys are set in `.env.local`.

---

## Env Vars (all set in `C:\Users\norma\nce_automation\.env.local`)
| Var | Status |
|-----|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ |
| `SHOPIFY_STORE_DOMAIN` | ✅ ncequipment.myshopify.com |
| `SHOPIFY_ACCESS_TOKEN` | ✅ |
| `QBO_CLIENT_ID` | ✅ Production |
| `QBO_CLIENT_SECRET` | ✅ Production |
| `QBO_REDIRECT_URI` | ✅ https://tameka-beholden-alexia.ngrok-free.app/api/qbo/auth |
| `QBO_ENVIRONMENT` | ✅ production |
| `TOKEN_ENCRYPTION_KEY` | ✅ |
| `CRON_SECRET` | ✅ |
