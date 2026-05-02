# Handover: Dojo migration — nce-site side complete, your turn

**From:** nce-site session, 2026-05-02
**For:** nce_automation maintainer
**Status:** PRs 1–5 of the Stripe → Dojo migration are merged to `main` on
nce-site, dormant behind a feature flag. Site behaviour is unchanged. Your
parallel work in nce_automation is now unblocked.

Full plan reference: `docs/plans/stripe-to-dojo-migration.md` in this repo.

---

## What nce-site shipped

All of this is live on `main` but **dormant** — `PAYMENTS_PROVIDER` env var
defaults to `stripe`, so nothing changes until we flip it.

### Database (already applied to Supabase prod)

Three migrations on the shared Supabase instance:

1. `orders` table got three new columns:
   - `dojo_payment_intent_id TEXT UNIQUE`
   - `dojo_refund_id TEXT`
   - `payment_provider TEXT NOT NULL DEFAULT 'stripe' CHECK IN ('stripe','dojo')`
   - Indexes on `dojo_payment_intent_id` and `payment_provider`
2. New tables `promotion_codes` and `promotion_redemptions` (schema in
   `nce-site/supabase/migrations/20260502000002_promotion_codes.sql`).
   **nce-site owns writes; nce_automation reads + admin CRUD.**
3. New RPC `increment_promotion_redemption(promotion_id UUID)` — atomic
   counter bump. Use this from your admin UI if you ever manually adjust.

### Code added on nce-site (reference, not for you to copy verbatim)

- `lib/payments/provider.ts` — `getPaymentsProvider()` reads `PAYMENTS_PROVIDER`
- `lib/dojo/client.ts` — fetch wrapper, basic auth, `version: 2026-02-27`,
  payment intent + refund helpers, HMAC-SHA256 webhook verifier
- `lib/promotions/validate.ts` — promo lookup + discount calc + redemption
  recording
- `app/api/webhooks/dojo/route.ts` — receives `payment_intent.status_updated`,
  flips order pending→paid, sends email, clears cart, increments promo
- `/api/checkout` and `/order/confirmation` — branched on `PAYMENTS_PROVIDER`

---

## What nce_automation needs to build

Per plan §3 + §6.6–6.8. None of these block nce-site; all four can ship
independently and stay dormant until cutover.

### 1. `lib/dojo/client.ts` (mirror what nce-site has)

Copy the pattern from `nce-site/lib/dojo/client.ts`. Same Basic auth,
same `version: 2026-02-27` header, same env var name (`DOJO_API_KEY`).
Two-project drift on this file would be painful — **keep them aligned**.

### 2. `lib/dojo/payment-details.ts` (replaces `lib/stripe/payment-details.ts`)

Reads a Dojo payment intent for the staff order detail panel. Gotchas
verified during research:

- Card brand is `paymentDetails.cardType` (not `cardScheme` as the plan doc
  guessed)
- **There is no `last4` field** — `paymentDetails.cardNumber` is a masked
  PAN. Slice the last 4 chars yourself.
- Status enum uses US spelling: `Created | Authorized | Captured | Reversed | Refunded | Canceled`
- The PI GET response **does not include a refunds array** per the spec
  we reviewed. Trust your own `orders.dojo_refund_id` column instead, or
  hit the refunds endpoint directly.

### 3. `app/api/orders/[id]/refund/route.ts` (branch on `payment_provider`)

```ts
const order = await loadOrder(id)
if (order.payment_provider === 'stripe') {
  // existing Stripe path — keep for legacy orders, 120-day refund window
} else {
  // Dojo: POST /payment-intents/{dojo_payment_intent_id}/refunds
  // Header is `idempotencyKey` (camelCase, NOT `Idempotency-Key`)
  // Body: { amount: { value, currencyCode: 'GBP' }, refundReason?, notes? }
}
```

Plan §6.7 also asks for **partial refund support** while you're in there
— accept optional `amount_pence` in the request body.

Update `orders.dojo_refund_id` and set `status='refunded'`. Log to `sync_log`.

### 4. `app/api/promotions/route.ts` (rewrite against Supabase)

Was Stripe coupons + promotion codes. Now CRUD against the
`promotion_codes` table that nce-site created. Schema:

```
id UUID, code TEXT UNIQUE, percent_off NUMERIC(5,2),
amount_off_pence INTEGER (mutually exclusive with percent_off),
currency TEXT DEFAULT 'GBP', max_redemptions INTEGER,
times_redeemed INTEGER DEFAULT 0, expires_at TIMESTAMPTZ,
active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ
```

CHECK constraints enforce: exactly one of `percent_off`/`amount_off_pence`,
`percent_off` in (0,100], `amount_off_pence > 0`. UI validation should
match.

For redemption history, join `promotion_redemptions` (one row per use,
`UNIQUE (promotion_code_id, order_id)`).

If your existing UI at `/settings/promotions` keeps the same response
shape, no UI changes needed.

**One-time data migration** (defer until cutover): export active Stripe
promotion codes, insert into Supabase `promotion_codes`, deactivate in
Stripe.

### 5. `lib/sync/order-to-qbo.ts` (trivial rename)

Plan §6.8: rename references to `stripe_payment_intent_id` to a
provider-agnostic `payment_reference` variable. The QBO invoice doesn't
care which processor handled the card. Logic is unchanged — read whichever
of `stripe_payment_intent_id` / `dojo_payment_intent_id` is populated.

### 6. `app/orders/[id]/page.tsx` payment-details panel

Already calls into `payment-details.ts` (#2 above). Just make sure the
panel uses `order.payment_provider` to decide which lookup to call, and
gracefully renders both Stripe brand-strings ("Visa") and Dojo cardType
strings (verify in sandbox what Dojo returns — likely also "Visa").

---

## Things YOU don't need to do

- The webhook endpoint — that's nce-site's. nce_automation doesn't
  receive Dojo events.
- Promotion code validation at checkout — nce-site does that.
- Recording promotion redemptions — nce-site's webhook handles it.
- Anything in `/api/checkout` flow.

---

## Env vars you'll need (when sandbox approval lands)

- `DOJO_API_KEY` — same key nce-site uses (one per environment); both
  projects can share since they hit the same API
- Optionally `DOJO_API_VERSION` if you ever need to override the pinned
  `2026-02-27`

You do **not** need `DOJO_WEBHOOK_SECRET` — that's nce-site only.

Keep `STRIPE_SECRET_KEY` for the legacy refund path (~120 days post-cutover).

---

## Status of the Dojo application (as of 2026-05-02)

- **Submitted, "Reviewing application"** in the merchant portal. Typical 1–2
  week review.
- **Sandbox keys not yet issued.** Dojo gates the developer portal behind
  business approval, unlike Stripe's instant signup.
- Norman has rep emails out asking for: all-in rate (vs Stripe 1.5%+20p),
  MID consolidation with terminals, contract minimums, webhook retry policy,
  signing-secret rotation, and `config.redirectUrl` query-param behaviour.

Until rate confirmation comes back, the migration is contingent — nce-site
went ahead with dormant scaffolding because it's all flag-gated and harmless.
**You can do the same:** ship your four files behind a `payment_provider`
check on the order row (or the same `PAYMENTS_PROVIDER` env var if you'd
rather), and stay on Stripe by default.

If Dojo rejects or the rate isn't competitive, both repos follow Path B in
`nce-site/docs/dojo-cutover.md` — ~30 minutes of cleanup each.

---

## Live status doc

`nce-site/docs/dojo-cutover.md` is the single source of truth for migration
progress. Update it (or ping the nce-site session to update it) when you
ship your side.
