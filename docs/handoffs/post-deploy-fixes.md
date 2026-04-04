# Handoff: Post-Deploy Fixes & Testing

## Session completed (2026-04-04)

### What was done this session
1. **Supabase Auth** — user created (`norman@nationwidecatering.co.uk`), login/logout routes, `proxy.ts` route protection, `/login` page
2. **Vercel deploy** — all 11 env vars pushed via CLI, `QBO_REDIRECT_URI` updated to `https://nce-automation.vercel.app/api/qbo/auth`, `NEXT_PUBLIC_SITE_URL` added
3. **App is live** at `https://nce-automation.vercel.app`

---

## Known issues to fix next session (in order)

### Issue 1 — QBO "Refresh token: Unknown" + sync errors
**Root cause:** QBO OAuth was last done locally via ngrok. The tokens in Supabase are stale/expired. `refresh_token_expires_at` is NULL because the last auth predates that column being added.

**Sync log errors:** `"The Refresh token is invalid, please Authorize again"` on the 02/04 payout — direct result of stale token.

**Fix steps:**
1. Add `https://nce-automation.vercel.app/api/qbo/auth` to the Intuit developer portal redirect URIs:
   - Go to developer.intuit.com → your app → Keys & credentials → Redirect URIs
2. Go to `https://nce-automation.vercel.app/settings` → Disconnect QBO → Connect QuickBooks
3. Complete the OAuth flow — tokens will be saved to Supabase automatically
4. Verify the refresh token expiry now shows a real date (should be ~100 days out)

### Issue 2 — Shopify "Not connected" on settings page
**Root cause:** Settings page reads from the `shopify_connections` Supabase table. There is no row in that table — the Shopify connection was never saved to the DB (the app uses env vars for the actual API calls, but the UI reads from Supabase for display).

**Diagnosis needed:** Check `lib/shopify/` and `app/settings/` to understand how a Shopify connection is supposed to be "registered" in the DB. It may need a one-time seed or a "Connect Shopify" flow that writes to the table.

**Quick check:** Run this SQL in Supabase dashboard:
```sql
SELECT * FROM shopify_connections;
```
If empty, need to insert a row manually or via a setup route.

### Issue 3 — Re-sync the failed 02/04 payout
Once QBO is reconnected, the 02/04 payout (£511.00, status: Error) needs to be retried.
- Go to Payouts → View the 02/04 payout → click Sync
- Check sync log to confirm journal entry + payment both succeed

---

## Full end-to-end test checklist (do after fixes above)

- [ ] Login at `https://nce-automation.vercel.app/login` — redirects to dashboard
- [ ] Settings page shows Shopify connected + QBO connected with real expiry date
- [ ] Click "Sync Payouts" — pulls latest payouts from Shopify API
- [ ] Trigger sync on a payout — journal entry created in QBO
- [ ] Trigger sync on a payout — invoice matched + payment applied in QBO
- [ ] Check sync log — no errors
- [ ] Sign out — redirects to `/login`, can't access app without re-login
- [ ] QBO token refresh — confirm tokens auto-refresh without manual intervention (check after 1 hour)

---

## Paste this into the next chat

```
We're building a Shopify-QBO fee sync tool (Next.js 15, Supabase, Tailwind).
App is live at https://nce-automation.vercel.app. Supabase Auth is working.

Next steps (in order):
1. Fix QBO "refresh token unknown" — redo QBO OAuth on the live URL (Intuit portal redirect URI needs updating first)
2. Fix Shopify "not connected" on settings page — diagnose why shopify_connections table is empty and fix
3. Re-sync the failed 02/04 payout (£511.00)
4. Run the full end-to-end test checklist in docs/handoffs/post-deploy-fixes.md

Use codex:rescue for all code writing.
Full details in docs/handoffs/post-deploy-fixes.md
```
