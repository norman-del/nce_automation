# Bill 818 — restoration steps for Norman

**Date:** 2026-05-07
**Bill in QBO:** Bill 818, Fresh Cleans, dated 2026-04-30
**Affected items:** 7 of the 14 lines on the bill

## What you'll see in QBO right now

Open Bill 818. Seven of the line items have **"(deleted)"** at the end of their item name. Those are the items that show as having no stock on your products list. The bill itself is fine — totals are correct, payments are unaffected. The "(deleted)" tag is QuickBooks' way of saying *"this item's been retired since you raised the bill"*.

The retired items have qty 0 and are hidden from the items list. There are **replacement items** (same SKU, same details) sitting in the active items list with qty 0. We need to point each affected bill line at its replacement. When you save the bill, QuickBooks recomputes inventory automatically — the replacement items receive the correct quantity from the bill, and the "(deleted)" tags disappear.

No inventory adjustment is needed. No accounting entries to redo. QuickBooks handles it from the bill edit alone.

## The 7 lines to change

For each line below, the item name in QBO ends in `(NCE6429) (deleted)`, `(NCE6434) (deleted)`, etc. — that's how you'll find them. Replace each with the matching active item.

| Line | Old item (with "(deleted)") | Replace with (active) |
|---|---|---|
| 1 | Stainless Steel Table On Wheels With Ambient Gatronorm Rack Above And Appliance Space 120x65cm **(NCE6429) (deleted)** | Same name without "(deleted)" — pick the **NCE6429** that's active |
| 2 | Stainless Steel Table On Wheels 80x65cm **(NCE6434) (deleted)** | Active **NCE6434** |
| 3 | Stainless Steel Table With Appliance Space 195x70cm **(NCE6435) (deleted)** | Active **NCE6435** |
| 4 | Stainless Steel Table With Two Lover Shelves, Angled Corners 153x50cm **(NCE6436) (deleted)** | Active **NCE6436** |
| 5 | Stainless Steel Table With Two Lower Shelves 175x70cm **(NCE6437) (deleted)** | Active **NCE6437** |
| 6 | Stainless Steel Large Wash Hand Basin With New Lever Taps **(NCE6438) (deleted)** | Active **NCE6438** |
| 7 | Stainless Steel Large Hand Wash Basin With New Lever Taps **(NCE6439) (deleted)** | Active **NCE6439** |

The other 7 lines on Bill 818 are fine — leave them alone.

## Step-by-step

For each of the 7 lines:

1. In Bill 818, click the **Product/Service** field on the line.
2. Clear the current entry. Type `NCE6429` (or whichever SKU matches the line).
3. Two results may appear. Pick the one **without "(deleted)"** at the end. Quickbooks may only show the active one — if so, that's the one.
4. Quantity, unit cost, and amount on the line should stay the same as before. Don't change them.
5. Move to the next line.

Once all 7 lines are repointed, click **Save** at the bottom of the bill.

## How to verify it worked

After saving:

1. Re-open Bill 818. None of the line items should say "(deleted)" any more.
2. Open the Products list on the dashboard. The 7 SKUs (6429, 6434, 6435, 6436, 6437, 6438, 6439) should now show the same stock quantity they had on the bill.
3. The retired items will still exist in QBO under "inactive items" but no transaction references them — they're effectively archived.

## What we changed in the dashboard so this doesn't happen again

The button on each product page that read **"Re-push to Shopify & QBO"** has been split:

- **"Re-push to Shopify"** (orange) — safe. Rebuilds only the Shopify product. Use this when a Shopify push got stuck.
- **"Recreate QuickBooks item…"** (red) — destructive. This is the one that caused this incident. It now opens a warning that explains the consequences in plain English and forces you to type the SKU to confirm. It also refuses to run if the QuickBooks item already has stock against it.

For day-to-day product edits — price, vendor, photos, description — keep using the **Edit** page. It updates QuickBooks in place without retiring the item.

## If something looks wrong after you save

Don't make a second edit. Message Gus with a screenshot of the bill and the products list and we'll work it out together. The change is reversible — you can re-edit the bill and switch the lines back if needed.
