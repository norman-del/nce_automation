# Product Ingestion Pipeline — Session Handoff (2026-04-06)

## Session Summary
Long session fixing and refining the product ingestion pipeline. The core flow (form → Supabase → Shopify draft → QBO item) is working. Two issues remain.

## What's Working
- **SKU generation**: Plain numbers starting from 6368, gaps reusable on delete
- **Shopify product creation**: Draft with title `"Product Name (NCE6368)"`, metafields (theme label, condition, dimensions), shipping tier as weight, taxable flag based on VAT
- **QBO item creation**: Type=Inventory (Stock), VAT inclusive always true, preferred supplier from QBO vendor search, Stock Asset account found correctly
- **QBO vendor search**: Typeahead searches QBO vendors directly (replaced local suppliers table)
- **QBO token refresh**: Fixed double-exchange bug in OAuth callback (dedup with Set). Optimistic locking for cross-instance safety. Token was stable during this session after the dedup fix
- **Re-push button**: One-click delete from Shopify+QBO and re-create — on product detail page
- **Edit workflow**: `/products/[id]/edit` for products in "processing" status
- **Delete button**: Deletes from Supabase (cascades images). User manually cleans Shopify/QBO for now
- **Logging**: `[products/GET]`, `[products/POST]`, `[repush]`, `[retry-sync]`, `[images/POST]`, `[shopify]`, `[qbo-client]`, `[qbo-items]` prefixes throughout

## Two Remaining Issues

### 1. QBO VAT dropdown is empty
**Problem**: When creating a QBO item, the VAT/tax code dropdown shows as empty even though `SalesTaxCodeRef` and `PurchaseTaxCodeRef` are being set in the payload.

**What we've tried**:
- `{ value: taxCodeId }` — empty dropdown
- `{ value: taxCodeId, name: taxCodeName }` — empty dropdown (reverted, name property may be rejected)
- `{ value: String(taxCodeId) }` — empty dropdown (reverted)

**Expected behaviour**:
- Margin Scheme → select "Margin (0%)" in both sales and purchase VAT dropdowns
- 20% VAT → select "20.0% S (20%)" in both sales and purchase VAT dropdowns

**Debug info**: The `findTaxCodes` function logs all available tax codes and which ones it selects. Check `vercel logs` for `[qbo-items] Available tax codes:` and `[qbo-items] Selected tax codes`. The full item payload is also logged. The tax code IDs might be correct but QBO UK may need a different field name or format for Inventory items.

**Possible next steps**:
- Check the Vercel logs to see the actual tax code IDs being used
- Try creating an item manually in QBO via raw API call to see what fields QBO expects
- Check if QBO UK Inventory items use a different field than `SalesTaxCodeRef`
- The QBO API v3 docs say the field should work — maybe it's a UK-specific issue

### 2. Shopify publishing only shows Online Store + POS
**Problem**: Products should publish to ALL sales channels (Online Store, POS, Shop, Google & YouTube) but only Online Store and POS appear.

**What we've done**:
- Added `published: true` + `published_scope: 'global'` on product creation (covers Online Store + POS)
- Added `read_publications`, `write_product_listings` scopes to `shopify.app.toml`
- Deployed new app version (nce-automation-api-5) and reinstalled app
- New access token issued and saved to Vercel env vars + .env.local
- Code uses Publications API to list channels then `product_listings` endpoint to publish to each

**Problem**: The reinstall scopes shown were: `read_orders,read_publications,read_shopify_payments_payouts,write_product_listings,write_products`. Missing `read_product_listings` and `read_products` (though `write_products` implies read).

**Possible next steps**:
- Check Vercel logs for `[shopify] Available channels:` to see if the Publications API is returning all channels
- The `product_listings` PUT endpoint may not be the correct way — may need GraphQL `publishablePublish` mutation instead
- Or check if Shop / Google & YouTube channels need to be configured in Shopify admin to auto-include new products
- May need to add `read_product_listings` explicitly to scopes and redeploy/reinstall again

## Current Test Product
- SKU: 6368, "Hobart Undercounter Dishwasher"
- Shopify: synced (#10610846171469)
- QBO: synced (#6481), supplier: Technical Cooling
- Status: processing
- Use the **Re-push** button to test fixes without creating new products

## Key Files
- `lib/shopify/products.ts` — Shopify product creation, publishing, metafields
- `lib/qbo/items.ts` — QBO item creation, tax codes, accounts, stock asset
- `lib/qbo/client.ts` — QBO token management with optimistic locking
- `app/api/products/[id]/repush/route.ts` — Re-push endpoint
- `app/api/qbo/vendors/route.ts` — QBO vendor search for supplier typeahead
- `app/api/qbo/auth/route.ts` — QBO OAuth with dedup protection

## QBO Token Notes
- The refresh token was dying because the OAuth callback was hit twice (browser behaviour), causing double code exchange. Second exchange invalidated first refresh token. Fixed with dedup Set in `app/api/qbo/auth/route.ts`.
- Current token was stable after the fix. Access token lasts 1 hour, auto-refreshes via refresh token (100 days).
- If token dies again: check Vercel logs for `[qbo-client]` entries. The optimistic locking logs whether another instance already refreshed.

## Shopify App Token
Updated 2026-04-06. If scopes change again:
1. Update `shopify.app.toml` scopes
2. `npx shopify app deploy`
3. Go to Shopify Admin → Apps → Development → NCE Automation API → Install
4. Copy new token
5. Update in Vercel: `npx vercel env rm SHOPIFY_ACCESS_TOKEN production -y && echo "NEW_TOKEN" | npx vercel env add SHOPIFY_ACCESS_TOKEN production`
6. Redeploy: `npx vercel --prod`
