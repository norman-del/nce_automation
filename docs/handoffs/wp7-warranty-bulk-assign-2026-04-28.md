# WP-7 Warranty Bulk-Assign — 2026-04-28

## Pre-state

| warranty_term_code | count |
|---|---|
| NULL | 2394 |
| manufacturer_combisteel_2yr | 1 |

## SQL applied (single transaction)

```sql
BEGIN;

-- 2a. All used items default to 14-day returns policy.
UPDATE products
SET warranty_term_code = 'used_14_day_returns'
WHERE status='active' AND condition='used' AND warranty_term_code IS NULL;
-- Rows updated: 1447

-- 2b. All Combisteel new items: 2yr manufacturer warranty.
UPDATE products
SET warranty_term_code = 'manufacturer_combisteel_2yr'
WHERE status='active' AND condition='new'
  AND LOWER(vendor) = 'combisteel'
  AND warranty_term_code IS NULL;
-- Rows updated: 18

COMMIT;
```

## Post-state

| warranty_term_code | count |
|---|---|
| used_14_day_returns | 1447 |
| NULL | 929 |
| manufacturer_combisteel_2yr | 19 |

Total active: 2395 (matches pre-state).

929 non-Combisteel new items remain NULL by design — storefront falls back to "Standard returns policy applies" rather than risk misrepresentation.
