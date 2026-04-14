// Remediation: patch Shopify variants to enable inventory_management='shopify'
// and inventory_policy='deny'. Reads audit-inventory-broken.csv as the work list.
//
// Defaults to --dry-run (no writes). Use --apply to actually patch.
// Use --status=draft|active|all to scope (default: all).
// Use --limit=N to cap number of products (default: no limit).
//
// Examples:
//   node --env-file=.env.local fix-shopify-inventory.mjs                # dry-run all
//   node --env-file=.env.local fix-shopify-inventory.mjs --status=draft # dry-run drafts only
//   node --env-file=.env.local fix-shopify-inventory.mjs --status=draft --apply
//   node --env-file=.env.local fix-shopify-inventory.mjs --status=active --limit=1 --apply

import { readFileSync } from 'node:fs'

const args = new Set(process.argv.slice(2))
const getArg = (name, def) => {
  for (const a of args) {
    if (a.startsWith(`${name}=`)) return a.slice(name.length + 1)
  }
  return def
}

const APPLY = args.has('--apply')
const STATUS = getArg('--status', 'all') // draft|active|all
const LIMIT = parseInt(getArg('--limit', '0'), 10) || Infinity

const domain = process.env.SHOPIFY_STORE_DOMAIN
const token = process.env.SHOPIFY_ACCESS_TOKEN
if (!domain || !token) {
  console.error('Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_ACCESS_TOKEN in .env.local')
  process.exit(1)
}
const BASE = `https://${domain}/admin/api/2024-10`

// --- Parse CSV --------------------------------------------------------------
function parseCsv(text) {
  const lines = text.trim().split('\n')
  const header = lines.shift().split(',')
  const rows = []
  for (const line of lines) {
    // naive CSV parser w/ quoted field support
    const out = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
        else if (c === '"') { inQ = false }
        else { cur += c }
      } else {
        if (c === '"') { inQ = true }
        else if (c === ',') { out.push(cur); cur = '' }
        else { cur += c }
      }
    }
    out.push(cur)
    const row = {}
    header.forEach((h, i) => (row[h] = out[i]))
    rows.push(row)
  }
  return rows
}

const csvPath = 'audit-inventory-broken.csv'
const rows = parseCsv(readFileSync(csvPath, 'utf8'))
console.log(`loaded ${rows.length} broken products from ${csvPath}`)

let work = rows
if (STATUS !== 'all') work = work.filter(r => r.status === STATUS)
if (work.length > LIMIT) work = work.slice(0, LIMIT)

console.log(`scope: status=${STATUS} limit=${LIMIT === Infinity ? 'none' : LIMIT} → ${work.length} products to process`)
console.log(`mode: ${APPLY ? '*** APPLY (writes!) ***' : 'dry-run (no writes)'}`)
console.log('')

// --- Patch function ---------------------------------------------------------
async function patchVariant(row) {
  // PUT with minimal body — only inventory_management + inventory_policy.
  // Shopify preserves all other variant fields (price, sku, title, etc.).
  const body = {
    variant: {
      id: Number(row.variant_id),
      inventory_management: 'shopify',
      inventory_policy: 'deny',
    },
  }
  const r = await fetch(`${BASE}/variants/${row.variant_id}.json`, {
    method: 'PUT',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const txt = await r.text()
    throw new Error(`HTTP ${r.status}: ${txt}`)
  }
  const j = await r.json()
  const v = j.variant
  return { inv_mgmt: v.inventory_management, inv_policy: v.inventory_policy, inv_qty: v.inventory_quantity }
}

// --- Main loop --------------------------------------------------------------
const results = { ok: 0, fail: 0, errors: [] }
for (let i = 0; i < work.length; i++) {
  const r = work[i]
  const label = `[${i + 1}/${work.length}] ${r.sku} (${r.status}, qty=${r.inv_qty}, id=${r.shopify_product_id})`
  if (!APPLY) {
    console.log(`DRY  ${label} → would PUT variant ${r.variant_id} {inventory_management:'shopify', inventory_policy:'deny'}`)
    continue
  }
  try {
    const after = await patchVariant(r)
    console.log(`OK   ${label} → inv_mgmt=${after.inv_mgmt} inv_qty=${after.inv_qty}`)
    results.ok++
  } catch (e) {
    console.log(`FAIL ${label} → ${e.message}`)
    results.fail++
    results.errors.push({ sku: r.sku, err: e.message })
  }
  // Shopify REST limit is 2/sec — 600ms pacing leaves headroom
  await new Promise(r => setTimeout(r, 600))
}

console.log('')
console.log('=== done ===')
console.log(`processed: ${work.length}, ok: ${results.ok}, fail: ${results.fail}`)
if (results.errors.length) console.log('errors:', results.errors)
