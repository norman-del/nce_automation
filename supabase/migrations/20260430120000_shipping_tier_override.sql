-- Add manual shipping tier override.
-- shipping_tier remains the auto-calculated value from dimensions/weight.
-- shipping_tier_override (nullable) holds an operator-set override; when present,
-- consumers (Shopify push, list, search, dashboard) should use it instead of
-- shipping_tier. NULL means "use the auto value".
--
-- Use case: a 1.8m table is calculated as Double Pallet by footprint, but ships
-- on a Single Pallet upright. Operator picks Single Pallet from a dropdown and
-- the override sticks.

alter table public.products
  add column if not exists shipping_tier_override smallint null
    check (shipping_tier_override is null or shipping_tier_override in (0, 1, 2));

comment on column public.products.shipping_tier_override is
  'Operator-set shipping tier override (0=Parcel, 1=Single Pallet, 2=Double Pallet). NULL means use shipping_tier (auto-calculated).';
