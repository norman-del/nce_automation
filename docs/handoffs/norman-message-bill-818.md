# Draft message for Norman — Bill 818 incident

(Gus to send. Plain English. Sign as Gus.)

---

Hi Norm,

Got to the bottom of the Bill 818 issue. The good news: nothing is lost and the bill itself is fine — totals, payments, and accounts are all correct. What's wrong is cosmetic on the surface and recoverable in 5 minutes.

**What happened.** The button on the product page labelled "Re-push to Shopify & QBO" did more than its name suggests. When you click it, it retires the existing QuickBooks item and creates a brand-new one in its place. That's harmless if the item has never been bought or sold — but if it has been on a bill (which the 7 affected items had, on Bill 818), QuickBooks does two things automatically: it writes the stock down to zero against the Inventory Shrinkage account, and it appends "(deleted)" to the line on every transaction that mentioned the old item. That's why those bill lines look broken and the products show no stock.

That's on us. The button name doesn't tell you any of that.

**The fix on your side — about 5 minutes.** Open Bill 818. Seven of the lines have "(deleted)" at the end of the item name. For each of those lines, click the item field, type the SKU (NCE6429, NCE6434, NCE6435, NCE6436, NCE6437, NCE6438, NCE6439), and pick the active match (the one *without* "(deleted)"). Don't change quantity, cost, or amount on the line — leave those exactly as they were. Save the bill at the bottom.

When you save, QuickBooks recomputes inventory automatically: the new items receive the bill quantities, the "(deleted)" tags disappear, and the products page shows correct stock. No journal entries to redo, no manual adjustments needed. There's a step-by-step doc in the repo at `docs/handoffs/bill-818-restoration-2026-05-07.md` if you want a reference.

**What we changed in the dashboard.** That single button has been split:

- **Re-push to Shopify** (orange) — safe. Rebuilds only the Shopify product. No effect on QuickBooks.
- **Recreate QuickBooks item…** (red) — destructive. Now opens a warning that explains exactly what it does, refuses to run if the item already has stock, and asks you to type the SKU to confirm.

For everyday edits — price, vendor, photos, description — keep using the **Edit** page. It updates QuickBooks in place without retiring the item. We've checked the Edit page code carefully and confirmed it can't cause this problem.

**Going forward.** Do the bill edit whenever you have a moment. There's no rush — the bill is correct on paper, this is just to clean up the display and put stock on the right items. Ping me if anything looks off after you save and we'll work through it together.

We've also done a wider audit of every button in the dashboard that talks to QuickBooks, Shopify, or Stripe and put guards on the dangerous ones. Full list and follow-up work in `docs/audits/destructive-actions-2026-05-07.md`.

Sorry for the fright.

Gus
