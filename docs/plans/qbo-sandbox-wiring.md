# QBO sandbox wiring — plan

**Status:** Spec only. Not started.
**Trigger:** Bill 818 incident — there's no way to test destructive QBO actions without hitting prod, and we should fix that.
**Owner:** Gus
**Estimate:** 1–2 days end-to-end.

## Problem

`QBO_ENVIRONMENT=production` and `qbo_connections` holds exactly one row, the live company. Every destructive flow (`/repush`, `/products/[id]` DELETE, future Bill writes, Sales Receipt writes) goes against the production books on the first try. There's no surface for me, Gus, or future contributors to verify behaviour before it ships. The Bill 818 incident would have been caught in 30 seconds against a sandbox.

Intuit Developer offers a free Sandbox Company per developer account. It's a separate realm, separate OAuth tokens, but the same API surface — meaning everything we ship against prod can run against sandbox unchanged.

## Goal

A toggle (env var or per-request header) that routes any QBO API call to a sandbox realm instead of production. Owner-visible from the dashboard so Norman/Rich can see *which environment* a destructive button will hit. Tests for destructive endpoints should run against sandbox in CI.

## Non-goals

- Don't try to clone production data into sandbox. Sandbox starts empty; we seed it with whatever we need to test.
- Don't replace the production connection. Both connections coexist.

## Design sketch

### Schema change

`qbo_connections` already has an `environment` column (sandbox / production). Today we have one row with `production`. Move to one row per environment, keyed by `environment`:

```sql
ALTER TABLE qbo_connections DROP CONSTRAINT IF EXISTS qbo_connections_pkey;
-- already has `id` UUID. Add unique on environment.
CREATE UNIQUE INDEX qbo_connections_environment_unique ON qbo_connections (environment);
```

### Connection lookup

`lib/qbo/client.ts:getQboConnection()` currently does `select * limit 1 single`. Change to take an environment argument with a default:

```ts
export async function getQboConnection(env: 'sandbox' | 'production' = inferEnvironment()): Promise<QboConnection | null>
```

Where `inferEnvironment()` reads:
1. A request-scoped header / cookie if running in a route handler (so per-request overrides work).
2. Falls back to `process.env.QBO_DEFAULT_ENV ?? 'production'`.

### OAuth callback

`app/api/qbo/auth/route.ts` already accepts a `state` param. Extend it to round-trip the requested environment, so a "Connect Sandbox" button on `/settings/Connections` goes to sandbox-OAuth and writes a row with `environment='sandbox'`.

### UI

- `/settings/Connections`: render two cards side-by-side — Production and Sandbox. Each has its own Connect / Disconnect / health-check.
- Every destructive button (Re-push, Recreate, Delete, Refund, Post-to-QuickBooks) renders a small badge showing which environment it'll hit. Default is production. A page-level toggle (admin-only) flips the badge to sandbox for the next destructive action — like a "test mode" radio at the top of the page.

### Cron / background jobs

CRON jobs (`qbo-refresh`, `qbo-inventory-pull`, `sync`, `order-qbo-sync`) always run against production. No environment toggle for them — they exist to keep prod alive.

### CI

Add a sandbox-only test suite that spins up:
1. A real sandbox OAuth (manual one-time setup; tokens stored as GitHub Action secrets).
2. Smoke tests for each destructive endpoint, verifying expected QBO state changes in sandbox.
3. Refusal tests — `/repush` with `QtyOnHand > 0` must 409.

These run on every PR that touches `lib/qbo/`, `lib/strategic/products/`, or `app/api/products/`.

## Migration plan

1. **Schema migration** — add the unique index on environment, no data move.
2. **Backfill** — confirm existing prod row has `environment='production'`.
3. **Code change** — `getQboConnection(env)` with default = production. No behaviour change for any existing caller.
4. **OAuth state round-trip** — add `?env=sandbox` support to `/api/qbo/auth` initiator.
5. **Settings UI** — sandbox card + connect/disconnect.
6. **Test mode toggle** — admin-only radio at the top of `/products/[id]`, `/orders/[id]`, `/finance/[id]`. Stores in cookie, sent as header to API routes.
7. **CI suite** — start with a single test for `/repush` rejecting non-zero stock.

Each numbered step is independently shippable. Steps 1–3 are pure refactor with zero user-visible change.

## Risks

- **Sandbox tokens expire too** — we'll need a sandbox keepalive cron (or accept manual reconnect during long inactivity). One per environment.
- **Forgetting to toggle off** — if an admin leaves "test mode" enabled, the next user might unintentionally hit sandbox in a critical flow. Mitigate with: cookie expiry on tab close, big banner at the top of the page when enabled, audit log entry on every API call that hit sandbox so we can see if anyone tried prod work in sandbox by accident.
- **Sandbox drift** — sandbox state diverges from prod over time. That's fine for testing destructive *behaviour* but not for regression-testing reports. Document as expected.

## Out-of-scope alternatives considered

- **Mocking QBO in tests** — we already considered this and it's not enough. Mocks can't catch issues like the auto-shrinkage adjustment on deactivation, because that's QBO behaviour and not API surface. Real sandbox is the only honest test.
- **A second prod company** — too expensive and confusing for owners.
