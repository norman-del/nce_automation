# Owner confirmation — Shopify capabilities audit
**For:** Norman + Rich
**Date:** 2026-04-28
**From:** Gus
**Action needed:** ~10 minutes — read each section, tick or comment, send back.

This is a one-off check before I commit to building the next round of features. I've gone through the Shopify admin and listed everything you appear to use today that we'd lose at cutover. Some I'm sure about, some I'd rather double-check than rebuild for nothing.

Reply with **YES / NO / NOT SURE** on each item, plus any context. If you're not sure, leave it and I'll dig in.

---

## A. Capabilities I'm planning to rebuild — please confirm you use these

These are things I see configured in Shopify that we'd lose at cutover unless I rebuild them. My default is to rebuild. Tell me **NO** if any are actually unused — saves me a sprint.

| # | Capability | What I see in Shopify | Plan to rebuild? |
|---|---|---|---|
| A1 | **iwocaPay at checkout** | Live as an active payment method. Trade customers can pay via iwocaPay finance | YES — material to trade orders |
| A2 | **6 delivery profiles, not 3 tiers** | Next-day pallet, small courier, large courier, contact-us, free shipping, plus the default. ~1,500 products spread across them | YES — need richer model than current tiers |
| A3 | **"Contact us for delivery" flag** on 90 products | Some heavy/oversized items quote on request rather than show a price | YES |
| A4 | **Free-shipping override per product** on 305 products | Products explicitly free-shipped regardless of cart total | YES |
| A5 | **Live carrier rates at checkout** (DPD, Evri, Royal Mail, Yodel) | At least one delivery profile is calling these carriers in real time | NEEDS CONFIRMATION — see C1 |
| A6 | **Packing slip print** | Shopify generates a per-order packing slip for the warehouse | YES |
| A7 | **Customer marketing-consent tracking** | Every customer record has "Subscribed / Not subscribed" for email | YES |
| A8 | **Marketing email campaigns** (currently via Shopify Inbox) | 4 campaigns live the day I checked — 2 drafts, 2 sending | NEEDS CONFIRMATION — see C5 |
| A9 | **Variant-level + shop-level custom fields** | 11 variant metafields, 18 shop-level metafields configured | YES |
| A10 | **Standard product spec taxonomy** ("Material", "Mounting type", "Energy class" etc.) | 41 product attribute definitions, mostly Shopify standard, with controlled vocab values | YES |
| A11 | **Cookie banner / consent** | Required by UK GDPR + PECR; Shopify provides this automatically | YES (compliance) |
| A12 | **Company-name field at checkout** | Currently REQUIRED on every Shopify order. Stripe Checkout doesn't capture this by default | NEEDS CONFIRMATION — see C2 |
| A13 | **Order-status emails** beyond "shipped" | Shopify auto-sends: order edited, cancelled, refunded, out-for-delivery, delivered, payment errors. We currently only send "order placed" + "shipped" | YES |
| A14 | **"Contact customer" ad-hoc email from order page** | Send a one-off message to a customer about their order | YES |
| A15 | **Search synonyms + curated boost** (Shopify Search & Discovery) | E.g. "fridge" → "refrigerator", "oven" → "cooker" | YES |
| A16 | **Return rules / structured returns process** | Currently OFF in Shopify — but you've said elsewhere you want this | YES (already in Tier 2) |

---

## B. Capabilities I think you DON'T use — confirm before I drop them

These look dormant in the admin. If I'm right, we don't rebuild and we save subscription costs. If I'm wrong, tell me and I'll add them to the build list.

| # | Capability | Why I think it's dormant | Drop? |
|---|---|---|---|
| B1 | **AVP — Age Verification app** ($3.99/mo) | Zero activity in last 30 days, no active checkout extensions, no active functions. App was uninstalled then reinstalled Oct 28→30 last year. Don't know what triggered it | UNINSTALL + cancel? |
| B2 | **BSure Checkout Rules app** | Zero activity in last 30 days, last access 3 weeks ago, no active rules or functions configured | UNINSTALL + cancel? |
| B3 | **Shopify Inbox customer chat** (live chat widget on storefront) | I see the marketing side is active, but the live-chat widget side I can't tell. We point customers at WhatsApp today | Drop in favour of WhatsApp? |
| B4 | **Point of Sale (POS)** | Zero POS sales in the last 30 days. POS app installed but no devices configured | Drop entirely? |
| B5 | **Shop app channel** | Shopify's consumer "Shop" app — products are published to it but I don't know if it drives sales | Drop entirely? |
| B6 | **Markets / international** | UK only, GBP only, no EU/US market enabled | Drop — no rebuild needed |
| B7 | **B2B Companies** (Shopify Plus feature) | Empty in admin — looks like a Plus-plan-only feature you haven't enabled | Drop — but see Tier 2 backlog item on B2B pricing |
| B8 | **Tipping at checkout** | Currently ON in Shopify — 3 presets + custom amount | Drop — catering equipment isn't a tipping context |
| B9 | **Discounts engine** (Shopify's automatic discounts, not Stripe codes) | Zero discounts configured, store flag `has_discounts: false` | Drop — Stripe promo codes already covered |
| B10 | **Gift cards** | Zero gift cards in use, store flag `has_gift_cards: false` | Drop — already in Tier 2 backlog if needed later |
| B11 | **Purchase Orders** / **Transfers** (Shopify inventory ops) | One location, no PO records, no transfer records | Drop — only relevant if you ever have multiple warehouses |
| B12 | **Local delivery + Pickup-in-store** | Both toggled ON in Shopify but no orders show "local delivery" or "pickup" as the method in last 30 days | NEEDS CONFIRMATION — see C3 |

---

## C. Things I genuinely don't know — please tell me

I couldn't see these from the admin (some are inside cross-origin iframes that broke when the API token rotated). 5 minutes of your time on each saves me a wasted sprint.

| # | Question | What I need from you |
|---|---|---|
| C1 | **Which of the 6 delivery profiles uses live carrier rates** (DPD/Evri/Royal Mail/Yodel) vs flat rates? | Open Shipping settings → click into each profile → screenshot the "Rates" tab. If any say "Calculated rates" or show a carrier name, that profile is live-quoting at checkout |
| C2 | **Why is "company name" required at checkout?** | Is it for B2B/trade VAT invoicing? Is every checkout-er expected to be a business? If not, can we make it optional like the address line 2? |
| C3 | **Do customers ever use "Local delivery" or "Pickup in store"?** | Both toggled ON in Shopify. If yes, we'll add to nce-site checkout. If you turned them on once and forgot, we drop |
| C4 | **What is Shopify Flow doing today?** | Open Apps → Flow → list every workflow. I couldn't read it through the admin. Likely candidates: low-stock alert, tag-on-event, auto-respond to high-value orders. Whatever's there, screenshot the "Active workflows" tab |
| C5 | **Are the Shopify Inbox marketing campaigns going out to customers?** | I see "2 drafts, 2 sending" — but is that actively used or stale? If you're sending newsletters/promo emails through it, this is a real gap (we'd need a Resend-based broadcast tool). If not, drop |
| C6 | **Marcus Wincott installed AVP and BSure last year** | Marcus also placed a draft order. Is Marcus a current contractor / staff member with admin access? If not, I'll flag for you to revoke their Settings → Users access |
| C7 | **Search & Discovery synonyms** | Open Apps → Search & Discovery → Synonyms tab and screenshot. We need to seed nce-site search with the same synonyms. Same for any product "boosts" or curated rankings |
| C8 | **Simprosys Google Shopping Feed** ($13.99/mo) | We're planning to replace this with our own Google Merchant Center feed. Is anything specific about how Simprosys configures the feed today (custom labels, excluded products) we need to preserve? |

---

## D. Capabilities already on the roadmap — for awareness, no action needed

These are already in the plan and being built. Listed so you can see we're not missing them.

- Customer accounts / login / order history ✅ (built)
- Stripe checkout, refunds, promo codes ✅ (built)
- Order management dashboard, ship + track, customer detail ✅ (built)
- Product ingestion → Supabase + Shopify + QBO ✅ (built)
- Supplier feed ingestion (Stockeo replacement) ✅ (built, disabled until cutover)
- QBO sales sync (replacing the QBO Global app) ✅ (built, dry-run)
- Collection management UI 🛠️ (in progress)
- Metafield / specs editor 🛠️ (in progress)
- Draft orders / quotes for trade 📋 (queued, Tier 1)
- Returns / RMA workflow 📋 (queued, Tier 2)
- Reports / sales analytics 📋 (queued, Tier 2)
- Shipping label printing (APC + Pallettrack) 📋 (queued, Tier 2 — manual today, manual after, automated later)
- Cookie banner + UK GDPR compliance 📋 (queued, pre-launch blocker per A11)
- iwocaPay through Stripe 📋 (queued, blocker per A1)
- Marketing email broadcast (if confirmed as needed per A8/C5)

---

## How to reply

Easiest is just paste this section into a reply and put YES / NO / NOTES next to each item. Or send WhatsApp voice notes — I'll transcribe and update.

```
A1 iwocaPay:                  YES / NO
A2 6 delivery profiles:       YES / NO
A3 Contact-us on 90 products: YES / NO
A4 Free-shipping override:    YES / NO
A5 Live carrier rates:        YES / NO + see C1
A6 Packing slips:             YES / NO
A7 Marketing consent on customers: YES / NO
A8 Marketing email campaigns: YES / NO + see C5
A9 Variant + shop metafields: YES / NO
A10 Standard spec taxonomy:   YES / NO
A11 Cookie banner:            YES (compliance)
A12 Company name required:    YES / NO + see C2
A13 Extra order emails:       YES / NO
A14 Contact-customer email:   YES / NO
A15 Search synonyms:          YES / NO + see C7
A16 Returns process:          YES / NO

B1 Drop AVP age verification: YES / NO
B2 Drop BSure checkout rules: YES / NO
B3 Drop Shopify Inbox chat:   YES / NO
B4 Drop POS:                  YES / NO
B5 Drop Shop app channel:     YES / NO
B6 Drop Markets:              YES (UK only)
B7 Drop B2B Companies:        YES / NO
B8 Drop tipping at checkout:  YES / NO
B9 Drop Discounts engine:     YES (Stripe codes cover it)
B10 Drop gift cards:          YES / NO
B11 Drop PO/Transfers:        YES / NO
B12 Drop local-delivery + pickup: YES / NO + see C3

C1 Carrier rates: <screenshots>
C2 Company name reason:       <one line>
C3 Local delivery/pickup use: <one line>
C4 Active Flow workflows:     <screenshots>
C5 Inbox marketing campaigns: <one line>
C6 Marcus Wincott access:     <one line>
C7 S&D synonyms:              <screenshot>
C8 Simprosys config:          <screenshot or "default">
```

---

## Where the detail lives

The technical write-up is at `nce_automation/docs/handoffs/shopify-admin-audit-2026-04-28.md`, with:
- Full walkthrough of every Shopify admin page (§1)
- Full app-by-app deep-dive (§4)
- Raw API audit JSON at `shopify-config-audit-2026-04-28.json`
- Cross-references to PRD §3.4 / §3.6 / §3.7 / §3.8 / §3.9 and the now-vs-strategic plan

You don't need to read those — this owner-confirmation doc is the summary. They're listed so you know there's an audit trail.
