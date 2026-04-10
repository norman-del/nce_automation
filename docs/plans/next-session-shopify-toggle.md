# Next Session Prompt — Shopify Replacement Toggle

Copy this into the next nce_automation session:

---

Read the parent CLAUDE.md at C:\Users\norma\CLAUDE.md, the project CLAUDE.md, and the handoff doc at docs/handoffs/shopify-replacement-2026-04-10.md.

This session builds the Shopify replacement toggle — making nce_automation work both WITH Shopify (today) and WITHOUT Shopify (after migration). The handoff doc has a complete audit of the live Shopify store's configuration (all 44 product types, 13 vendors, 68 collections, metafields, shipping zones) pulled directly from the API.

**Build these 5 items in order:**

1. **SHOPIFY_SYNC_ENABLED toggle**
   - Add `SHOPIFY_SYNC_ENABLED=true` to `.env.local` and Vercel env vars
   - Create `lib/shopify/config.ts` with `isShopifySyncEnabled()` helper
   - Wrap these functions in toggle checks (skip gracefully when disabled):
     - `createShopifyProduct()` in `lib/shopify/products.ts`
     - `updateShopifyProduct()` in `lib/shopify/products.ts`
     - `activateShopifyProduct()` in `lib/shopify/products.ts`
     - `uploadImageToShopify()` in `lib/shopify/products.ts`
   - Make the payout cron (`app/api/cron/sync/route.ts`) respect the flag
   - When disabled, product activation should just set `products.status = 'active'` in Supabase

2. **Supabase-sourced metadata for form dropdowns**
   - Create `lib/products/metadata.ts` with `fetchProductMetadataFromSupabase()`
   - Queries: `SELECT DISTINCT product_type FROM products`, `SELECT DISTINCT vendor FROM products`, `SELECT id, title FROM collections WHERE collection_type = 'custom'`
   - Update `app/products/new/page.tsx` and `app/products/[id]/edit/page.tsx` to call this instead of `fetchProductMetadata()` from `lib/shopify/products.ts`
   - The form dropdowns should allow free-text entry (typeahead with existing values but staff can type new ones for new product types/vendors)

3. **Product description field**
   - The `body_html` column already exists on the products table (2,695 of 2,704 have data)
   - Add a textarea to `app/products/new/ProductForm.tsx` (label: "Description", maps to `body_html`)
   - Add the same field to the edit form at `app/products/[id]/edit/page.tsx`
   - When Shopify sync is enabled, include `body_html` in the Shopify product payload
   - The `POST /api/products` and `PATCH /api/products/[id]` routes need to accept and save the field

4. **Collection management page**
   - Add a "Collections" tab to the Settings page (`app/settings/SettingsTabs.tsx`)
   - All 68 collections already exist in Supabase `collections` table (58 custom + 10 smart)
   - Features: list all, create new (title + handle auto-generated + description), edit title/description, delete
   - The `products.collections` text array field stores collection names per product — this is how nce-site knows what collection a product belongs to
   - Admin-only (Settings page is already admin-only)

5. **Image hosting switch (when Shopify sync disabled)**
   - When `SHOPIFY_SYNC_ENABLED=false`, photos need alternative hosting
   - Try Vercel Blob first (check if `@vercel/blob` is available and configured)
   - Fallback: Supabase Storage (`supabase.storage.from('product-images').upload(...)`)
   - Update `product_images` table to store the new URL
   - Update the photo upload component to use the right upload path based on the toggle
   - Existing product images on Shopify CDN will need migrating separately (not this session)

**Important constraints:**
- Everything must build clean (`npm run build`)
- Shopify sync must still work when enabled — don't break the current flow
- Use the existing design system (dark theme, Tailwind classes from globals.css)
- TypeScript strict mode, no `any` (except QboAny pattern)
- Test with `SHOPIFY_SYNC_ENABLED=true` to verify nothing breaks

---
