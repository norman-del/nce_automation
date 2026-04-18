// Flip inventory_policy from 'continue' to 'deny' on every product where it's
// set wrong. Changes nothing else — not qty, not status, not price, not tags.
//
// Defaults to --dry-run. Pass --apply to actually write.
//   node --env-file=.env.local flip-inventory-policy.mjs           # dry-run
//   node --env-file=.env.local flip-inventory-policy.mjs --apply   # writes

const APPLY = process.argv.includes('--apply')
const domain = process.env.SHOPIFY_STORE_DOMAIN
const token = process.env.SHOPIFY_ACCESS_TOKEN
const BASE = `https://${domain}/admin/api/2024-10`
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

// --- Find all products with policy=continue -----------------------------
console.log('scanning all products for policy=continue...')
const targets = []
let next = null
do {
  const url = next
    ? `${BASE}/products.json?limit=250&page_info=${encodeURIComponent(next)}`
    : `${BASE}/products.json?limit=250&fields=id,title,status,variants`
  const r = await fetch(url, { headers: H })
  const b = await r.json()
  for (const p of b.products) {
    const v = p.variants?.[0]
    if (!v) continue
    if (v.inventory_policy === 'continue') {
      targets.push({
        sku: v.sku,
        title: p.title,
        status: p.status,
        qty: v.inventory_quantity,
        variant_id: v.id,
      })
    }
  }
  const link = r.headers.get('link') || ''
  const m = link.match(/<([^>]+)>;\s*rel="next"/)
  next = m ? new URL(m[1]).searchParams.get('page_info') : null
  await new Promise(r => setTimeout(r, 400))
} while (next)

console.log(`\nfound ${targets.length} products with inventory_policy='continue'`)
console.log(`mode: ${APPLY ? '*** APPLY (writing to Shopify) ***' : 'dry-run (no writes)'}\n`)

const results = { ok: 0, fail: 0, errors: [] }
for (let i = 0; i < targets.length; i++) {
  const t = targets[i]
  const label = `[${i + 1}/${targets.length}] ${t.sku} (${t.status}, qty=${t.qty})`
  if (!APPLY) {
    console.log(`DRY  ${label} → would flip inventory_policy to 'deny'`)
    continue
  }
  try {
    const r = await fetch(`${BASE}/variants/${t.variant_id}.json`, {
      method: 'PUT',
      headers: H,
      body: JSON.stringify({ variant: { id: t.variant_id, inventory_policy: 'deny' } }),
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`)
    const { variant } = await r.json()
    console.log(`OK   ${label} → inventory_policy=${variant.inventory_policy}`)
    results.ok++
  } catch (e) {
    console.log(`FAIL ${label} → ${e.message}`)
    results.fail++
    results.errors.push({ sku: t.sku, err: e.message })
  }
  await new Promise(r => setTimeout(r, 600)) // Shopify REST pacing
}

console.log('\n=== done ===')
console.log(`processed: ${targets.length}, ok: ${results.ok}, fail: ${results.fail}`)
if (results.errors.length) console.log('errors:', results.errors)
