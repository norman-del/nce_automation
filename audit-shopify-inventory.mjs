// Read-only audit: find every Shopify product whose variant has
// inventory_management != 'shopify'. Writes results to audit-inventory-broken.csv.
// Run with: node --env-file=.env.local audit-shopify-inventory.mjs

import { writeFileSync } from 'node:fs'

const domain = process.env.SHOPIFY_STORE_DOMAIN
const token = process.env.SHOPIFY_ACCESS_TOKEN
if (!domain || !token) {
  console.error('Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_ACCESS_TOKEN in .env.local')
  process.exit(1)
}

const BASE = `https://${domain}/admin/api/2024-10`
const FIELDS = 'id,title,status,created_at,variants'

async function fetchPage(pageInfo) {
  const qs = pageInfo
    ? `limit=250&page_info=${encodeURIComponent(pageInfo)}`
    : `limit=250&fields=${FIELDS}`
  const r = await fetch(`${BASE}/products.json?${qs}`, {
    headers: { 'X-Shopify-Access-Token': token },
  })
  if (!r.ok) throw new Error(`Shopify ${r.status}: ${await r.text()}`)
  const body = await r.json()
  // Extract next page_info from Link header
  const link = r.headers.get('link') || ''
  const nextMatch = link.match(/<([^>]+)>;\s*rel="next"/)
  let next = null
  if (nextMatch) {
    const u = new URL(nextMatch[1])
    next = u.searchParams.get('page_info')
  }
  return { products: body.products, next }
}

function csvEscape(s) {
  if (s == null) return ''
  const str = String(s)
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

const broken = []
const stats = { total: 0, tracked: 0, untracked: 0, draftUntracked: 0, activeUntracked: 0 }

let next = null
let page = 0
do {
  page++
  const { products, next: n } = await fetchPage(next)
  next = n
  for (const p of products) {
    stats.total++
    const v = p.variants?.[0]
    if (!v) continue
    if (v.inventory_management === 'shopify') {
      stats.tracked++
    } else {
      stats.untracked++
      if (p.status === 'draft') stats.draftUntracked++
      if (p.status === 'active') stats.activeUntracked++
      broken.push({
        shopify_product_id: p.id,
        variant_id: v.id,
        sku: v.sku,
        status: p.status,
        created_at: p.created_at,
        inventory_management: v.inventory_management,
        inventory_policy: v.inventory_policy,
        inventory_quantity: v.inventory_quantity,
        title: p.title,
      })
    }
  }
  console.log(`page ${page}: ${products.length} products (running total: ${stats.total})`)
  // gentle pacing — Shopify REST is 2 req/sec
  await new Promise(r => setTimeout(r, 600))
} while (next)

console.log('\n=== summary ===')
console.log(stats)

const header = 'shopify_product_id,variant_id,sku,status,created_at,inv_mgmt,inv_policy,inv_qty,title\n'
const rows = broken
  .map(b => [
    b.shopify_product_id, b.variant_id, csvEscape(b.sku), b.status,
    b.created_at, b.inventory_management ?? '', b.inventory_policy ?? '',
    b.inventory_quantity ?? '', csvEscape(b.title),
  ].join(','))
  .join('\n')
writeFileSync('audit-inventory-broken.csv', header + rows + '\n')
console.log(`wrote audit-inventory-broken.csv (${broken.length} rows)`)

// Breakdown by status
const byStatus = {}
for (const b of broken) {
  byStatus[b.status] = (byStatus[b.status] || 0) + 1
}
console.log('by status:', byStatus)

// Any with negative qty?
const negative = broken.filter(b => (b.inventory_quantity ?? 0) < 0)
console.log(`negative inventory count: ${negative.length}`)
if (negative.length) console.log(negative.slice(0, 5).map(b => ({ sku: b.sku, qty: b.inventory_quantity })))
