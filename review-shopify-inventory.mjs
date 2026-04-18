// READ-ONLY. Produces inventory-review.csv with three groups for the owner to
// review before any changes are applied:
//
//   Group A — "Sold, should be hidden": used/single-unit items that appear in
//             paid, non-refunded, non-cancelled Shopify orders but still show
//             stock > 0.
//   Group B — "Possibly drop-ship": items from typical drop-ship vendors
//             (Prodis, Combisteel) or with sentinel qty (>= 100), where
//             tracking may have been deliberately off before Apr 14.
//   Group C — no action needed. Not included in CSV to reduce noise.
//
// Writes nothing to Shopify. Safe to run any time.
//
// Usage: node --env-file=.env.local review-shopify-inventory.mjs

import { writeFileSync } from 'node:fs'

const domain = process.env.SHOPIFY_STORE_DOMAIN
const token = process.env.SHOPIFY_ACCESS_TOKEN
if (!domain || !token) {
  console.error('Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_ACCESS_TOKEN')
  process.exit(1)
}
const BASE = `https://${domain}/admin/api/2024-10`
const H = { 'X-Shopify-Access-Token': token }

const DROPSHIP_VENDORS = new Set(['Prodis', 'Combisteel'])
const SENTINEL_QTY = 100 // qty >= this suggests "unlimited" placeholder

// ---- helpers --------------------------------------------------------------
async function j(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, { headers: H })
    if (r.ok) {
      const link = r.headers.get('link') || ''
      const m = link.match(/<([^>]+)>;\s*rel="next"/)
      const next = m ? new URL(m[1]).searchParams.get('page_info') : null
      return { body: await r.json(), next }
    }
    if (r.status === 429) {
      await new Promise(r => setTimeout(r, 2000))
      continue
    }
    throw new Error(`${r.status}: ${await r.text()}`)
  }
  throw new Error('retries exhausted')
}

function csvEscape(v) {
  if (v == null) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function isUsedTag(tags) {
  if (!tags) return false
  const list = tags.toLowerCase().split(',').map(s => s.trim())
  return list.includes('used')
}

// NCE tags every single-unit refurb item with "(NCExxxx)" in the title.
// That's the strongest single-unit-inventory signal we have.
function isNceSingleUnit(title) {
  return typeof title === 'string' && /\(NCE\d+\)/i.test(title)
}

// ---- 1. Pull all products + variants + tags ------------------------------
console.log('fetching all products...')
const products = []
let next = null
let page = 0
do {
  page++
  const url = next
    ? `${BASE}/products.json?limit=250&page_info=${encodeURIComponent(next)}`
    : `${BASE}/products.json?limit=250&fields=id,title,status,tags,vendor,product_type,variants`
  const { body, next: n } = await j(url)
  next = n
  for (const p of body.products) products.push(p)
  console.log(`  products page ${page}: ${body.products.length} (running ${products.length})`)
  await new Promise(r => setTimeout(r, 500))
} while (next)

// Index by variant_id for fast order cross-ref
const byVariant = new Map()
for (const p of products) {
  for (const v of p.variants || []) {
    byVariant.set(v.id, { product: p, variant: v })
  }
}

// ---- 2. Pull paid, non-cancelled orders from the last 12 months ----------
console.log('\nfetching orders (last 12 months)...')
const sinceIso = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString()
const orders = []
next = null
page = 0
do {
  page++
  const url = next
    ? `${BASE}/orders.json?limit=250&page_info=${encodeURIComponent(next)}`
    : `${BASE}/orders.json?limit=250&status=any&created_at_min=${sinceIso}&fields=id,name,created_at,financial_status,cancelled_at,refunds,line_items`
  const { body, next: n } = await j(url)
  next = n
  for (const o of body.orders) orders.push(o)
  console.log(`  orders page ${page}: ${body.orders.length} (running ${orders.length})`)
  await new Promise(r => setTimeout(r, 500))
} while (next)

// ---- 3. Build "net sold" map per variant ---------------------------------
// Net sold = sum(line_item.quantity) - sum(refund line quantity) for each variant.
const netSold = new Map() // variant_id -> { qty, lastOrderName, lastOrderDate }
for (const o of orders) {
  if (o.cancelled_at) continue
  const refundedByLineItem = new Map()
  for (const r of o.refunds || []) {
    for (const rli of r.refund_line_items || []) {
      refundedByLineItem.set(rli.line_item_id, (refundedByLineItem.get(rli.line_item_id) || 0) + rli.quantity)
    }
  }
  for (const li of o.line_items || []) {
    if (!li.variant_id) continue
    const refundedQty = refundedByLineItem.get(li.id) || 0
    const net = li.quantity - refundedQty
    if (net <= 0) continue
    const cur = netSold.get(li.variant_id) || { qty: 0, lastOrderName: null, lastOrderDate: null }
    cur.qty += net
    if (!cur.lastOrderDate || o.created_at > cur.lastOrderDate) {
      cur.lastOrderDate = o.created_at
      cur.lastOrderName = o.name
    }
    netSold.set(li.variant_id, cur)
  }
}

// ---- 4. Classify -----------------------------------------------------------
const groupA = [] // sold & still in stock (used/single-unit only)
const groupB = [] // drop-ship candidates

for (const p of products) {
  const v = p.variants?.[0]
  if (!v) continue
  const qty = v.inventory_quantity ?? 0
  const used = isUsedTag(p.tags)
  const dropshipVendor = DROPSHIP_VENDORS.has(p.vendor)
  const sentinel = qty >= SENTINEL_QTY
  const sold = netSold.get(v.id)

  // Group A: single-unit items (used tag OR "(NCExxxx)" in title) that were
  // sold and still show stock. These are the "ghosts" — sold but still visible.
  const singleUnit = used || isNceSingleUnit(p.title)
  if (singleUnit && sold && sold.qty > 0 && qty > 0) {
    // Distinguish ghosts (sold >= shown stock, likely single-unit never
    // decremented) from consumables (qty >> sold, genuine multi-unit stock).
    let priority, action
    if (sold.qty >= qty) {
      priority = 'A1-likely-ghost'
      action = 'set qty = 0 (sold at least as many as shown)'
    } else if (qty <= 2) {
      priority = 'A2-possible-ghost'
      action = 'check: is qty accurate or was this never decremented?'
    } else {
      priority = 'A3-likely-consumable'
      action = 'probably fine — multi-unit stock (qty much larger than sold count)'
    }
    groupA.push({
      group: priority,
      sku: v.sku,
      title: p.title,
      vendor: p.vendor,
      shopify_qty: qty,
      net_sold: sold.qty,
      last_order: sold.lastOrderName,
      last_order_date: sold.lastOrderDate?.slice(0, 10),
      proposed_action: action,
      shopify_product_id: p.id,
      variant_id: v.id,
    })
    continue
  }

  // Group B: drop-ship or sentinel stock — may have been intentionally untracked
  if (dropshipVendor || sentinel) {
    groupB.push({
      group: 'B-dropship-review',
      sku: v.sku,
      title: p.title,
      vendor: p.vendor,
      shopify_qty: qty,
      net_sold: sold?.qty || 0,
      last_order: sold?.lastOrderName || '',
      last_order_date: sold?.lastOrderDate?.slice(0, 10) || '',
      proposed_action: dropshipVendor ? 'confirm: still held in stock? if drop-ship, untick "track quantity"' : 'confirm: is qty=9999 intentional?',
      shopify_product_id: p.id,
      variant_id: v.id,
    })
  }
}

// Sort: Group A by oldest order date first (most urgent), Group B by vendor
groupA.sort((a, b) => (a.last_order_date || '').localeCompare(b.last_order_date || ''))
groupB.sort((a, b) => (a.vendor || '').localeCompare(b.vendor || ''))

// ---- 5. Write CSV ---------------------------------------------------------
const header = 'group,sku,title,vendor,shopify_qty,net_sold,last_order,last_order_date,proposed_action,shopify_product_id,variant_id'
const lines = [header]
for (const r of [...groupA, ...groupB]) {
  lines.push([
    r.group, r.sku, r.title, r.vendor, r.shopify_qty, r.net_sold,
    r.last_order, r.last_order_date, r.proposed_action,
    r.shopify_product_id, r.variant_id,
  ].map(csvEscape).join(','))
}
writeFileSync('inventory-review.csv', lines.join('\n') + '\n')

console.log('\n=== summary ===')
console.log(`products scanned:            ${products.length}`)
console.log(`orders scanned (last 12mo):  ${orders.length}`)
console.log(`Group A (sold used, qty>0):  ${groupA.length}`)
console.log(`Group B (drop-ship review):  ${groupB.length}`)
console.log(`\nwrote inventory-review.csv`)
