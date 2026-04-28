# Shopify Admin Audit — what they use today vs what we replicate
**Date:** 2026-04-28
**Method:** Read-only Playwright walkthrough of admin.shopify.com (Norman's account) + API audit (`scripts/audit-shopify-config.mjs`) after token rotation.
**Token note:** The 2026-04-27 scope-change app reinstall appears not to have propagated. A second reinstall on 2026-04-28 issued `shpat_8629472d…` with scopes `read_files, read_online_store_navigation, read_orders, write_product_listings, write_products, write_publications, write_shipping, read_shopify_payments_payouts, read_content, read_themes`. `.env.local` and Vercel Production + Development updated. Vercel Preview update was blocked by CLI plugin guard — needs manual run: `vercel env add SHOPIFY_ACCESS_TOKEN preview --value "shpat_REDACTED" --yes`.
**Goal:** Discover Shopify-admin functionality and workflows that are NOT in `docs/plans/now-vs-strategic.md` or `nce-site/docs/PRD.md`, so they don't get lost at cutover.

This doc only covers **gaps**. Things we already replicate (orders, products, customers, basic shipping rates, refunds, payouts, supplier feeds, QBO sales sync) are intentionally not listed.

---

## 1. Confirmed gaps not in any plan doc

### 1.1 Delivery profiles — 6 in use, more nuanced than our 3-tier model
The shipping settings show **six** profiles, not five (yesterday's commit referenced five):

| Profile | Products | Zones | Notes |
|---|---|---|---|
| Store default (General) | All | 0 | Catch-all, no rates |
| Next Day Pallet Deliveries | 500+ | 1 | UK |
| Small Courier Items | 265 | 1 | UK |
| Large Courier Items | 307 | 1 | UK |
| Contact Us For Delivery | 90 | 1 | UK — quoted on request |
| Free Shipping | 305 | 1 | UK |

**Strategic gap.** Our nce-site shipping is computed from `shipping_tier` (3 values: parcel/single pallet/double pallet) plus a free-over-£1000 rule. That model can't express:
- "Contact us for delivery" (quote on request — needs a different checkout flow or a sales rep handoff)
- "Free shipping override" per-product (a £1,200 oven that genuinely is free; vs a £1,500 oven where free is just because it crosses the threshold)
- "Next-day pallet" vs "standard pallet" (timing, not just size)

Ingestion now stores `delivery_profile_id` in Supabase, but there's nothing on nce-site that reads it. Post-Shopify, this needs a Supabase-side delivery-rule model and storefront/checkout logic that consumes it.

### 1.2 Local delivery + Pickup in store — both ON
Shipping settings has both **Local delivery** and **Pickup in store** toggled ON. Neither is offered on nce-site checkout today and neither is in PRD. Probably low-volume, but if a customer expects to collect and the new site offers no pickup option, that's a regression from Shopify-day-one. Worth confirming with Rich whether these are actually used.

### 1.3 Packages, packing slips, sender name on labels
- **Packages** — 1 box defined (size/weight template for label calculation). We don't model package templates anywhere.
- **Packing slip template** — Shopify renders printable packing slips per order. We have nothing equivalent — Norman/Rich would need to either keep printing from Shopify (impossible post-cutover) or get a packing slip render in nce_automation.
- **Sender name on shipping labels** — branded sender name. APC/Pallettrack integration (PRD §3.7) will need this when it ships.

### 1.4 Purchase Orders + Transfers (Shopify Inventory features)
- `/purchase_orders` and `/transfers` exist in the Products sidebar. Both empty for NCE today (shipping screen shows only 1 location), but they're standard Shopify inventory ops:
  - **Purchase orders** track inbound stock from suppliers
  - **Transfers** move stock between locations
- Not in PRD. NCE has one location today so these may not matter immediately, but if they ever open a second site (warehouse + shop, say) they'd lose this and have to rebuild it.

### 1.5 Available vs On-hand inventory
Inventory page shows two columns: **Available** and **On hand**. Available = on-hand minus committed (reserved by unfulfilled orders). Our `products.stock_quantity` is a single number. Means our oversell protection is rougher than Shopify's — if 3 units are reserved by paid-but-unfulfilled orders, we'd still show 3 available.

### 1.6 Customer Segments + email subscription state
Customers page shows:
- **Email subscription column** ("Subscribed" / "Not subscribed") on every customer
- **Segments** sub-page with 5 default Shopify-provided segments (Email subscribers 68%, Customers who haven't purchased 78%, Abandoned checkouts last 30d 1%, etc.)

Today's `customers` table doesn't track marketing-opt-in status. Post-cutover any marketing-email tooling (PRD §3.6) needs to know who's subscribed. Add `marketing_consent_at` / `marketing_consent_source` columns when Resend marketing flows land. Segments are derivable from order history once we have the data — not a separate build.

### 1.7 Shopify Flow — possibly running automations we can't see
The **Flow** app is installed. Its admin UI is in a cross-origin iframe so I couldn't read any active workflows. **Action needed:** open Flow manually, list every active workflow, and decide for each whether (a) it's needed post-cutover and (b) where to rebuild it. Likely candidates: low-stock alerts, tagging-on-event, auto-responses to high-value orders. Cheap to inspect, expensive to rediscover by absence after cutover.

### 1.8 Marketing module — Campaigns / Attribution / Automations
The Marketing top-level section contains:
- **Campaigns** — multi-channel campaign tracking (sessions, sales, orders, conversion, ROAS, CPA, CTR per channel)
- **Attribution** — last-non-direct-click attribution dashboard
- **Automations** — drip flows (welcome, win-back, abandoned cart, etc.)

PRD §3.6 has marketing email as low priority and §3.9 covers SEO/AEO well, but there's no plan for the **measurement** side — once we cut Shopify, we lose any campaign-attribution view we have today. Vercel Analytics + GA4 cover sessions/conversion at a basic level; full multi-touch attribution is a separate problem we shouldn't underestimate. At minimum, document that we're explicitly *not* replicating this, so the agency-budget reallocation conversation in PRD §3.9 doesn't surprise anyone.

### 1.9 Customer events / pixels
Settings → Customer events lists **2 active pixels**:
- **Google & YouTube** — connected, optimised
- **Simprosys Google Shopping Feed** — paid app (£13.99/mo), generates the Google Shopping product feed

PRD §3.9 already plans for an in-house Merchant Center feed exporter (replacing Simprosys), but the **pixel side** (server-side Google Ads + GA4 conversion tracking) isn't called out. Today Shopify drops the GA4/Ads pixel automatically; on nce-site we need explicit GA4 + Google Ads conversion tags wired up. Not in PRD.

### 1.10 Notifications — far more email triggers than we have
Settings → Notifications → Customer notifications enumerates ~30 email templates Shopify sends. Today nce-site sends **2** (order confirmation, shipping notification). Notable gaps that are real workflow:

| Template | Today (Shopify) | Post-cutover (planned) |
|---|---|---|
| Order edited | Sent automatically | Not sent |
| Order cancelled | Sent automatically | Not sent |
| Order refund | Sent automatically | Not sent |
| Out for delivery | Sent automatically | Not sent (only "shipped") |
| Delivered | Sent automatically | Not sent |
| Payment error / pending payment | Sent automatically | Not sent |
| Customer account invite / welcome | Sent automatically | Supabase Auth defaults — branding off |
| Contact customer (ad-hoc message) | Sent from order page | Not built |
| Marketing double opt-in / confirmation | Configurable | Not built |

Adding the missing ones is mostly Resend templates wired to existing order-state transitions. Cheap individually, lots of them collectively. Belongs as a Phase A item in PRD §3.4 ("Transactional email coverage parity").

Also: **Staff notifications** — Shopify can email Norman/Rich on every new order, low-stock event, etc. We have no equivalent. Probably not critical (they can watch /orders in nce_automation), but worth confirming.

### 1.11 Shop-level + Variant-level metafields
Settings → Custom data shows:
- **Products: 41** metafield definitions (we have ~12 in PRD)
- **Variants: 11** (we have 0)
- **Shop: 18** (we have 0)
- 0 for collections, customers, orders, draft orders, companies, locations, pages, blogs, blog posts, markets

The 41 product-level definitions are mostly **standard Shopify taxonomy** auto-injected ("Material", "Mounting type", "Power source", "Energy efficiency class", etc.) — these populate the structured-data spec section on PDPs. We have a metafields-editor in PRD §3.4 but it's scoped to product-level only. Variant- and shop-level need calling out.

Particularly important: **Variant metafields** matter for products with size/colour variants where each variant has different specs. Used catering doesn't have many variants today, but if NCE ever sells parts/accessories with variants, this matters.

### 1.12 Metaobjects — 82 active entries, 30+ definitions
Content → Metaobjects shows 82 entries across 30+ definitions ("Compatible recipes", "Shelf material", "Orientation", "Suitable space", "Cleaning instructions", etc.). These are Shopify's **standard product attribute taxonomy** — a controlled vocabulary that PDPs render as spec rows.

We don't have any metaobject equivalent. We have `metafield_definitions` + `product_metafields` but those are flat key/value. Standard taxonomy attributes need an enum/options model (e.g. "Shelf material" must be one of 4 values: Stainless / Chrome / Plastic / Wood). Not in PRD.

### 1.13 Checkout configuration nuances
Settings → Checkout reveals settings we don't honour:
- **Company name: Required** at checkout (every order has a company name today). Stripe Checkout doesn't collect this by default.
- **Shipping address phone: Required**
- **Marketing opt-in checkbox** for both Email and SMS at checkout
- **Tipping** — 3 presets or custom (probably irrelevant for catering equipment, but it's currently on)
- **Add-to-cart limit** — protects inventory from being revealed (e.g. shows "few left" instead of exact stock)
- **Checkout rules** — product limits, age verification (linked to AVP app)
- **Edit checkout content** — copy editing for checkout strings

The Stripe Checkout we currently use doesn't capture company name or honour any of these. If trade customers expect a company-name field, that's a real regression. **Action:** confirm with Norman/Rich whether company name on every order matters for VAT invoicing or B2B; if so, add to Stripe Checkout's `custom_fields`.

### 1.14 Customer accounts — Shopify split between legacy and "new"
Two systems running side by side:
- **Legacy customer accounts** — what nce-site replicates (Supabase Auth)
- **New customer accounts** — Shopify's upgrade path with self-serve returns, store credit, Sign-in-with-Shop

Self-serve returns + store credit are real features tracked in PRD §3.8 Tier 2 (returns/RMA, gift cards) — not new gaps, just confirming the priority. **Sign-in-with-Shop** is a OAuth provider for the Shop app; not relevant if we drop the Shop channel.

### 1.15 Privacy / consent
Settings → Customer privacy:
- **Cookie banner** — visible in UK, automated
- **Data sharing opt-out page** — required in CA + 13 US states (irrelevant since we only ship UK)
- **Shopify Network Intelligence** — opt-in data sharing for ad targeting
- **Double opt-in for marketing** — toggle exists, off
- **Data storage hosting location** — EU

We have no cookie banner on nce-site. UK GDPR + PECR require one for any non-essential cookies (GA4 is non-essential). **Compliance gap, not just a feature gap.** Add to PRD pre-launch checklist.

### 1.16 Returns infrastructure (Shopify Plus feature, not currently used)
- **Return rules: Off** — Shopify can do structured returns (request → approve → label → receive → refund)
- **Self-serve returns: Off** — customers can request via account
- Already in PRD §3.8 Tier 2 — confirming it's not a hidden workflow.

### 1.17 Brand assets — distributed across channels
Settings → General → Brand stores: default logo, square logo, primary + secondary colours, cover image, slogan, short description, social links. These are pulled by every Shopify-connected channel (Shop app, Google & YouTube, Messaging). Post-cutover the Shop app and Messaging go away, Google takes its assets from Merchant Center config, so only nce-site uses them — and nce-site already has its own brand system. Probably not a real gap.

### 1.18 Domains + email DMARC
- **Domains:** `nationwidecatering.co.uk` (primary), `www.nationwidecatering.co.uk`, `ncequipment.myshopify.com`, `80a273-f0.myshopify.com` all connected. Once DNS flips, only the first two stay relevant; the .myshopify.com subdomains will need explicit redirects to nce-site or just left to die.
- **Notifications → Sender email DMARC: Needs setup.** Today Shopify sends transactional from `store+81497096525@shopifyemail.com` as backup if DMARC isn't set. Resend (PRD §3.4 has Resend domain verification listed) handles this for us *if* we complete the DNS records. Not a new gap, just a reminder it's still on the list.

### 1.19 Search & Discovery + AVP + BSure (3rd-party paid apps)
- **Search & Discovery** (free) — Shopify's search + recommendations engine. PRD §3.1 has Postgres FTS already.
- **AVP - Age Verification** (£3.99/mo) — likely covers a small subset of products (chemicals? alcohol-adjacent?). Need to know which.
- **BSure Checkout Rules** — another checkout customisation app. Stacks with Shopify-native checkout rules. Worth knowing what rules are configured.

**Action:** open each app, list its active config, decide whether it's worth replicating. AVP in particular: if any product needs age-gating, we need an equivalent on nce-site checkout (Stripe Checkout doesn't support this natively).

### 1.20 Capital / Finance offers
Shopify Capital offer — £22,000 funding currently advertised. Not something to replicate; informational.

### 1.21 iwocaPay confirmed live as a checkout payment method
PRD §3.6 lists "iWoca Pay real calculator" as low priority. **It's actively used as a checkout payment method today** (`Settings → Payments → Active`). Customers genuinely pay via iwocaPay at Shopify checkout. Stripe Checkout doesn't include iwocaPay. **This is a regression, not a future-feature.** Either:
1. Add iwocaPay as a Stripe payment method (iwoca have a Stripe integration — needs research)
2. Add iwocaPay as a separate checkout option (post-Stripe checkout, redirect to iwocaPay)
3. Drop iwocaPay (probably loses trade orders)

Bump priority from §3.6 low to §3.4 Phase A blocker, pending volume check.

---

## 2. Things we already plan for — confirming the priority

These came up in the walkthrough but are already tracked. Not new findings.

| Confirmed in admin | PRD reference |
|---|---|
| Draft orders | §3.8 Tier 1 |
| Collections CRUD | §3.4 Phase A, §3.8 Tier 1 |
| Metafields (product-level) | §3.4 Phase A, §3.8 Tier 1 |
| Pages / Blog posts (CMS) | §3.8 Tier 1 |
| Menu builder (nav) | §3.8 Tier 1 |
| B2B / Companies | §3.8 Tier 2 (currently empty in admin — Plus feature) |
| Gift cards | §3.8 Tier 2 |
| Discounts engine (automatic + manual codes) | §3.8 Tier 2 |
| Returns / RMA | §3.8 Tier 2 |
| Reports / analytics | §3.8 Tier 2 |
| Stockeo replacement | §3.5 (done) |
| Google Merchant Center feed | §3.9 SEO Phase 3 |
| Resend transactional + domain DMARC | §3.4 Phase C |
| Customer account branding | §3.4 Phase C |

---

## 3. Strategic-side action items, ranked

In recommended execution order. None are blocking yesterday's bridge work.

| # | Item | Bucket | Bumped from |
|---|---|---|---|
| 1 | Confirm iwocaPay volume with Norman; if material, route iwocaPay through Stripe or build a parallel checkout | Strategic, Phase A blocker | §3.6 low → §3.4 |
| 2 | Strategic delivery model — replace 3-tier with profile-based: free-shipping override, contact-us flag, next-day option, per-product profile_id | Strategic, Phase A | new |
| 3 | Confirm with Rich: are local delivery + pickup-in-store actually used? If yes, add to checkout | Strategic, decision | new |
| 4 | Open Shopify Flow, document every active workflow, decide per-flow what to do post-cutover | Audit task | new |
| 5 | Open AVP (Age Verification), document which products are gated, build replacement | Strategic | new |
| 6 | Open BSure Checkout Rules, document active rules, decide replacement | Strategic | new |
| 7 | Cookie banner + UK GDPR consent for nce-site | Pre-launch blocker | new |
| 8 | Stripe Checkout: add company-name field + shipping phone required (parity) | Strategic, Phase A | new |
| 9 | Variant- and shop-level metafields support | Strategic, Phase A | new |
| 10 | Metaobjects model — controlled vocabulary for spec attributes | Strategic, Phase A | new |
| 11 | Packing slip render in nce_automation | Strategic, ops | new |
| 12 | Transactional email coverage parity (Resend templates for cancel/refund/edit/out-for-delivery/delivered) | Strategic, Phase A | new |
| 13 | Server-side GA4 + Google Ads conversion tracking on nce-site | Strategic, SEO-1 | adjacent to §3.9 |
| 14 | Marketing-consent column on customers + opt-in capture at checkout/account | Strategic, prereq for marketing email | new |
| 15 | Available-vs-on-hand stock split (committed vs free) — only when first oversell incident hits | Strategic, defer | new |
| 16 | Confirm dormancy of AVP + BSure apps with Norman; if confirmed, cancel subscriptions (~£60/yr win, no code change) | Quick win, billing | new (§4.1) |
| 17 | Open Shopify Flow `/apps/flow/workflows` manually, document active workflows | Audit prerequisite | new (§4.1) |
| 18 | Capture Search & Discovery synonyms + curated boosts before cutover | Strategic, search parity | new (§4.1) |
| 19 | Decide what to do about Shopify Inbox chat widget + email marketing campaigns at cutover (currently sending real campaigns) | Strategic, marketing | new (§4.3) |
| 20 | Audit Settings → Users for stale admin access (e.g. Marcus Wincott) | Security, owner action | new (§4.2) |
| 21 | Check which delivery profile uses live carrier rates (dpd_uk / hermes_uk / royal_mail / yodel) — this changes the strategic shipping model | Strategic, shipping | new (§4) |

---

## 4. Installed apps — full deep-dive (added after token refresh)

After the token was rotated to one with `read_content`, `read_themes`, `read_files`, `read_online_store_navigation`, the API audit ran cleanly for the data we have scope for (`scripts/audit-shopify-config.mjs` → `docs/handoffs/shopify-config-audit-2026-04-28.json`). Highlights from the API:

- **Plan: Basic** (~£25–30/mo). Confirms `has_discounts: false` and `has_gift_cards: false` — neither feature is in use today.
- **4 publications** (= sales channels): Online Store, Point of Sale, Shop, Google & YouTube.
- **4 active carrier services** for live rate quoting at checkout: `dpd_uk`, `hermes_uk` (Evri), `royal_mail`, `yodel`. **This is new info** — I'd assumed all 6 delivery profiles use flat rates. At least one profile is querying these carriers in real time. Worth confirming via the shipping detail page which profile uses live rates.
- **41 product metafield definitions, 11 variant-level, 0 customer/order/collection-level**. Confirms our metafield model is product-only.
- **0 webhooks registered** — Shopify is not pushing any events to external URLs today. Means whatever automations run, they run via apps, not direct webhooks.
- 32 orders / £16,953 in last 30 days, all `web` source (no POS sales).
- 2,757 products, 89% active 11% draft.

**Apps still 403** (need `read_apps`, `read_customers`, `read_discounts`, `read_markets`, `read_returns`, `read_marketing_events`, `read_gift_cards`, `read_locations`, `read_fulfillments`): scope set on the next token rotation if needed. Not blocking — most are confirmed empty by the UI walkthrough.

### 4.1 Installed apps — verdict per app

Eight apps installed (excluding our own NCE Automation API):

| App | Vendor | Cost | Last active | Verdict |
|---|---|---|---|---|
| **QuickBooks Online Global** | Intuit | free (paid via QBO) | every minute | **Replace** — already planned, our QBO sync goes live at cutover (PRD §3.4) |
| **Stockeo** | Solvenium | $9.99/mo | every 2 hours | **Replaced** — Supabase supplier feed live but disabled. Cancel after Shopify cutover (PRD §3.5) |
| **Messaging (Shopify Inbox)** | Shopify | free | trusted (no activity log) | **Decide** — running active marketing campaigns (4 in progress as of 2026-04-28). Goes away with Shopify. We have no equivalent customer-chat or email-marketing UI. WhatsApp link is the current proxy. |
| **Flow** | Shopify | free | trusted (no activity log) | **Audit needed** — workflows are in a cross-origin iframe that the rotated token broke. Norman/Rich need to open `/apps/flow/workflows` and screenshot the active workflow list. Could be doing low-stock alerts, tag-on-event, etc. |
| **Search & Discovery** | Shopify | free | trusted | **Replicate parity** — runs storefront search synonyms, recommendations, and filter customisation. nce-site has Postgres FTS + related products but no synonyms, no curated "boost", no merchandising rules. Worth one walkthrough to capture configured synonyms before cutover. |
| **AVP – Age Verification** | Gm infotech inc | $3.99/mo | "**No activity in last 30 days**" | **Likely dormant** — 0 active extensions, 0 active functions, last popup access 3 days ago. Probably leftover from a launched-then-abandoned product gate. Confirm with Norman; if dormant, cancel + uninstall. |
| **BSure Checkout Rules** | StoreSpark | (paid app) | "**No activity in last 30 days**", last access 3 weeks ago | **Likely dormant** — 0 active functions, 0 active extensions. Same pattern. Confirm + cancel. |
| **Simprosys Google Shopping Feed** | Simprosys | $13.99/mo | always-on (pixel) | **Replace** — generates the Google Shopping product feed. PRD §3.9 SEO-3 already plans an in-house exporter. Cancel after the new feed is verified in Merchant Center. |

Total third-party app spend: **$3.99 + $9.99 + $13.99 ≈ $28/mo** + whatever BSure costs. Of these, two (AVP + BSure) appear dormant. **One quick win: confirm dormancy and cancel them — probably saves £30–60/yr immediately, no code change needed.**

### 4.2 The "Marcus Wincott" footprint
The activity log on AVP and BSure shows installs by **Marcus Wincott**, who is also a customer (draft order #D12 for £199 on Dec 5, 2024). Worth confirming with Norman — looks like a contractor/freelancer with admin access. If they're no longer engaged, that admin access should be revoked at Settings → Users.

### 4.3 What lives in Shopify Inbox / Messaging that we don't replicate
The Marketing module showed Messaging with **2 drafts + 2 sending campaigns** as of last activity. That means actual marketing emails go out from Shopify Inbox today. Three things:

- **Customer chat widget** on the Shopify storefront (handled by Inbox). nce-site has no chat — only a WhatsApp link.
- **Email marketing campaigns** (newsletters, promotions, abandoned-cart sends) — not in PRD beyond the "Klaviyo" placeholder in §3.6.
- **SMS marketing** — Inbox supports it; not used today (`transactional_sms_disabled: false` per shop config, but no active SMS campaign visible).

Post-cutover, all of this disappears. Resend handles transactional, but **marketing email is still unbuilt.**

---

## 5. What I couldn't get to today

- **Token-blocked API audit.** Need fresh `SHOPIFY_ACCESS_TOKEN` (post-2026-04-27 scope change). Once that's fixed, run `node scripts/audit-shopify-config.mjs` to dump everything reachable: delivery profiles full rate breakdown, all metafield definitions, webhooks registered, shop-level config, more. Cross-checking the API output against this doc may surface things I missed in the UI.
- **Iframe-locked apps.** Flow, POS device list, and some app config screens load in cross-origin iframes that the Playwright session can't read. Norman or Rich need to open these manually and screenshot, or I need to attach to each iframe separately.
- **Order detail screen.** I didn't open a specific Shopify order to compare its layout to ours. Likely fine (we have most of it) but a 5-minute pass would catch anything obvious.
- **Per-product workflow.** I didn't compare the Shopify product-edit form field-by-field to ours. Some hidden fields (HS code, country of origin, requires-shipping toggle, etc.) might be missing in our form.

---

## 5. Sources

Walkthrough on 2026-04-28 covered (read-only):
`/home`, `/orders`, `/draft_orders`, `/shipping_labels`, `/products`, `/products/inventory`, `/purchase_orders`, `/transfers`, `/customers`, `/customers/segments`, `/customers/companies`, `/marketing`, `/discounts`, `/content/metaobjects`, `/content/files`, `/content/menus`, `/markets`, `/finance`, `/analytics`, `/analytics/reports`, `/themes`, `/pages`, `/online_store/preferences`, `/apps/point-of-sale-channel/...`, `/apps/flow/workflows` (iframe-blocked), `/settings/{general,payments,checkout,customer_accounts,shipping,taxes,locations,apps,domains,customer_events,notifications/customer,custom_data,languages,privacy,legal,general/branding,general/activity,general/business-details,shipping/document_settings}`.
