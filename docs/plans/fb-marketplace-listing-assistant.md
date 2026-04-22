# Plan: Facebook Marketplace Listing Assistant

## Goal

Add Facebook Marketplace as a channel in our product ingestion pipeline. Since there's no public API, we build a "listing assistant" that pre-formats everything so the person posting just copies, pastes, and uploads photos. Target: reduce per-product listing time from ~7 minutes to ~1.5 minutes.

## How It Works (User Flow)

1. User adds a new product via `/products/new` as normal
2. In the form, they tick **"List on Facebook Marketplace"** (new checkbox)
3. Product saves to Supabase, syncs to Shopify + QBO as usual
4. On the product detail page (`/products/[id]`), a new **"Marketplace"** tab appears
5. That tab shows:
   - Ready-to-paste title (formatted for FB — shorter, keyword-rich)
   - Ready-to-paste description (generated from product fields)
   - Price, condition, category — all mapped to FB's format
   - Copy button next to each field
   - "Download all photos" button
   - "Open Facebook Marketplace" link (opens FB create listing page)
6. User clicks through to Facebook, pastes fields, drags in photos, submits
7. User comes back and clicks "Mark as listed" — records the date
8. Later: user posts from personal Marketplace to business page (manual, ~30 seconds)

## Database Changes

Add columns to `products` table:

```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS marketplace_enabled BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS marketplace_title TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS marketplace_description TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS marketplace_category TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS marketplace_listed BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS marketplace_listed_at TIMESTAMPTZ;
```

## Frontend Changes

### 1. Product Form (`app/products/new/ProductForm.tsx`)

- Add a "Channels" section at the bottom of the form (before submit)
- Checkbox: "List on Facebook Marketplace" → sets `marketplace_enabled = true`
- Future: additional checkboxes for eBay, etc.

### 2. Product Detail Page (`app/products/[id]/page.tsx`)

- New "Marketplace" tab (only visible when `marketplace_enabled = true`)
- Tab contents:
  - **Title** — auto-generated, editable, with copy button
  - **Description** — auto-generated from product fields, editable, with copy button
  - **Price** — selling_price formatted, with copy button
  - **Condition** — mapped (new → "New", used → "Used - Good")
  - **Category** — auto-mapped from product_type (e.g. "Fryer" → "Kitchen Appliances")
  - **Location** — hardcoded to business address
  - **Photos** — grid with "Download all" button (pulls from product_images)
  - **"Open Facebook Marketplace"** button
  - **"Mark as listed"** button → sets marketplace_listed + marketplace_listed_at
  - Status indicator: "Not listed" / "Listed on 6 Apr 2026"

### 3. Product List Page

- Add a "Marketplace" filter/column showing listed/not listed status
- Filter: "Ready to list" (marketplace_enabled = true, marketplace_listed = false)

## Backend Changes

### 1. Marketplace Content Generation (`lib/marketplace/generate.ts`)

Function that takes a product record and returns:

```ts
{
  title: string        // max 100 chars, keyword-optimised
  description: string  // structured with specs, condition, delivery info
  category: string     // mapped from product_type
  condition: string    // mapped from product.condition
  price: string        // formatted selling_price
  location: string     // business address
}
```

Title format: `[Brand] [Product Type] [Key Spec] - [Condition]`
Example: `Buffalo 20L Countertop Fryer - Single Tank 3kW - Refurbished`

Description template:
```
[Title]

[Key specs: dimensions, weight, electrical]
[Condition detail]
[Model number if available]

Collection available from [address] or delivery available nationwide.
```

### 2. Category Mapping (`lib/marketplace/categories.ts`)

Static map from our product_type values to Facebook Marketplace categories:
- Fryer → Kitchen Appliances
- Oven → Kitchen Appliances
- Refrigerator → Kitchen Appliances
- Display → Commercial Equipment
- etc.

### 3. API Updates

- `POST /api/products` — accept `marketplace_enabled` field
- `PATCH /api/products/[id]` — accept marketplace field updates
- `POST /api/products/[id]/marketplace/mark-listed` — sets listed flag + timestamp

## Files to Create/Modify

| File | Action |
|---|---|
| `supabase/migrations/YYYYMMDD_add_marketplace_fields.sql` | Create — new columns |
| `lib/marketplace/generate.ts` | Create — content generation |
| `lib/marketplace/categories.ts` | Create — category mapping |
| `app/products/new/ProductForm.tsx` | Modify — add channels section |
| `app/products/[id]/page.tsx` | Modify — add Marketplace tab |
| `app/products/[id]/MarketplaceTab.tsx` | Create — tab component |
| `app/api/products/route.ts` | Modify — accept marketplace_enabled |
| `app/api/products/[id]/route.ts` | Modify — accept marketplace updates |
| `app/api/products/[id]/marketplace/route.ts` | Create — mark-listed endpoint |
| `app/products/page.tsx` | Modify — add marketplace filter/column |

## Estimation

- Database migration: 15 min
- Content generation logic: 1 hour
- Category mapping: 30 min
- Form checkbox + channels section: 30 min
- Marketplace tab component: 2 hours (copy buttons, photo download, status)
- API updates: 30 min
- Product list filter: 30 min

## Future Extensions

- **eBay**: Same pattern — tick box, generate eBay-formatted content, copy-paste assist
- **CSV bulk export**: Generate Facebook bulk upload CSV for multiple products at once
- **ZeeDrop integration**: If we find it reliable, direct Shopify-to-FB sync
- **Listing analytics**: Track which Marketplace listings get enquiries (manual entry)
