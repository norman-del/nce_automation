# PRD: Product Ingestion Pipeline

**Status:** Draft — awaiting review
**Date:** 2026-04-04
**Owner:** Gus (NCE Equipment)

---

## 1. Problem Statement

Every new product NCE acquires goes through a 5-step manual pipeline:

1. Enter product into a Google Sheets spreadsheet (messy — supplier name+address bundled, model field is a grab-bag of specs/RRP/year/notes)
2. Re-enter the same data into Shopify manually (adding condition, shipping tier, type, vendor, collections, tags) — saved as draft
3. Wait for physical processing (arrival, cleaning, testing, photography) → upload photos → flip to active
4. Wait for the third-party "QuickBooks Online Global" app to sync the product to QBO (hourly)
5. Go into QBO and manually add: VAT treatment, cost price, purchase tax, preferred supplier

This is slow, error-prone, and duplicate-entry heavy. Steps 1, 2, 4, and 5 can be fully automated.

---

## 2. Proposed Solution

Replace the spreadsheet and manual data entry with a **single ingestion form** in the NCE automation app. One data entry creates records in **three places simultaneously**:

```
User enters product → Supabase (source of truth)
                    → Shopify (draft product)
                    → QBO (complete item with cost, VAT, supplier)
```

Later, when the product is physically ready:

```
User uploads photos → Shopify (images added, product set to active)
```

### Key Principles
- **Enter data once.** No re-keying between systems.
- **Structured fields.** Replace the messy spreadsheet columns with proper typed fields.
- **Auto-derive what we can.** SKU (sequential), shipping tier (from dimensions+weight), VAT treatment for QBO (from the VAT-registered flag).
- **Idempotent.** Re-processing a product is safe — check for existing Shopify/QBO records before creating.

---

## 3. Data Model (Supabase)

### 3.1 `suppliers` — Supplier Directory

Replaces the bundled "supplier name + address" column. Suppliers are reused across many products.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | TEXT NOT NULL | e.g. "Caterworx", "Jenkins & Sons" |
| contact_name | TEXT | e.g. "Matthew Kirkham" |
| phone | TEXT | |
| email | TEXT | |
| address_line1 | TEXT | |
| address_line2 | TEXT | |
| city | TEXT | |
| county | TEXT | |
| postcode | TEXT | |
| qbo_vendor_id | TEXT | Set when supplier is created/matched in QBO |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### 3.2 `products` — Core Product Table (replaces the spreadsheet)

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| sku | TEXT UNIQUE NOT NULL | Auto-generated: "NCE" + next sequential number |
| title | TEXT NOT NULL | Product description, e.g. "Foster Xtra Single Upright Fridge" |
| condition | TEXT NOT NULL | "new" or "used" |
| vat_applicable | BOOLEAN NOT NULL | true = 20% VAT, false = margin scheme (Column E in the spreadsheet) |
| cost_price | NUMERIC(10,2) NOT NULL | What NCE paid |
| selling_price | NUMERIC(10,2) NOT NULL | What NCE sells for |
| original_rrp | NUMERIC(10,2) | Manufacturer's RRP (if known) |
| model_number | TEXT | e.g. "Xr600h", "ne-c1275" |
| year_of_manufacture | INTEGER | e.g. 2018, 2020 |
| electrical_requirements | TEXT | e.g. "32amp 3ph", "13amp", "1ph/16amp" |
| notes | TEXT | Catch-all for anything that doesn't fit elsewhere |
| width_cm | NUMERIC(6,1) NOT NULL | |
| height_cm | NUMERIC(6,1) NOT NULL | |
| depth_cm | NUMERIC(6,1) NOT NULL | |
| weight_kg | NUMERIC(6,1) | Optional — used for parcel threshold check |
| shipping_tier | INTEGER NOT NULL | Auto-calculated: 0=parcel, 1=pallet, 2=double pallet |
| supplier_id | UUID FK → suppliers | |
| product_type | TEXT NOT NULL | From Shopify product types (dropdown) |
| vendor | TEXT NOT NULL | Brand name, e.g. "Foster", "Rational" |
| collections | TEXT[] | Array of Shopify collection IDs to assign |
| tags | TEXT[] | e.g. ["Foster", "Used", "Fridge"] |
| status | TEXT NOT NULL DEFAULT 'processing' | processing → active |
| shopify_product_id | BIGINT | Set when created in Shopify |
| shopify_status | TEXT DEFAULT 'draft' | draft → active |
| qbo_item_id | TEXT | Set when created in QBO |
| qbo_synced | BOOLEAN DEFAULT false | |
| sync_error | TEXT | Last error if push to Shopify/QBO failed |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### 3.3 `product_images` — Photo tracking

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| product_id | UUID FK → products | |
| file_name | TEXT NOT NULL | |
| shopify_image_id | BIGINT | Set after upload to Shopify |
| position | INTEGER | Display order |
| created_at | TIMESTAMPTZ | |

---

## 4. Shipping Tier Auto-Calculation

```
Given: width (W), height (H), depth (D) in cm, weight (Wt) in kg

PARCEL (tier 0):
  (W ≤ 120 AND H ≤ 55 AND D ≤ 50 AND (Wt IS NULL OR Wt ≤ 30))
  OR (W ≤ 60 AND H ≤ 60 AND D ≤ 60 AND (Wt IS NULL OR Wt ≤ 30))

SINGLE PALLET (tier 1):
  Not parcel AND footprint (W × D) fits within 100cm × 120cm
  (i.e., max(W,D) ≤ 120 AND min(W,D) ≤ 100)

DOUBLE PALLET (tier 2):
  Everything else (footprint exceeds 100 × 120cm)
```

Displayed to the user after entering dimensions so they can override if needed.

---

## 5. User Workflow

### 5.1 Adding a New Product

1. User navigates to `/products/new`
2. Form with structured fields (see section 7 for UI details)
3. **Supplier field**: typeahead search — start typing, matching suppliers appear. "Add new supplier" option if no match.
4. **Product type**: dropdown populated from Shopify's existing product types
5. **Vendor (brand)**: typeahead from existing Shopify vendors
6. **Collections**: multi-select dropdown from Shopify collections
7. **Dimensions**: as user enters W/H/D/weight, shipping tier auto-calculates and displays below
8. User clicks **Save** → product saved to Supabase, pushed to Shopify (draft) and QBO simultaneously
9. Product appears in the product list with status "Processing"

### 5.2 Adding Multiple Products (Batch)

- The form has a **"+ Add Another"** button that appends another product row/card
- Each product in the batch is processed independently (one failure doesn't block others)
- All share the same supplier by default (common case: buying multiple items from one seller) with ability to change per item

### 5.3 Uploading Photos (Activating a Product)

1. User navigates to `/products` → sees list of all products
2. Products with status "Processing" show an **"Upload Photos"** button
3. User uploads one or more photos (drag & drop or file picker)
4. Photos are pushed to the Shopify product via the Images API
5. Shopify product status is changed from draft → active automatically
6. Product status in Supabase updated to "active"

### 5.4 Product List View

- Filterable by status (Processing / Active / All)
- Searchable by SKU, title, vendor, supplier
- Shows: SKU, title, vendor, condition, selling price, status, date added
- Click to view/edit full details

---

## 6. System Workflow (What Happens Behind the Scenes)

### 6.1 On Product Save

```
1. Generate next SKU (SELECT max(sku_number) + 1 FROM products)
2. Calculate shipping tier from dimensions + weight
3. Save to Supabase (status: processing)
4. Push to Shopify (draft product):
   - Title: "{title} ({sku})"
   - Product type, vendor, tags, collections
   - Variants: price = selling_price
   - Status: draft
   - Metafields for: condition, shipping tier
5. Save shopify_product_id back to Supabase
6. Push to QBO (Item):
   - Name: "{title} {sku}" (matches what the third-party sync would create)
   - Description: title
   - UnitPrice: selling_price (inclusive of VAT if vat_applicable)
   - PurchaseCost: cost_price (inclusive of purchase tax)
   - SalesTaxCodeRef: 20% if vat_applicable, exempt/margin if not
   - PurchaseTaxCodeRef: 20% if vat_applicable, No VAT if not
   - PrefVendorRef: supplier's qbo_vendor_id (create QBO Vendor first if needed)
   - Tick "Inclusive of Tax" flags
   - SKU: sku
7. Save qbo_item_id back to Supabase
```

### 6.2 On Photo Upload

```
1. Upload image(s) to Shopify via POST /products/{id}/images.json
2. Save image references to product_images table
3. Update Shopify product status: draft → active
4. Update Supabase product status: processing → active
```

### 6.3 Supplier Creation (when adding a new supplier)

```
1. Save supplier to Supabase suppliers table
2. Create Vendor in QBO with name + address
3. Save qbo_vendor_id back to Supabase
```

### 6.4 Error Handling

- Each external API call (Shopify, QBO) is independent
- If Shopify push fails: save error to sync_error, product stays in Supabase, user can retry
- If QBO push fails: product still exists in Shopify as draft, user can retry QBO push
- All operations are idempotent: check for existing shopify_product_id / qbo_item_id before creating

---

## 7. Frontend Components

### 7.1 `/products/new` — Ingestion Form

**Product Details (top section):**
- Title (text input, required)
- Condition (toggle/select: New / Used)
- VAT Applicable (toggle: Yes = 20% / No = Margin Scheme)
- Cost Price (£ input)
- Selling Price (£ input)

**Model & Specs:**
- Model Number (text)
- Year of Manufacture (number)
- Electrical Requirements (text, e.g. "32amp 3ph")
- Original RRP (£ input)
- Notes (textarea)

**Dimensions & Shipping:**
- Width cm, Height cm, Depth cm (number inputs in a row)
- Weight kg (optional number input)
- Shipping Tier (auto-calculated display: "Parcel" / "Single Pallet" / "Double Pallet" — with override option)

**Classification:**
- Product Type (dropdown from Shopify)
- Vendor / Brand (typeahead from Shopify)
- Collections (multi-select from Shopify)
- Tags (tag input — type and press enter)

**Supplier:**
- Supplier (typeahead search with "Add new" option)
- When "Add new" selected: inline form for name, contact, phone, email, address

**Actions:**
- "Save & Add Another" — saves and clears form for next product
- "Save" — saves and goes to product list
- "+ Add Another" — adds another product card (batch mode)

### 7.2 `/products` — Product List

- Table/card view of all products
- Filters: status, product type, supplier, date range
- Search: SKU, title, vendor
- Actions per product: View/Edit, Upload Photos, Retry Sync (if errored)

### 7.3 `/products/[id]` — Product Detail / Edit

- View all fields
- Edit any field (re-push to Shopify/QBO on save)
- Photo upload area (drag & drop)
- Sync status: Shopify ✓/✗, QBO ✓/✗
- Activity log: when created, when pushed, when photos uploaded, when activated

---

## 8. Third-Party Sync Consideration

The existing **"QuickBooks Online Global"** Shopify app syncs products to QBO hourly. Since our pipeline creates QBO items directly, there is a risk of duplicates.

**Recommended approach:**
1. Our system creates the QBO Item first (with all fields, including cost/VAT/supplier)
2. When the third-party sync runs, it should match by SKU or Name and either skip or update (most sync apps match on SKU)
3. **Action required:** Check the QuickBooks Online Global app settings for "skip existing items" or "match by SKU" options and enable them
4. **If duplicates occur:** Consider disabling product sync in the third-party app (keep it for other sync functions like orders/invoices if needed) and let our pipeline handle products exclusively

---

## 9. Prerequisites

- [ ] **Shopify Custom App scopes**: Add `read_products` and `write_products` to the existing Custom App
- [ ] **Shopify product types & collections**: Query API once scopes are added to populate dropdown options (placeholder — to be filled in)
- [ ] **QBO Tax Codes**: Query QBO for the tax code IDs for "20% Standard" and "Exempt/Margin Scheme" — needed for the Item push
- [ ] **QBO Vendor creation**: Verify the QBO API endpoint for creating/querying Vendors
- [ ] **Third-party sync app**: Check settings to prevent duplicate QBO items

---

## 10. Implementation Plan

### Phase 1: Foundation (Database + Suppliers)
- Supabase migration: `suppliers` and `products` tables
- Supplier CRUD API routes
- Supplier typeahead component

### Phase 2: Product Ingestion Form
- Product form UI with all structured fields
- Shipping tier auto-calculation
- SKU auto-generation
- Save to Supabase

### Phase 3: Shopify Integration
- Push product to Shopify as draft (title, price, type, vendor, collections, tags, condition, shipping metafields)
- Query Shopify for product types, vendors, collections (for dropdowns)

### Phase 4: QBO Integration
- Query QBO tax codes
- Create QBO Vendor from supplier (if new)
- Create QBO Item with all fields (cost, VAT, purchase tax, supplier)

### Phase 5: Photo Upload & Activation
- Photo upload UI
- Push images to Shopify
- Auto-activate product (draft → active)

### Phase 6: Product List & Management
- Product list page with filters and search
- Product detail/edit page
- Retry sync for failed pushes

---

## 11. Out of Scope (for now)

- Bulk CSV import of historical products (the 5000+ existing items)
- Inventory tracking / stock levels
- Product deletion / archiving workflow
- Price change sync (if selling price changes after creation)
- Multiple store support

---

## 12. Open Questions

1. **Shopify product types & collections** — pending API access (scopes being updated)
2. **QBO tax code IDs** — need to query once we start Phase 4
3. **Third-party sync app behaviour** — does "QuickBooks Online Global" skip items that already exist in QBO by SKU? Needs investigation.
4. **Photo storage** — photos go directly to Shopify via their API. Do we also need a copy in Supabase Storage / Vercel Blob for backup? (Recommendation: no, Shopify is the source of truth for images)
