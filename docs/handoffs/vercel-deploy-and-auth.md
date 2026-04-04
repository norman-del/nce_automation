# Handoff: Vercel Deploy + Supabase Auth

## Session completed (2026-04-04)

### What was done this session

1. **Codex write-permission fix** — Codex was running in read-only sandbox mode and couldn't write files. Fixed in the plugin files (`codex-companion.mjs` + `lib/codex.mjs`). Documented in CLAUDE.md so future sessions know how to re-apply if the plugin updates.

2. **QBO refresh token expiry display** — Settings page was showing the 1-hour access token expiry, always showing "Expired". Fixed to show the 100-day refresh token expiry instead.
   - New column `refresh_token_expires_at` added to `qbo_connections` (migration applied to Supabase)
   - `lib/qbo/client.ts` — resets expiry on every token refresh
   - `app/api/qbo/auth/route.ts` — sets expiry on OAuth connect
   - `app/settings/page.tsx` — shows "Refresh token: Expires in X days"

3. **Committed** — commit `b1737c5` on main.

4. **Vercel plugin installed** — user has the Vercel MCP plugin connected and authenticated.

---

## Next session: Vercel deploy + Supabase Auth

### Step 1 — Deploy to Vercel

Use the `vercel:bootstrap` skill to deploy. The project is a Next.js 15 App Router app.

Key env vars that must be set in Vercel (copy from `.env.local`):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SHOPIFY_STORE_DOMAIN`
- `SHOPIFY_ACCESS_TOKEN`
- `QBO_CLIENT_ID`
- `QBO_CLIENT_SECRET`
- `QBO_ENVIRONMENT` (set to `production`)
- `QBO_REDIRECT_URI` → **must be updated to the Vercel URL** e.g. `https://nce-automation.vercel.app/api/qbo/auth`
- `ENCRYPTION_KEY`

After deploy:
1. Update `QBO_REDIRECT_URI` in Vercel env vars to the production URL
2. Update the Intuit developer portal redirect URI to match (developer.intuit.com → your app → Keys & credentials)
3. Re-do QBO OAuth via /settings on the live URL to get fresh tokens

### Step 2 — Add Supabase Auth (email/password, single user)

This is a **private tool, not SaaS** — one user (Gus), email/password only. No magic link needed.

Plan:
1. Enable Supabase Auth in the dashboard (already available, just needs config)
2. Create the single user account via Supabase dashboard
3. Add `@supabase/ssr` middleware to protect all routes except `/api/qbo/auth` (the OAuth callback must stay public)
4. Add a `/login` page (simple email/password form)
5. No sign-up page needed — account is pre-created

The cron route (`/api/cron`) should be protected by a secret header (`CRON_SECRET` env var) rather than Supabase Auth, since it's called by Vercel's cron scheduler, not a browser.

### Files to create/edit for auth
- `middleware.ts` (new) — Supabase SSR session check, redirect to /login if not authenticated
- `app/login/page.tsx` (new) — email/password login form
- `app/api/auth/` (new) — sign-in / sign-out API routes

### Important constraints
- `app/api/qbo/auth/route.ts` must remain publicly accessible (OAuth callback)
- `app/api/cron/route.ts` protect with `CRON_SECRET` header check, not session auth

---

## Paste this into the next chat to continue

```
We're building a Shopify-QBO fee sync tool (Next.js 15, Supabase, Tailwind).
Last session we fixed the QBO refresh token display and got Codex writing files.

Next steps (in order):
1. Deploy to Vercel using the vercel:bootstrap skill — the Vercel plugin is installed and connected
2. Add Supabase Auth (email/password, single user — this is a private tool not SaaS)
   - Middleware to protect all routes except /api/qbo/auth and /api/cron
   - Simple /login page
   - /api/cron protected by CRON_SECRET header instead of session

See docs/handoffs/vercel-deploy-and-auth.md for full details.
Use codex:rescue for all code writing to conserve tokens.
```
