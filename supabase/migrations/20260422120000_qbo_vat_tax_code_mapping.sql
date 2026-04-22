-- QBO VAT tax code mapping — replaces the brittle name-search in lib/qbo/items.ts
-- with explicit per-connection tax code IDs. See docs/plans/now-vs-strategic.md §5 Bug 1.
--
-- Background: the old code picked the first tax code whose name contained "20", which
-- matched "20.0% ECG" (EC Goods Standard — inactive, hidden) before the correct
-- "20.0% S" (Standard). Every product created since used an inactive code → QBO UI
-- showed VAT dropdowns blank. Same issue for the Margin code when used as purchase
-- tax (it has no purchase rate defined).

alter table qbo_connections
  add column if not exists vat_standard_tax_code_id        text,
  add column if not exists vat_margin_sale_tax_code_id     text,
  add column if not exists vat_margin_purchase_tax_code_id text;

comment on column qbo_connections.vat_standard_tax_code_id is
  'QBO TaxCode.Id used for both sale and purchase on items with vat_applicable=true (20% standard-rated).';
comment on column qbo_connections.vat_margin_sale_tax_code_id is
  'QBO TaxCode.Id used for the sales tax on margin-scheme items (second-hand goods).';
comment on column qbo_connections.vat_margin_purchase_tax_code_id is
  'QBO TaxCode.Id for purchase tax on margin-scheme items. Usually NULL — UK margin scheme has no reclaimable purchase VAT.';

-- Seed the known production realm with values captured from
-- scripts/dump-qbo-tax-codes.mjs on 2026-04-22:
--   id=5  "20.0% S"  — active, both rates defined
--   id=18 "Margin"   — active, sales rate only
--   id=9  "No VAT"   — active, used for margin purchases (explicit "no VAT applicable")
update qbo_connections
   set vat_standard_tax_code_id        = '5',
       vat_margin_sale_tax_code_id     = '18',
       vat_margin_purchase_tax_code_id = '9'
 where realm_id = '9130350116981876';
