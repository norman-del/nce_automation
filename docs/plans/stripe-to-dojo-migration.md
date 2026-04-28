# Stripe → Dojo Migration Plan

**Status:** Draft / on standby. Triggered only if owner approves Dojo as the online checkout processor.
**Last updated:** 2026-04-27
**Scope:** Replace Stripe with Dojo for online card payments across `nce-site` and `nce_automation`. Keep Stripe code paths intact for historical orders during transition.

---

## 1. Why this doc exists

Owner uses Dojo for in-person card terminals and asked whether the new website could route online payments through Dojo too, rather than Stripe. We've recommended launching on Stripe (already integrated) and revisiting in 6 months. If/when he says "do it now" or "do it in Q3", **this is the implementation guide** — every code change, every gap, every gotcha.

Read alongside: `docs/plans/now-vs-strategic.md`. Dojo migration is a **strategic** change (post-Shopify cutover), not a "now/bridge" fix.

---

## 2. Dojo capability summary (verified against docs)

### What Dojo supports out of the box
| Capability | Dojo equivalent | Notes |
|---|---|---|
| Hosted checkout | **Checkout Page** at `https://pay.dojo.tech/checkout/{paymentIntentId}` | Closest to Stripe Checkout Session |
| Embedded card form | **Card Component** (JS) | Closest to Stripe Elements |
| Apple Pay / Google Pay | **Wallet Component** | |
| Server SDK | REST + PHP / .NET / mobile SDKs | **No first-class Node SDK** — we use raw `fetch` |
| Auth | Basic auth with `sk_sandbox_*` / `sk_prod_*` | One key, not pub+secret like Stripe |
| Refunds (full + partial) | `POST /payment-intents/{id}/refunds` | Idempotency-Key header required. Once issued, refund cannot be cancelled. |
| Webhooks | `payment_intent.status_updated`, `payment_intent.created`, `payment_intent.updated`, `payment.successful`, `order.created` | Webhook secrets managed via `/webhooks/secrets` — multiple secrets supported |
| Saved cards | `/customers` + `/setup-intents` + `/customers/{id}/payment-methods` | |
| Subscriptions | Yes (basic) | Less mature than Stripe Billing |
| 3DS | Built into payment intent flow | |
| Manual capture | Yes — auto-reverses if not captured within **7 days** | Watch this — Stripe gives 7 days too but the failure mode differs |
| Mobile SDKs | iOS, Android, React Native | |
| API versioning | Date-based, `version: 2026-02-27` header required on every request | |

### What Dojo does NOT have (Stripe features we currently use or might want)
| Missing capability | Impact on us | Mitigation |
|---|---|---|
| **Promotion / discount codes** | We use `stripe.promotionCodes` + `coupons` for site-wide discounts | Build our own in Supabase. See §6.3 |
| **Hosted shipping address collection** | Stripe Checkout collects address; Dojo Checkout Page is card-only* | Collect address pre-redirect on `/checkout` page on our site. See §6.2 |
| **Hosted email/customer details collection** | Same as above | Same — collect on our site before redirecting |
| **Stripe Tax** | Not used today (UK only, manual VAT) | N/A |
| **Stripe Radar fraud** | Currently relying on it implicitly | Dojo has built-in risk scoring but less tunable; accept reduced fraud surface |
| **Stripe Link** (one-click saved checkout) | Not used | N/A |
| **Stripe Billing portal** | Not used | N/A |
| **Native discount-code field in hosted checkout UI** | We use `allow_promotion_codes: true` | We render the input ourselves on our `/checkout` page and apply server-side before creating payment intent |
| **Node SDK** | We use `stripe` npm package extensively | Write a thin `lib/dojo/client.ts` using `fetch` |

\* *Confirm during sandbox testing whether Dojo Checkout Page can collect billing/shipping address. Docs are silent on this; assume not.*

### Dojo Merchant Portal (the dashboard the owner sees)
Norman/Rich would use this to:
- View transactions, payouts, fees per transaction
- Issue refunds manually (alternative to our staff dashboard)
- Manage webhook subscriptions and API keys (developer area)
- View dispute/chargeback notifications

The portal is **separate from our staff dashboard**. The owner already has a Dojo login for terminals — same login covers online once enabled. **No portal-to-staff-dashboard SSO needed**; staff dashboard remains our internal tool for order ops.

---

## 3. Current Stripe surface area in our code

Authoritative inventory — every file that mentions Stripe today. Touch all of these.

### `nce-site` (storefront)
| File | What it does | Migration action |
|---|---|---|
| `lib/stripe/client.ts` | Stripe SDK singleton | Replace with `lib/dojo/client.ts` |
| `package.json` | `stripe` dependency | Remove after cutover; add nothing (use `fetch`) |
| `app/api/checkout/route.ts` | Builds Checkout Session line items, returns redirect URL | Rewrite — see §6.1 |
| `app/api/webhooks/stripe/route.ts` | Receives `checkout.session.completed`, creates `orders` + `order_items`, sends email, clears cart | Rewrite as `app/api/webhooks/dojo/route.ts` — see §6.4 |
| `app/(shop)/order/confirmation/page.tsx` | Retrieves session by `session_id` query param, renders summary | Rewrite to retrieve Dojo payment intent — see §6.5 |
| `supabase/migrations/20260408000002_create_orders.sql` | `stripe_payment_intent_id UNIQUE` column | Add `dojo_payment_intent_id` column; keep Stripe column for legacy |

### `nce_automation` (staff dashboard)
| File | What it does | Migration action |
|---|---|---|
| `lib/stripe/client.ts` | Stripe SDK singleton | Replace with `lib/dojo/client.ts` |
| `lib/stripe/payment-details.ts` | Fetches PI + charge for admin UI (card brand, last4) | Rewrite — see §6.6 |
| `app/api/orders/[id]/refund/route.ts` | Issues full refund via Stripe | Rewrite — see §6.7 |
| `app/api/promotions/route.ts` | CRUD for Stripe coupons + promotion codes | Rewrite against Supabase — see §6.3 |
| `app/orders/[id]/page.tsx` line 45, 240 | Displays payment details panel | Pass `dojo_payment_intent_id`; component gets new fields |
| `lib/sync/order-to-qbo.ts` line 47 | Reads Stripe PI for QBO sync | Rename field to provider-agnostic `payment_reference`; logic identical |

---

## 4. Database changes

### Migration 1 — add Dojo columns to `orders`
```sql
-- Run in nce-site/supabase/migrations/
ALTER TABLE orders
  ADD COLUMN dojo_payment_intent_id TEXT UNIQUE,
  ADD COLUMN dojo_refund_id TEXT,
  ADD COLUMN payment_provider TEXT NOT NULL DEFAULT 'stripe'
    CHECK (payment_provider IN ('stripe','dojo'));

CREATE INDEX orders_dojo_pi_idx ON orders(dojo_payment_intent_id);
```
Keep `stripe_payment_intent_id` for historical orders. The `payment_provider` column lets the refund route and payment-details lookup dispatch to the right SDK.

### Migration 2 — Supabase-native promotion codes (replaces Stripe Promotion Codes)
```sql
CREATE TABLE promotion_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  percent_off NUMERIC(5,2),         -- 0–100
  amount_off_pence INTEGER,          -- mutually exclusive with percent_off
  currency TEXT DEFAULT 'GBP',
  max_redemptions INTEGER,
  times_redeemed INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (percent_off IS NOT NULL AND amount_off_pence IS NULL) OR
    (percent_off IS NULL AND amount_off_pence IS NOT NULL)
  )
);

CREATE TABLE promotion_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_code_id UUID NOT NULL REFERENCES promotion_codes(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  amount_off_pence INTEGER NOT NULL,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (promotion_code_id, order_id)
);
```
Owned by `nce-site` (writes from cart/checkout); read by `nce_automation` for the promotions admin UI.

---

## 5. Environment variables

| Var | Where | Purpose |
|---|---|---|
| `DOJO_API_KEY` | both projects (Vercel + .env.local) | `sk_sandbox_*` for preview, `sk_prod_*` for prod |
| `DOJO_WEBHOOK_SECRET` | nce-site only | HMAC verification for webhook payloads |
| `DOJO_API_VERSION` | both | Pin to `2026-02-27` (or current). Hard-code in client; env override for testing |
| `PAYMENTS_PROVIDER` | both | `stripe` \| `dojo` — feature flag for cutover |
| `STRIPE_SECRET_KEY` | both | **Keep** during transition for legacy refunds |
| `STRIPE_WEBHOOK_SECRET` | nce-site | **Keep** until last Stripe order is settled / refund window closes (~120 days) |

---

## 6. Implementation details — file by file

### 6.1 `nce-site/app/api/checkout/route.ts`
**Before:** creates `stripe.checkout.sessions.create`, returns `session.url`.

**After (Dojo):**
1. Read cart, calculate subtotal + shipping (unchanged).
2. **Apply promotion code** if customer entered one (new step — see §6.3).
3. **Collect shipping address + email on our `/checkout` page** before this route is called. Pass them into the request body.
4. Persist a `pending` row in `orders` with shipping address, email, total, `payment_provider='dojo'`, `dojo_payment_intent_id=null`.
5. Call `POST https://api.dojo.tech/payment-intents` with:
   ```json
   {
     "amount": { "value": <totalPence>, "currency": "GBP" },
     "reference": "<order.id>",
     "captureMode": "auto",
     "metadata": { "cart_session_token": "...", "order_id": "..." }
   }
   ```
6. Update `orders` row with returned `paymentIntentId`.
7. Return `{ url: \`https://pay.dojo.tech/checkout/${paymentIntentId}\` }` to the client.

**Why pre-create the order row:** Dojo's checkout page does NOT collect address. We need to capture it before the redirect, and the only place we can reliably persist it is our DB.

### 6.2 New `/checkout` page on `nce-site`
**This is new work.** Today, the cart page POSTs to `/api/checkout` and Stripe collects address. With Dojo, we need a `/checkout` page that:
- Renders cart summary
- Collects email, shipping address, optional promotion code
- Validates address → calculates shipping rate → shows total
- Submits to `/api/checkout`, gets back Dojo URL, redirects

This is a meaningful UI build (~2-3 days). Reuses existing `Address` form patterns from the customer account area.

### 6.3 Promotion codes — Supabase replacement
**`nce-site`:**
- New `lib/promotions/validate.ts`: looks up code, checks `active`, `expires_at`, `times_redeemed < max_redemptions`, returns discount.
- `/api/checkout` applies discount to total before creating Dojo payment intent.
- Webhook handler increments `times_redeemed` and inserts `promotion_redemptions` row on `payment_intent.status_updated` → succeeded.

**`nce_automation`:**
- Rewrite `app/api/promotions/route.ts` to CRUD `promotion_codes` table (Supabase) instead of Stripe.
- Existing UI at `/settings/promotions` should work unchanged if response shape is preserved.
- Add a one-time migration script: read all active Stripe promotion codes, insert into Supabase, deactivate in Stripe.

### 6.4 `nce-site/app/api/webhooks/dojo/route.ts` (rewrite of stripe webhook)
1. Read raw body and `dojo-signature` header (verify exact header name in sandbox).
2. HMAC-SHA256 verify against `DOJO_WEBHOOK_SECRET`.
3. Switch on `event.type`:
   - `payment_intent.status_updated` with status `succeeded` → load `orders` row by `paymentIntent.reference` (which is our `order.id`), update `status='paid'`, set `dojo_payment_intent_id`, create `order_items`, send confirmation email, clear cart, increment promo redemption count.
   - `payment_intent.status_updated` with status `failed`/`cancelled` → mark order `cancelled`, do NOT clear cart (let user retry).
4. Return 200 always (so Dojo doesn't retry endlessly on handler bugs).

**Critical difference from Stripe:**
- Stripe webhook fires `checkout.session.completed` *with the full cart context in metadata*. We then re-read the cart from Supabase.
- Dojo webhook only carries `paymentIntentId` + `reference`. We must look up the `orders` row we pre-created in step §6.1 to know what was bought. **The order row is the source of truth, not the cart.**
- This means `order_items` insert must move to webhook OR happen at order pre-creation. Recommendation: pre-create `order_items` too at `/api/checkout` time with `status='pending'`, then flip to active on webhook. Avoids race condition where user closes browser mid-payment.

### 6.5 `nce-site/app/(shop)/order/confirmation/page.tsx`
**Before:** retrieves Stripe session by `session_id` query param.

**After:** Dojo redirects to a return URL we configure. The return URL gets `?payment_intent_id=...`. Page does:
1. Look up `orders` by `dojo_payment_intent_id`.
2. If found and `status='paid'`, render summary.
3. If `status='pending'`, show "processing — webhook may not have fired yet" with a meta-refresh poll for 10s.
4. If not found or other status, redirect home.

Reads from Supabase, not Dojo API. (We no longer need to call the payment provider on the confirmation page — our DB already has everything.)

### 6.6 `nce_automation/lib/dojo/payment-details.ts` (rewrite of stripe/payment-details.ts)
```ts
export async function getDojoPaymentDetails(paymentIntentId: string) {
  const res = await fetch(`https://api.dojo.tech/payment-intents/${paymentIntentId}`, {
    headers: {
      'Authorization': `Basic ${Buffer.from(process.env.DOJO_API_KEY!).toString('base64')}`,
      'version': '2026-02-27',
    },
  })
  if (!res.ok) return null
  const pi = await res.json()
  return {
    paymentIntentId: pi.id,
    cardBrand: pi.payment?.cardScheme ?? null,
    cardLast4: pi.payment?.last4 ?? null,
    status: pi.status,
    created: pi.created,
    refunded: pi.refunds?.length > 0,
    refundAmount: pi.refunds?.reduce((s: number, r: { amount: number }) => s + r.amount, 0) ?? 0,
  }
}
```
*Verify exact response shape in sandbox — Dojo docs don't show full payment-intent response.*

### 6.7 `nce_automation/app/api/orders/[id]/refund/route.ts`
Dispatch on `order.payment_provider`:
- `'stripe'` → existing Stripe path (legacy orders).
- `'dojo'` → `POST https://api.dojo.tech/payment-intents/{dojo_payment_intent_id}/refunds` with `Idempotency-Key: order-{id}-refund-{timestamp}` and `{ amount: { value, currency } }`.
- Update `orders.dojo_refund_id`, `status='refunded'`. Log to `sync_log`.

**Add partial refund support** while we're here — current Stripe route only does full refunds. Accept optional `amount_pence` in request body.

### 6.8 QBO sync (`lib/sync/order-to-qbo.ts`)
Trivial: rename `stripe_payment_intent_id` references to a provider-agnostic `payment_reference`. The QBO invoice doesn't care which processor handled the card.

---

## 7. Cutover plan (zero-downtime)

1. **Build phase (1–2 weeks)** — all Dojo code lives behind `PAYMENTS_PROVIDER=dojo` flag. Default stays `stripe`. Deploy to preview.
2. **Sandbox testing** — point preview at Dojo sandbox keys. Run end-to-end: cart → checkout → Dojo redirect → webhook → order created → refund → QBO sync. Test 3DS, declined card, abandoned payment, partial refund, promotion code.
3. **Promotion code data migration** — script to copy active Stripe codes into Supabase `promotion_codes`.
4. **Owner approval gate** — Norman + owner sign off on sandbox demo.
5. **Production switch** — flip `PAYMENTS_PROVIDER=dojo` in Vercel prod. Stripe webhook endpoint stays live to handle any in-flight Stripe orders.
6. **Monitor** — for 30 days, watch `sync_log` for errors, watch QBO sync, watch refund flow. Stripe path remains hot for existing orders.
7. **Decommission Stripe** — after refund window (Stripe disputes have 120-day window). Remove `stripe` package, delete unused code, archive `STRIPE_*` env vars.

---

## 8. Risks and unknowns to resolve before cutover

1. **Dojo Checkout Page UX** — does it actually meet our brand expectations? Demo it before committing. Stripe Checkout is polished; Dojo's may feel rougher.
2. **Dojo address collection** — confirm via sandbox whether Checkout Page can collect shipping/billing address. If yes, we save the §6.2 work.
3. **Webhook delivery reliability** — Dojo's retry behaviour and signing scheme aren't well documented. Test failure modes (signature mismatch, duplicate delivery, out-of-order events).
4. **Idempotency** — Stripe's idempotency keys are battle-tested. Dojo's `Idempotency-Key` header behaviour for duplicate POSTs needs sandbox verification.
5. **Disputes / chargebacks** — no mention in our research of how disputes surface. Likely portal-only; staff dashboard would not show them. Acceptable initially.
6. **Apple Pay / Google Pay domain verification** — Dojo will require domain verification files (similar to Stripe). Plan a 1-day buffer.
7. **3DS friction** — Dojo's 3DS flow may have higher friction than Stripe's adaptive 3DS. Watch conversion metrics post-cutover.
8. **Currency** — GBP only is fine for us. If we ever sell to EU customers, re-evaluate.

---

## 9. Effort estimate

| Phase | Days | Notes |
|---|---|---|
| `lib/dojo/client.ts` + auth + types | 1 | Thin wrapper over `fetch` |
| `/api/checkout` rewrite + order pre-creation | 1 | |
| New `/checkout` UI page (address + email + promo input) | 2–3 | Biggest UI piece |
| Webhook endpoint + signature verification | 1 | |
| Confirmation page rewrite | 0.5 | |
| Refund route + partial refund support | 1 | |
| Payment details panel | 0.5 | |
| Supabase promotion codes (schema + validate + admin UI rewrite) | 2 | |
| Sandbox E2E testing + Playwright suite | 2 | |
| Production cutover + monitoring | 1 | |
| **Total** | **~12 working days** | One developer, focused |

Plus: ~2–3 days of Norman's time to negotiate Dojo online rates, verify domain, and complete merchant onboarding.

---

## 10. What NOT to do

- Don't run both processors live concurrently for new orders. The flag is binary; pick one.
- Don't delete Stripe code on day 1 of cutover. Keep it for refunds for 120 days minimum.
- Don't migrate historical Stripe payment intents to Dojo. They're done; leave them on Stripe forever.
- Don't try to sync Stripe promotion codes to Dojo (no equivalent). Migrate them into Supabase.
- Don't skip the sandbox phase. Stripe is forgiving; Dojo's API is younger and edge cases are more likely to bite.

---

## 11. Open questions for the owner before we start

1. Is there a negotiated online rate from Dojo? (See §11 in the rates conversation.) If it's not below Stripe's 1.5% + 20p, the migration's economics weaken.
2. Are existing in-person Dojo terminals on the same merchant account we'd use for online? (Affects setup time and reporting consolidation.)
3. Does the owner want unified payouts (terminals + online into one bank deposit)? Probably yes — confirm with Dojo rep.
4. Is there a contract minimum or early-termination clause on the Dojo terminal contract that conflicts with online onboarding?

---

## 12. Source references

- Dojo API reference: https://docs.dojo.tech/api
- Dojo Checkout Page integration: https://docs.dojo.tech/payments/accept-payments/online-payments/checkout-page/step-by-step-guide
- Dojo refund endpoint: https://docs.dojo.tech/payments/manage-payments/cancelling-payments/refund
- Dojo payment intent lifecycle: https://docs.dojo.tech/payments/manage-payments/payment-intent
- Dojo pricing (online rates): https://support.dojo.tech/s/article/Customer-Rates-Surcharges-UK
