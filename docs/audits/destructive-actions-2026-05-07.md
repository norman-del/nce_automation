# Destructive-action audit — nce_automation dashboard

**Date:** 2026-05-07
**Trigger:** Bill 818 incident — the "Re-push to Shopify & QBO" button silently retired 7 inventory items in QBO and orphaned a supplier bill. Root cause: a destructive UI action whose label did not match its blast radius. Fix: split the button + typed-SKU confirm modal + server-side QtyOnHand precheck.

This audit lists every UI button in the dashboard that mutates production state in QuickBooks, Shopify, or Stripe — anything outside Supabase that we cannot quietly roll back. It classifies each by blast radius and recommends a guard.

## Scope

- External-mutation buttons only. Pure Supabase writes are recoverable from backups and excluded.
- CRON endpoints excluded (no UI surface).
- Read-only debug endpoints excluded.

## Risk taxonomy

- **Critical** — irreversible without manual external work; can break audit trail or financial records.
- **High** — reversible but expensive in time / requires external admin login.
- **Medium** — reversible from the dashboard itself.
- **Low** — minimal blast radius.

## Inventory

| # | Risk | Page | Button label | Endpoint | What it does externally | Current guard | Recommended |
|---|---|---|---|---|---|---|---|
| 1 | **Critical** | Product detail | Recreate QuickBooks item… | `POST /api/products/[id]/repush` | Deactivates QBO item (auto-zeroes QtyOnHand to Shrinkage), creates a fresh item, orphans bills/invoices to the old item | **As of 2026-05-07:** typed-SKU confirm modal + server-side refusal if QtyOnHand > 0 + sync_log entry on every run | ✅ Done |
| 2 | **Critical** | Order detail | Refund | `POST /api/orders/[id]/refund` | Issues Stripe refund on payment intent, marks order refunded | `window.confirm()` only | Custom modal showing amount + order # + customer name; admin-only role check already enforced server-side |
| 3 | **High** | Product detail | Re-push to Shopify | `POST /api/products/[id]/repush-shopify` | Deletes Shopify product and re-creates it (does NOT touch QBO) | None — fires immediately | Lightweight `confirm()` with the product title; reversible (we can re-create), so a modal is overkill but a one-line confirm prevents fat-finger |
| 4 | **High** | Product detail | Delete Product | `DELETE /api/products/[id]` | Deletes Supabase row, deactivates QBO item, deletes Shopify product | Two-step modal (click + confirm) | Add typed-SKU match (same pattern as #1). Same shape of irreversibility — once QBO is deactivated, recovery requires manual bill repointing |
| 5 | **High** | Order detail | Sync to QBO | `POST /api/sync/order-to-qbo/[orderId]` | If `QBO_SALES_SYNC_ENABLED=true`: creates QBO customer + invoice + payment | None — fires immediately | Currently flag-gated to dry-run. Safe today. If/when the flag flips, must add a "this will post to QBO" confirm |
| 6 | **High** | Finance → Payout | Post to QuickBooks / Re-post | `POST /api/sync/[payoutId]` | Creates a QBO journal entry + payment records for the payout | Idempotent (won't double-post), but no UI confirm | Add a one-line confirm with payout amount and date |
| 7 | **Medium** | Product detail | Retry Sync | `POST /api/products/[id]/retry-sync` | Creates Shopify product + QBO item *if not yet synced*; idempotent on already-synced items | None | Acceptable as-is. The route refuses to recreate if already synced |
| 8 | **Medium** | Product detail | Adjust stock | `POST /api/products/[id]/stock` | Supabase only today; Phase 1/2 plans push to QBO | None | Once QBO sync is wired (Phase 1+), add a confirm modal — and gate behind sign-off per the existing inventory guardrail |
| 9 | **Medium** | Order detail | Mark cancelled | `PATCH /api/orders/[id]/status` | Updates Supabase, fires cancellation email to customer | None | Add custom confirm — emails are user-visible and not retractable |
| 10 | **Medium** | Order detail | Mark processing/shipped/delivered | `PATCH /api/orders/[id]/status` | Updates Supabase, triggers no email today | None | Acceptable — silently reversible by clicking the prior state |
| 11 | **Low** | Settings → Connections | Disconnect QuickBooks | `POST /api/qbo/disconnect` | Truncates `qbo_connections` (Supabase only); next request to QBO will 401 | Two-step modal | Acceptable. Already documented recovery path (settings → reconnect) |
| 12 | **Low** | Settings → Connections | Disconnect Shopify | `POST /api/shopify/disconnect` | Truncates `shopify_connections` (Supabase only) | Two-step modal | Acceptable |
| 13 | **Low** | Finance → Payouts | Sync Payouts | `POST /api/shopify/sync` | Pulls Shopify payouts into Supabase (no external write) | None | Fine — read-only against Shopify |

## Patterns to standardise

To stop this issue happening again, every destructive action should match one of these patterns:

1. **Reversible with no external side-effects** → no confirm needed. (status transitions excluding cancel/refund.)
2. **Reversible only from another dashboard / external admin** → custom modal with one-line plain-English summary of what happens, plus a Cancel button. Default focus on Cancel.
3. **Irreversible without manual external accounting work** → modal that:
   - Names the consequence in plain English (no jargon, no "QBO entity", no "soft delete").
   - Lists what the user must do externally to undo (or says "cannot be undone").
   - Requires a typed-SKU/order-#/payout-# match to enable the confirm button.
   - Server-side refusal if state precludes safe execution (e.g. QtyOnHand > 0 for item recreation).
   - Logs every successful run to `sync_log` with `action: <verb>_destructive`.

The Recreate-QuickBooks-Item modal shipped today (2026-05-07) is the reference implementation.

## Standing checklist for new destructive actions

When adding any UI button or endpoint that mutates external state:

- [ ] Read this audit. Place the new action in the table.
- [ ] If it's pattern (3), write the modal first, the endpoint second.
- [ ] Add a server-side precheck that refuses if state is unsafe.
- [ ] Add a `sync_log` audit row on every run (success or partial).
- [ ] Update this doc in the same PR.

## Follow-ups (not done in this PR)

- (#2) Refund modal upgrade — replace `window.confirm()` with custom dialog, show amount.
- (#3) Re-push-Shopify confirm — one-line confirm with product title.
- (#4) Delete-Product typed-SKU match.
- (#6) Post-to-QuickBooks confirm — show payout amount and date.
- (#9) Mark-cancelled confirm — modal with customer name, since email fires.

These are bounded changes. The pattern from #1 transfers directly. Estimated 2-3 hours total to ship them all.
