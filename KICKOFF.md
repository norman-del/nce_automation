# Shopify-QBO Fee Sync — Project Kickoff

> **Give this entire file to Claude Code on a fresh machine to bootstrap the project.**
> The user (Gus) will handle installing Node.js, Git, and basic tooling separately.

## Problem Statement

A small UK e-commerce business sells through Shopify. Shopify processes payments and deposits net amounts (gross minus fees) into the bank. QuickBooks Online (QBO) already has invoices auto-created by Shopify's native integration, but:

1. **Fees are not broken out** — Shopify deducts fees before depositing, but QBO doesn't know about individual per-order fees
2. **Journal entries are manual** — the owner must create journal entries in QBO to record each order's Shopify fee
3. **Payment application is manual** — the owner must find each Shopify-created invoice in QBO, click "Receive Payment", and allocate the correct net amount

This takes ~30 minutes per payout (daily or per-period). The tool automates the entire flow.

## What the Tool Does

```
Shopify Payouts API                    QuickBooks Online API
─────────────────                      ─────────────────────
1. Fetch payouts (by date)        ──►  4. Create journal entry
2. Get balance transactions       ──►     (debit Shopify Fees, credit Bank)
   (per-order amounts + fees)            with line items per order
3. Get order details              ──►  5. Find Shopify-created invoices
   (customer name, company)              (by order number / DocNumber)
                                  ──►  6. Create Payment objects
                                         (apply net amount to each invoice)
```

### Example Flow

Payout: **£2,389.89** (deposited to bank on 2026-03-20)

| Order # | Customer | Company | Gross | Fee | Net |
|---------|----------|---------|-------|-----|-----|
| NCE1573 | Mohamad Chahine | Ristorante Roma | £489.07 | £11.20 | £477.87 |
| NCE1574 | Sarah Williams | The Olive Kitchen | £612.50 | £14.03 | £598.47 |
| NCE1575 | James Cooper | Cooper's Deli | £398.20 | £9.12 | £389.08 |
| NCE1576 | Fatima Hassan | Beirut Bites Ltd | £520.00 | £11.91 | £508.09 |
| NCE1577 | David Chen | Golden Dragon | £425.58 | £9.20 | £416.38 |
| **Total** | | | **£2,445.35** | **£55.46** | **£2,389.89** |

The tool:
1. Pulls this data from Shopify Payouts API
2. Creates a QBO journal entry debiting "Shopify Fees" £55.46 (5 line items) and crediting Bank
3. Finds invoices NCE1573-NCE1577 in QBO
4. Creates Payment objects applying net amounts to each invoice

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | Next.js 15 (App Router) | Fast, familiar, API routes built-in |
| Database | Supabase (free tier) | Auth, Postgres, token storage, row-level security |
| Styling | Tailwind CSS | Rapid UI |
| Shopify | `@shopify/shopify-api` | Official SDK, REST + GraphQL |
| QBO | `node-quickbooks` npm | Community SDK, full CRUD for all QBO entities |
| QBO Auth | `intuit-oauth` npm | Official OAuth 2.0 helper |
| Scheduling | Vercel Cron | Daily sync trigger (free tier supports 1/day) |
| Hosting | Vercel (free tier) | Zero-config Next.js deployment |

---

## Project Structure

```
shopify-qbo-sync/
├── app/
│   ├── layout.tsx                  # Root layout + providers
│   ├── page.tsx                    # Dashboard: recent syncs, pending payouts
│   ├── payouts/
│   │   ├── page.tsx                # Payout list (date range, status filter)
│   │   └── [id]/
│   │       └── page.tsx            # Payout detail: orders, fees, QBO status per order
│   ├── settings/
│   │   └── page.tsx                # Shopify + QBO connection management
│   ├── sync-log/
│   │   └── page.tsx                # Sync history + error log
│   └── api/
│       ├── shopify/
│       │   └── sync/route.ts       # Pull payouts + transactions from Shopify
│       ├── qbo/
│       │   ├── auth/route.ts       # QBO OAuth callback
│       │   ├── journal/route.ts    # Create journal entries for fees
│       │   └── payment/route.ts    # Apply payments to invoices
│       └── cron/
│           └── sync/route.ts       # Daily auto-sync (Vercel Cron)
├── lib/
│   ├── shopify/
│   │   ├── client.ts               # Shopify API client setup
│   │   ├── payouts.ts              # Fetch payouts + balance transactions
│   │   └── orders.ts               # Fetch order details (customer/company)
│   ├── qbo/
│   │   ├── client.ts               # QBO client setup + token refresh
│   │   ├── auth.ts                 # OAuth flow helpers
│   │   ├── journal.ts              # Create journal entries
│   │   ├── invoices.ts             # Query invoices by DocNumber
│   │   └── payments.ts             # Create payment objects
│   ├── supabase/
│   │   ├── client.ts               # Supabase client (server + browser)
│   │   └── middleware.ts           # Auth middleware
│   └── sync/
│       └── orchestrator.ts         # Main sync logic: Shopify → QBO
├── components/
│   ├── PayoutCard.tsx              # Payout summary card
│   ├── OrderTable.tsx              # Orders within a payout
│   ├── SyncStatusBadge.tsx         # Status indicator
│   └── ConnectionStatus.tsx        # Shopify/QBO connection health
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql  # Database schema
├── .env.local.example              # Template for env vars
├── CLAUDE.md                       # Instructions for Claude Code
├── package.json
├── tailwind.config.ts
└── next.config.ts
```

---

## Database Schema (Supabase)

```sql
-- Shopify connection (single store — one row)
CREATE TABLE shopify_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_domain TEXT NOT NULL,           -- e.g. 'my-store.myshopify.com'
  access_token_encrypted TEXT NOT NULL, -- AES-256-GCM encrypted
  scopes TEXT NOT NULL,                 -- e.g. 'read_shopify_payments_payouts,read_orders'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- QBO connection (single company — one row)
CREATE TABLE qbo_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  realm_id TEXT NOT NULL,                -- QBO company ID
  access_token_encrypted TEXT NOT NULL,  -- Expires in 1 hour
  refresh_token_encrypted TEXT NOT NULL, -- Expires in 100 days
  token_expires_at TIMESTAMPTZ NOT NULL,
  company_name TEXT,
  -- Account mappings (set during onboarding)
  shopify_fees_account_id TEXT,          -- QBO account ID for "Shopify Fees" expense
  bank_account_id TEXT,                  -- QBO account ID for bank/clearing account
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Synced payouts from Shopify
CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_payout_id BIGINT UNIQUE NOT NULL,
  status TEXT NOT NULL,                  -- scheduled, in_transit, paid, failed, cancelled
  amount NUMERIC(12,2) NOT NULL,         -- Net payout amount (what hits the bank)
  gross_amount NUMERIC(12,2),            -- Total before fees
  total_fees NUMERIC(12,2),              -- Total Shopify fees
  currency TEXT DEFAULT 'GBP',
  payout_date DATE NOT NULL,
  -- QBO sync status
  journal_entry_id TEXT,                 -- QBO JournalEntry ID once created
  journal_synced_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'pending',    -- pending, synced, error, skipped
  sync_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_payouts_date ON payouts(payout_date DESC);
CREATE INDEX idx_payouts_status ON payouts(sync_status);

-- Individual transactions within a payout (one per order)
CREATE TABLE payout_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID NOT NULL REFERENCES payouts(id) ON DELETE CASCADE,
  shopify_transaction_id BIGINT UNIQUE NOT NULL,
  shopify_order_id BIGINT,
  order_number TEXT,                     -- e.g. 'NCE1573'
  transaction_type TEXT NOT NULL,        -- charge, refund, dispute, adjustment
  customer_name TEXT,                    -- e.g. 'Mohamad Chahine'
  company_name TEXT,                     -- e.g. 'Ristorante Roma'
  amount NUMERIC(12,2) NOT NULL,         -- Gross order amount
  fee NUMERIC(12,2) NOT NULL DEFAULT 0,  -- Shopify fee for this order
  net NUMERIC(12,2) NOT NULL,            -- Net = amount - fee
  -- QBO sync status
  qbo_invoice_id TEXT,                   -- QBO Invoice ID (found by DocNumber match)
  qbo_payment_id TEXT,                   -- QBO Payment ID once created
  payment_synced_at TIMESTAMPTZ,
  payment_status TEXT DEFAULT 'pending', -- pending, invoice_found, payment_created, error, no_invoice
  payment_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_payout_txns_payout ON payout_transactions(payout_id);
CREATE INDEX idx_payout_txns_order ON payout_transactions(order_number);

-- Sync log for audit trail
CREATE TABLE sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,                  -- shopify_sync, journal_create, invoice_match, payment_create
  payout_id UUID REFERENCES payouts(id),
  status TEXT NOT NULL,                  -- success, error
  details JSONB,                         -- Request/response details for debugging
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sync_log_created ON sync_log(created_at DESC);
```

---

## Environment Variables

```bash
# .env.local

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Shopify (Custom App — single store)
SHOPIFY_STORE_DOMAIN=my-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxx

# QBO / Intuit (OAuth App)
QBO_CLIENT_ID=AB...
QBO_CLIENT_SECRET=xxx
QBO_REDIRECT_URI=http://localhost:3000/api/qbo/auth
QBO_ENVIRONMENT=sandbox  # or 'production'

# Encryption key for token storage
TOKEN_ENCRYPTION_KEY=32-byte-hex-key-here

# Vercel Cron secret
CRON_SECRET=random-secret-for-cron-auth
```

---

## Implementation Phases

### Phase 1: Foundation (Day 1-2)
- [ ] `npx create-next-app@latest shopify-qbo-sync` (App Router, Tailwind, TypeScript)
- [ ] Install deps: `@shopify/shopify-api`, `node-quickbooks`, `intuit-oauth`, `@supabase/supabase-js`
- [ ] Create Supabase project (free tier)
- [ ] Run initial migration (schema above)
- [ ] Set up env vars
- [ ] Basic layout with sidebar: Dashboard, Payouts, Settings, Sync Log

### Phase 2: Shopify Integration (Day 3-4)
- [ ] `lib/shopify/client.ts` — REST client using access token
- [ ] `lib/shopify/payouts.ts` — fetch payouts by date range, with pagination
- [ ] `lib/shopify/orders.ts` — fetch order details for customer/company name
- [ ] `/api/shopify/sync` — pull payouts + transactions, store in DB
- [ ] `/payouts` page — list synced payouts with date filter
- [ ] `/payouts/[id]` page — show orders within a payout (table with amounts, fees, customer, company)

### Phase 3: QBO OAuth + Journal Entries (Day 5-7)
- [ ] `lib/qbo/auth.ts` — OAuth 2.0 flow (authorize URL, callback handler, token refresh)
- [ ] `/api/qbo/auth` — OAuth callback, store encrypted tokens
- [ ] `/settings` page — connect/disconnect QBO, select accounts (Shopify Fees expense, Bank account)
- [ ] `lib/qbo/client.ts` — authenticated QBO client with auto-refresh
- [ ] `lib/qbo/journal.ts` — create journal entry for a payout's fees
- [ ] `/api/qbo/journal` — endpoint to trigger journal entry creation
- [ ] Add "Create Journal Entry" button to payout detail page

### Phase 4: Invoice Matching + Payments (Day 8-10)
- [ ] `lib/qbo/invoices.ts` — query invoices by DocNumber (order number)
- [ ] `lib/qbo/payments.ts` — create Payment with LinkedTxn to invoice
- [ ] `/api/qbo/payment` — endpoint to create payment for a transaction
- [ ] Update payout detail page: show invoice match status, "Apply Payment" button
- [ ] Batch action: "Sync All" button that creates journal + applies all payments for a payout

### Phase 5: Automation + Polish (Day 11-14)
- [ ] `lib/sync/orchestrator.ts` — full pipeline: fetch → journal → match → pay
- [ ] `/api/cron/sync` — daily cron endpoint (secured with CRON_SECRET)
- [ ] `vercel.json` cron config
- [ ] Dashboard: KPI cards (payouts synced this month, fees recorded, payments applied, errors)
- [ ] Error handling: retry logic, clear error messages, manual retry button
- [ ] Sync log page with filterable history

---

## Sync Orchestrator Logic

```
async function syncPayout(shopifyPayoutId):
  1. GET /shopify_payments/balance/transactions?payout_id={id}
     → For each transaction where type = 'charge':
       a. GET /orders/{source_order_id}
       b. Extract: order_number, customer name, company name
       c. Store in payout_transactions table

  2. Create QBO Journal Entry:
     - Debit line per order: account = "Shopify Fees", amount = fee, description = "{order_number} - {company_name}"
     - Single credit line: account = Bank/Clearing, amount = total_fees
     → Store journal_entry_id on payout row

  3. For each payout_transaction:
     a. Query QBO: SELECT * FROM Invoice WHERE DocNumber = '{order_number}'
     b. If invoice found:
        - Store qbo_invoice_id
        - Create Payment: CustomerRef from invoice, TotalAmt = net, LinkedTxn → invoice
        - Store qbo_payment_id
     c. If no invoice: mark as 'no_invoice' (manual review needed)

  4. Log all actions to sync_log
```

---

## Key Decisions & Gotchas

### Shopify
- **Custom App, not OAuth** — this is a single-store tool, no need for app store listing
- **Payout != Order** — one payout contains many orders. Always query balance_transactions to get the breakdown
- **Refunds appear as separate transactions** — type = 'refund' with negative amounts. Handle gracefully.
- **Company name can be null** — not all customers enter a company at checkout. Fall back to customer name.
- **API version** — pin to a stable version (e.g., `2024-10`). Shopify deprecates old versions.

### QBO
- **Access tokens expire in 1 hour** — always check `token_expires_at` before API calls, refresh if needed
- **Refresh tokens expire in 100 days** — if the user doesn't use the app for 100 days, they must re-auth
- **Sandbox vs Production** — develop against sandbox first, switch `QBO_ENVIRONMENT` for prod
- **Invoice DocNumber match** — Shopify's native QBO integration creates invoices. The order number should appear as `DocNumber`. Verify this with the actual QBO data.
- **Journal Entry line items** — QBO requires balanced debits and credits. Each line needs an `AccountRef` and `PostingType` (Debit/Credit).
- **Payment LinkedTxn** — the `TxnType` must be exactly `"Invoice"` (capital I)
- **Rate limit** — 500 requests/minute. More than enough for this volume.
- **Minor units** — QBO uses decimal amounts (not pence). £489.07 = `489.07`.

### General
- **Idempotency** — always check if a journal entry / payment already exists before creating. Use `shopify_payout_id` and `shopify_transaction_id` as dedup keys.
- **Encryption** — never store tokens in plaintext. Use AES-256-GCM (same pattern as Distil).
- **Error isolation** — if one payment fails, continue with the rest. Don't let one bad order block the entire payout.
- **Audit trail** — log everything to `sync_log`. The user needs to trust the automation.

---

## QBO Account Setup (One-Time)

The user needs to create these accounts in QBO if they don't exist:

1. **"Shopify Fees"** — Type: Expense, Detail Type: "Bank Charges"
2. **"Shopify Clearing"** (optional) — Type: Other Current Asset, used if the bank deposit doesn't match 1:1 with individual order payments

The Settings page should let the user pick these from a dropdown populated by QBO's Chart of Accounts API.

---

## CLAUDE.md (for the new project)

When you create the project, include this as the root `CLAUDE.md`:

```markdown
# Shopify-QBO Fee Sync

## What This Is
Standalone tool that automates Shopify payout fee reconciliation with QuickBooks Online.
Pulls Shopify payouts → creates QBO journal entries for fees → matches invoices → applies payments.

## Tech Stack
Next.js 15 (App Router), Supabase, Tailwind, @shopify/shopify-api, node-quickbooks, intuit-oauth

## Hard Rules
- NEVER store tokens in plaintext — always encrypt with AES-256-GCM
- NEVER create duplicate journal entries — always check payout.journal_entry_id first
- NEVER create duplicate payments — always check payout_transaction.qbo_payment_id first
- ALL QBO API calls must check token expiry and refresh if needed
- TypeScript strict mode. No `any`.

## Key Patterns
- Shopify auth: Custom App access token (stored in env), not OAuth
- QBO auth: OAuth 2.0 (access token 1hr, refresh token 100 days)
- Sync is idempotent: re-running for the same payout is safe
- Errors are isolated: one failed payment doesn't block the rest

## Commands
npm run dev        # Dev server (port 3000)
npm run build      # Verify build
npm run lint       # ESLint

## Database
Supabase Postgres. Migrations in supabase/migrations/.
Tables: shopify_connections, qbo_connections, payouts, payout_transactions, sync_log

## Folder Guide
lib/shopify/    — Shopify API client + data fetchers
lib/qbo/        — QBO OAuth, journal entries, invoice queries, payments
lib/sync/       — Orchestrator that ties Shopify → QBO
app/api/        — API routes (shopify sync, qbo auth, qbo journal, qbo payment, cron)
app/payouts/    — Payout list + detail pages
app/settings/   — Connection management + account mapping
```

---

## Pre-Requisites Checklist (for the user to complete)

### Shopify Side
- [ ] Go to Shopify Admin → Settings → Apps and sales channels → Develop apps
- [ ] Click "Create an app", name it "QBO Fee Sync"
- [ ] Under "Configuration", set Admin API scopes: `read_shopify_payments_payouts`, `read_orders`
- [ ] Install the app → copy the Admin API access token (`shpat_...`)
- [ ] Note the store domain (e.g., `my-store.myshopify.com`)

### QBO Side
- [ ] Go to https://developer.intuit.com → create account (or sign in)
- [ ] Create a new app → select "QuickBooks Online and Payments"
- [ ] Note the Client ID and Client Secret from "Keys & credentials"
- [ ] Add redirect URI: `http://localhost:3000/api/qbo/auth` (dev) and your production URL later
- [ ] In QBO, ensure a "Shopify Fees" expense account exists (or create one)

### Supabase
- [ ] Create a new Supabase project (free tier) at https://supabase.com
- [ ] Copy: Project URL, anon key, service role key

### Local Dev
- [ ] Node.js 20+ installed
- [ ] Git installed
- [ ] Create project: `npx create-next-app@latest shopify-qbo-sync`
- [ ] Copy `.env.local.example` → `.env.local` and fill in all values

---
---

# APPENDIX A: Shopify API Reference

## A1. Create a Shopify Custom App

Custom Apps give you a stable Admin API access token scoped to a single store. This is the correct approach for a first-party integration (your own store), not a public app.

### Step-by-step

1. Log in to your Shopify Admin at `https://your-store.myshopify.com/admin`
2. Go to **Settings** (bottom-left gear icon)
3. Click **Apps and sales channels**
4. Click **Develop apps** (top-right). If you see "Allow custom app development" instead, click it and confirm -- this is a one-time enable step that requires the store owner.
5. Click **Create an app**
6. Enter a name (e.g. `QBO Sync`) and select yourself as the App developer
7. Click **Create app**
8. Click the **Configuration** tab
9. Under **Admin API integration**, click **Configure**
10. Select the required scopes (see table below)
11. Click **Save**
12. Go to the **API credentials** tab
13. Click **Install app** and confirm in the dialog
14. Your **Admin API access token** is shown once -- copy it immediately. It starts with `shpat_` and cannot be retrieved again.

### Required Scopes

| Scope | Purpose |
|---|---|
| `read_shopify_payments_payouts` | Access payout summaries and balance transactions (fees, charges, refunds) |
| `read_orders` | Access order details -- customer info, company name, line items |

These two scopes are the minimum required. No write scopes needed.

### Authentication

All API requests use:
```
Base URL: https://{store_domain}/admin/api/{api_version}/
Header:   X-Shopify-Access-Token: shpat_xxxxx
```

Pin to a stable API version (e.g., `2024-10`). Shopify supports each version for ~12 months.

---

## A2. Shopify API Endpoints

### List Payouts

```
GET /admin/api/2024-10/shopify_payments/payouts.json
```

**Query params:** `status`, `date_min`, `date_max`, `since_id`, `limit` (max 250)

**Example response:**

```json
{
  "payouts": [
    {
      "id": 854320017,
      "currency": "GBP",
      "amount": "2389.89",
      "status": "paid",
      "date": "2026-03-21",
      "summary": {
        "charges_fee_amount": "-67.43",
        "charges_gross_amount": "2457.32",
        "refunds_fee_amount": "0.00",
        "refunds_gross_amount": "0.00"
      }
    }
  ]
}
```

Key: `amount` = net deposit to bank. `summary.charges_fee_amount` = total Shopify fees (negative).

### Get Balance Transactions (per-order breakdown)

```
GET /admin/api/2024-10/shopify_payments/balance/transactions.json?payout_id=854320017
```

**Example response:**

```json
{
  "transactions": [
    {
      "id": 10295839001,
      "type": "charge",
      "source_order_id": 6192047382713,
      "amount": "845.94",
      "fee": "-23.84",
      "net": "822.10",
      "currency": "GBP",
      "payout_id": 854320017,
      "processed_at": "2026-03-19T14:23:07+00:00"
    },
    {
      "id": 10295839002,
      "type": "charge",
      "source_order_id": 6192047509841,
      "amount": "612.38",
      "fee": "-17.25",
      "net": "595.13",
      "currency": "GBP",
      "payout_id": 854320017,
      "processed_at": "2026-03-19T16:41:33+00:00"
    }
  ]
}
```

Key fields:
- `type` -- `charge`, `refund`, `dispute`, `adjustment`, etc.
- `source_order_id` -- use to fetch full order details
- `fee` -- Shopify fee for this specific order (always negative)
- Sum of all `net` values = payout `amount`

### Get Order Details (customer + company name)

```
GET /admin/api/2024-10/orders/6192047382713.json
```

**Example response (trimmed):**

```json
{
  "order": {
    "id": 6192047382713,
    "name": "#NCE1573",
    "order_number": 1573,
    "total_price": "845.94",
    "subtotal_price": "704.95",
    "total_tax": "140.99",
    "financial_status": "paid",
    "customer": {
      "first_name": "Mohamad",
      "last_name": "Chahine",
      "default_address": {
        "company": "Ristorante Roma"
      }
    },
    "billing_address": {
      "first_name": "Mohamad",
      "last_name": "Chahine",
      "company": "Ristorante Roma",
      "address1": "42 Dean Street",
      "city": "London",
      "zip": "W1D 4PZ",
      "country_code": "GB"
    }
  }
}
```

Key: `billing_address.company` is the business name. Can be null if customer didn't enter one -- fall back to customer name.

---

## A3. Shopify Rate Limits

| Detail | Value |
|---|---|
| Bucket size | 40 requests |
| Leak rate | 2 requests/second |
| Throttle response | `429 Too Many Requests` with `Retry-After` header |

Monitor via response header: `X-Shopify-Shop-Api-Call-Limit: 32/40`

For a daily sync of 5-50 orders, you will never hit these limits.

### Pagination

Shopify uses **cursor-based pagination** via `Link` headers. Use `limit=250` and follow `rel="next"` URLs. The `page_info` token is opaque -- don't parse it. For payouts, `since_id` pagination is simpler.

---
---

# APPENDIX B: QuickBooks Online API Reference

## B1. Intuit Developer App Setup

### Step-by-step

1. Go to [developer.intuit.com](https://developer.intuit.com) and sign up / sign in
2. Click **Create an app** -> select **QuickBooks Online and Payments**
3. Name it (e.g. `Shopify QBO Sync`)
4. Copy **Client ID** and **Client Secret** from Keys & credentials
5. Add redirect URIs:
   - Dev: `http://localhost:3000/api/qbo/auth`
   - Prod: `https://yourdomain.com/api/qbo/auth`

**Two sets of credentials:**

| Environment | Client ID/Secret | API Base URL |
|---|---|---|
| Sandbox | From "Development" tab | `https://sandbox-quickbooks.api.intuit.com` |
| Production | From "Production" tab | `https://quickbooks.api.intuit.com` |

### Required Scope

```
com.intuit.quickbooks.accounting
```

This single scope covers all accounting entities (journal entries, invoices, payments, accounts).

---

## B2. OAuth 2.0 Flow

```
1. User clicks "Connect to QuickBooks"
   -> Redirect to:
   https://appcenter.intuit.com/connect/oauth2
     ?client_id=ABc123
     &redirect_uri=http://localhost:3000/api/qbo/auth
     &response_type=code
     &scope=com.intuit.quickbooks.accounting
     &state=random-csrf-token

2. User signs in, selects company, clicks Connect
   -> Intuit redirects back:
   http://localhost:3000/api/qbo/auth
     ?code=AB11587...
     &state=random-csrf-token
     &realmId=4620816365188832070

3. Server exchanges code for tokens:
   POST https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer
   Headers:
     Authorization: Basic base64(client_id:client_secret)
     Content-Type: application/x-www-form-urlencoded
   Body:
     grant_type=authorization_code
     &code=AB11587...
     &redirect_uri=http://localhost:3000/api/qbo/auth

4. Response:
   {
     "access_token": "eyJlbmMi...",
     "refresh_token": "AB11734...",
     "expires_in": 3600,
     "x_refresh_token_expires_in": 8726400
   }

5. Store tokens + realmId in database (encrypted)
```

### Token Lifecycle

| Token | Lifetime | On Expiry |
|---|---|---|
| Access Token | **1 hour** | Refresh using refresh token |
| Refresh Token | **100 days** | User must re-authorize via OAuth |

**Critical:** Each refresh returns a NEW refresh token. The old one is invalidated immediately. Always save the new one.

### Refresh Request

```
POST https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer
Headers:
  Authorization: Basic base64(client_id:client_secret)
Body:
  grant_type=refresh_token&refresh_token=AB11734...
```

---

## B3. QBO API Endpoints

All calls use:
```
{baseUrl}/v3/company/{realmId}/{resource}
Headers:
  Authorization: Bearer {access_token}
  Content-Type: application/json
```

### Create Journal Entry (for Shopify fees)

```
POST /v3/company/{realmId}/journalentry
```

**Example: 5 orders' fees totalling 55.46:**

```json
{
  "DocNumber": "SHOPIFY-FEES-2026-03-24",
  "TxnDate": "2026-03-24",
  "PrivateNote": "Shopify fees for payout 24 Mar 2026 - 5 orders",
  "CurrencyRef": { "value": "GBP" },
  "Line": [
    {
      "DetailType": "JournalEntryLineDetail",
      "Amount": 11.20,
      "Description": "Shopify fee - Order #NCE1573 - Ristorante Roma",
      "JournalEntryLineDetail": {
        "PostingType": "Debit",
        "AccountRef": { "value": "92", "name": "Shopify Fees" }
      }
    },
    {
      "DetailType": "JournalEntryLineDetail",
      "Amount": 8.95,
      "Description": "Shopify fee - Order #NCE1574 - The Olive Kitchen",
      "JournalEntryLineDetail": {
        "PostingType": "Debit",
        "AccountRef": { "value": "92", "name": "Shopify Fees" }
      }
    },
    {
      "DetailType": "JournalEntryLineDetail",
      "Amount": 12.30,
      "Description": "Shopify fee - Order #NCE1575 - Cooper's Deli",
      "JournalEntryLineDetail": {
        "PostingType": "Debit",
        "AccountRef": { "value": "92", "name": "Shopify Fees" }
      }
    },
    {
      "DetailType": "JournalEntryLineDetail",
      "Amount": 9.50,
      "Description": "Shopify fee - Order #NCE1576 - Beirut Bites Ltd",
      "JournalEntryLineDetail": {
        "PostingType": "Debit",
        "AccountRef": { "value": "92", "name": "Shopify Fees" }
      }
    },
    {
      "DetailType": "JournalEntryLineDetail",
      "Amount": 13.51,
      "Description": "Shopify fee - Order #NCE1577 - Golden Dragon",
      "JournalEntryLineDetail": {
        "PostingType": "Debit",
        "AccountRef": { "value": "92", "name": "Shopify Fees" }
      }
    },
    {
      "DetailType": "JournalEntryLineDetail",
      "Amount": 55.46,
      "Description": "Total Shopify fees - payout 24 Mar 2026",
      "JournalEntryLineDetail": {
        "PostingType": "Credit",
        "AccountRef": { "value": "35", "name": "Current Account" }
      }
    }
  ]
}
```

**Rule:** Total debits (55.46) must equal total credits (55.46) or QBO returns error 6000.

**Response:** Returns `JournalEntry.Id` (e.g. `"176"`) -- store this for dedup.

### Query Invoices (find Shopify-created invoices)

```
GET /v3/company/{realmId}/query?query=SELECT * FROM Invoice WHERE DocNumber='NCE1573'
```

**Response:**

```json
{
  "QueryResponse": {
    "Invoice": [
      {
        "Id": "301",
        "DocNumber": "NCE1573",
        "TotalAmt": 489.07,
        "Balance": 489.07,
        "CustomerRef": { "value": "58", "name": "Ristorante Roma" }
      }
    ],
    "totalCount": 1
  }
}
```

Key: `Balance > 0` means unpaid. `CustomerRef.value` is needed for the Payment object.

### Create Payment (receive payment against invoice)

```
POST /v3/company/{realmId}/payment
```

**Example: apply payment to invoice NCE1573:**

```json
{
  "TotalAmt": 489.07,
  "TxnDate": "2026-03-24",
  "CustomerRef": { "value": "58" },
  "DepositToAccountRef": { "value": "35", "name": "Current Account" },
  "CurrencyRef": { "value": "GBP" },
  "PrivateNote": "Shopify payout - Order #NCE1573",
  "Line": [
    {
      "Amount": 489.07,
      "LinkedTxn": [
        { "TxnId": "301", "TxnType": "Invoice" }
      ]
    }
  ]
}
```

**Response:** Returns `Payment.Id` (e.g. `"412"`). After creation, the invoice `Balance` becomes 0.

**Multi-invoice payment:**

```json
{
  "TotalAmt": 950.00,
  "CustomerRef": { "value": "58" },
  "Line": [
    { "Amount": 489.07, "LinkedTxn": [{ "TxnId": "301", "TxnType": "Invoice" }] },
    { "Amount": 460.93, "LinkedTxn": [{ "TxnId": "302", "TxnType": "Invoice" }] }
  ]
}
```

---

## B4. `node-quickbooks` npm Package

```bash
npm install node-quickbooks
```

### Initialization

```typescript
import QuickBooks from 'node-quickbooks';

const qbo = new QuickBooks(
  process.env.QBO_CLIENT_ID,
  process.env.QBO_CLIENT_SECRET,
  accessToken,              // from DB
  false,                    // no token secret (OAuth2)
  realmId,                  // company ID from DB
  useSandbox,               // true for sandbox
  true,                     // debug logging
  null,                     // minor version
  '2.0',                    // OAuth version
  refreshToken              // from DB
);
```

### Key Methods

```typescript
// Journal entries
qbo.createJournalEntry(entry, (err, result) => { /* result.Id */ });

// Find invoices
qbo.findInvoices({ DocNumber: 'NCE1573' }, (err, result) => {
  const invoices = result.QueryResponse.Invoice;
});

// Create payment
qbo.createPayment(payment, (err, result) => { /* result.Id */ });

// Refresh token
qbo.refreshAccessToken((err, refreshedToken) => {
  // SAVE refreshedToken.access_token AND refreshedToken.refresh_token
});
```

### Promise Wrapper (callbacks -> async/await)

```typescript
function qboPromise<T>(method: Function, ...args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    method.call(qbo, ...args, (err: Error | null, result: T) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

// Usage
const result = await qboPromise(qbo.findInvoices.bind(qbo), { DocNumber: 'NCE1573' });
```

---

## B5. QBO Rate Limits & Error Handling

| Limit | Value |
|---|---|
| Requests | 500/minute per company |
| Concurrent | 10 simultaneous per company |

**Common errors:**

| Code | Meaning | Action |
|---|---|---|
| 3200 | Auth failed | Refresh token, re-auth if refresh fails |
| 6000 | Unbalanced journal entry | Fix debit/credit totals |
| 6140 | Duplicate DocNumber | Query existing entry first (idempotency check) |
| 2050 | Invalid account reference | Query accounts to find correct ID |
| 429 | Rate limited | Exponential backoff (1s, 2s, 4s, 8s) |

---
---

# APPENDIX C: Decision Log

| # | Decision | Rationale |
|---|---|---|
| 1 | Standalone app, not Distil extension | Distil is multi-tenant SaaS for accountants. This is single-store automation. ~15% code overlap. |
| 2 | Shopify Custom App, not OAuth | Single store = no need for app store listing or OAuth flow |
| 3 | `node-quickbooks` over direct API | Handles entity CRUD, token management. Callbacks easily wrapped to promises. |
| 4 | Supabase over local DB | Free tier, hosted Postgres, easy auth, encrypted token storage pattern proven in Distil |
| 5 | Journal entry per payout, not per order | One journal entry with N debit lines per payout. Cleaner in QBO, matches the bank deposit. |
| 6 | Payment amount = gross order amount (not net) | QBO invoices are for the full order amount. The fee is a separate expense via journal entry. |
| 7 | Daily cron sync, not webhook | Simpler. Webhooks would require public endpoint + verification. Daily is fine for this volume. |
