# Handoff — Shopify-QBO Fee Sync

## Current State (2026-03-27)

### What's built and working
- Next.js app at `http://localhost:3000`
- Supabase database, all tables, all env vars set
- Shopify sync — pulls payout summaries (Sync Payouts button on /payouts)
- QBO OAuth connected, tokens auto-refresh
- Account mappings set: `shopify_fees_account_id = 133`, `bank_account_id = 1150040008`
- Invoice matching — 3-strategy auto-discovery (PONumber → date+amount → CustomerMemo)
- Payment creation — deposits to correct account (Shopify Receipt Account, id 1150040008)
- Full sync button on payout detail page with nice result summary UI
- Search by order number on /payouts page
- View QBO accounts list button on /settings page

### Test payout: NCE1580 (27 March 2026, £36.80 gross, £0.99 fee, £35.81 net)
- **Payment**: Created correctly — £36.80 applied to QBO invoice, deposited to Shopify Receipt Account ✓
- **Journal entry**: NOT in QBO — was deleted manually during testing. DB still has stale `journal_entry_id = '34284'` pointing to a deleted journal. This is why the sync keeps skipping journal creation.

---

## Immediate Fix Needed (do this first next session)

### Step 1 — Reset the stale journal reference in Supabase SQL editor:
```sql
UPDATE payouts
SET journal_entry_id = null,
    journal_synced_at = null
WHERE payout_date = '2026-03-27';
```

### Step 2 — Run Full Sync on the 27 March payout
- Go to /payouts → View on 2026-03-27 → Run Full Sync
- Payment already exists so will be skipped (shows "Already paid")
- Journal entry will be created fresh: Debit Shopify Charges £0.99, Credit Shopify Receipt Account £0.99
- Expected result: "Sync complete — Journal created £0.99 — NCE1580 Already paid"

---

## How the Accounting Should Work

For each payout:
1. **Journal entry** (one per payout, covers all orders):
   - Debit: Shopify Charges (id 133) — the fee amount per order
   - Credit: Shopify Receipt Account (id 1150040008) — total fees out of bank
2. **Payment** (one per order):
   - Applied to the customer's QBO invoice for the full gross amount
   - Deposited to: Shopify Receipt Account (id 1150040008)

Net effect: invoice cleared in full, fees expensed, bank balance correct.

---

## Known Issue to Watch

**Stale journal_entry_id in DB**: If a journal entry is deleted from QBO manually, the DB doesn't know. The sync sees `journal_entry_id` is not null and skips recreation. Fix is always the SQL reset above. In production, don't delete journals manually — just re-run the sync.

---

## Daily Workflow (once NCE1580 fix is done)

1. Go to /payouts
2. Click View on the latest payout
3. Click Run Full Sync
4. Done — journal entry + payments created for all orders in that payout

Re-running is safe — already-paid orders are skipped, existing journals are skipped.

---

## Bugs Fixed This Session
1. Invoice matching — was searching by DocNumber (QBO's own number). Replaced with 3-strategy matcher: PONumber → date+amount → CustomerMemo.
2. Payment amount — was using net (£35.81) leaving £0.99 still due. Fixed to use gross (£36.80).
3. Deposit account — payments were going to Undeposited Funds. Fixed by adding `DepositToAccountRef` pointing to Shopify Receipt Account.
4. Account mappings — were null in DB. Set: fees account = 133, bank = 1150040008.
5. Sync result UI — replaced raw JSON with result panel showing journal status + per-order results.

---

## Files Changed This Session
- `lib/qbo/invoices.ts` — replaced `findInvoiceByDocNumber` with smart `findInvoiceForOrder`
- `lib/qbo/payments.ts` — added `depositToAccountId` param + `DepositToAccountRef` in QBO call
- `lib/sync/orchestrator.ts` — richer return type, per-transaction results, passes deposit account
- `app/payouts/[id]/page.tsx` — uses SyncButton component
- `app/payouts/[id]/SyncButton.tsx` — new client component, shows sync result inline
- `app/payouts/page.tsx` — added order number search
- `app/settings/page.tsx` — added View QBO Accounts link
- `app/api/sync/[id]/route.ts` — new route, triggers orchestrator for a single payout
- `app/api/qbo/accounts/route.ts` — new route, returns chart of accounts (read-only)
- `app/api/qbo/invoice/[id]/route.ts` — diagnostic route

---

## Env Vars (all set in shopify-qbo-sync/.env.local)
| Var | Status |
|-----|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ |
| `SHOPIFY_STORE_DOMAIN` | ✅ ncequipment.myshopify.com |
| `SHOPIFY_ACCESS_TOKEN` | ✅ |
| `QBO_CLIENT_ID` | ✅ Production |
| `QBO_CLIENT_SECRET` | ✅ Production |
| `QBO_REDIRECT_URI` | ✅ ngrok URL (only needed if re-doing OAuth) |
| `QBO_ENVIRONMENT` | ✅ production |
| `TOKEN_ENCRYPTION_KEY` | ✅ |
| `CRON_SECRET` | ✅ |

## How to Start a Session
```bash
cd shopify-qbo-sync
npm run dev
```
Then open `http://localhost:3000`.
ngrok only needed if re-doing QBO OAuth (tokens last 100 days).

---

## Gotchas
- Intuit Production keys only — Development keys connect to sandbox only
- Intuit requires HTTPS redirect URI — use ngrok for local dev OAuth
- `intuit-oauth` token response does not include `realmId` — extract from URL query params
- Next.js `req.url` resolves to internal URL behind ngrok — always use `process.env.QBO_REDIRECT_URI`
- Shopify order name includes `#` prefix (e.g. `#NCE1580`) — stripped to `NCE1580` before storing
- QBO invoice numbers are QBO's own sequence (e.g. 6899), not Shopify order numbers
- Shopify-QBO connector stores order ref — strategy 2 (date+amount) matched NCE1580 successfully
