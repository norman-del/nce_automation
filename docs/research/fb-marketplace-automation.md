# Facebook Marketplace Automation Research

**Date:** 2026-04-06
**NotebookLM Notebook:** `4c7ab3f4-7fc0-44aa-8c29-21a64518528e`
**Full Report (Google Docs):** https://docs.google.com/document/d/1tVpjea_MiLyrYp8MvqU3d7D9IV35kIU7MGzV9PO3O6o

## Context

NCE sells catering equipment. Currently lists on Shopify + QBO. Want to add Facebook Marketplace (and later eBay) as additional channels. UK businesses can't list on Marketplace as a business — must use personal account then share to business page.

## Key Findings

### No Public API

Meta's Commerce Platform API exists but is **partner-restricted** (Shopify, BigCommerce etc. only). No self-service access for individual businesses.

### Viable Methods

| Method | Risk | Notes |
|---|---|---|
| **Semi-automated (pre-format + manual post)** | None | Best for us — AI generates listing content, human posts |
| **Facebook Bulk CSV Upload** | None | Native "Create Multiple Listings" — CSV with product data. Known to glitch with titles/prices |
| **ZeeDrop** | Low-Moderate | Bulk Shopify-to-FB migration. Works for non-USA accounts |
| **List Perfectly / Nifty** | Low-Moderate | Cross-listers that copy data between platforms. Require human to click "submit" |
| **AutoDS** | Moderate | Dropshipping helper with Marketplace extension |
| **Lazy Poster** | Moderate | Automated bulk posting software — ToS violation |
| **Browser automation (Playwright/Selenium)** | **High** | Meta enforcement tightened mid-2025. Bans reported frequently |

### Recommended Approach: Hybrid CSV-AI

1. **Export from Supabase** — generate listing content from product data
2. **AI formatting** — Claude maps fields to FB Marketplace CSV template, assigns correct FB categories
3. **Bulk CSV upload** — upload to Marketplace (photos still need manual attachment in many cases)
4. **Track status** — add `marketplace_listed` flag to products table

### Claude Code / AI Agent Role

- **Data prep**: Generate optimised titles, SEO descriptions from product data
- **Category mapping**: Research and assign correct FB Marketplace categories
- **Price research**: Sub-agents research competitive pricing in parallel
- **Listing assistant page**: Build `/products/[id]/marketplace` with copy-paste-friendly format

## YouTube Sources (in NotebookLM)

1. Dave Swift — "I'm Selling 100 Items on Facebook Marketplace Using AI"
2. AutoDS — "How To Sell On Facebook Marketplace In 2026"
3. Rapide Tuto — "How to Import Products From Shopify To Facebook Marketplace (2026)"
4. Learn Ecom — "How to Upload THOUSANDS of Products to Facebook Marketplace & Facebook Shop"
5. ZeeDrop — "Bulk From Shopify/Woo To Facebook Marketplace"
6. Michal Specian — "Claude Cowork is INSANELY good for Sellers"
7. RockstarFlipper — "Ebay to Facebook Marketplace & Shopify FAST SELLING"
8. KayWayShop — "The BEST TOOL for your Reselling Business! Nifty Crosslister"
9. eCommerce Clips — "How to Upload Bulk Spreadsheets to Facebook Marketplace"
10. The Lazy Poster — "How To Bulk Post On Facebook Marketplace"

## Next Steps

- [ ] Build listing assistant page (`/products/[id]/marketplace`)
- [ ] Add `marketplace_listed` + `marketplace_listed_at` to products table
- [ ] Investigate Facebook Bulk CSV template format
- [ ] Evaluate ZeeDrop for direct Shopify-to-FB sync
- [ ] Later: add eBay channel with similar approach
