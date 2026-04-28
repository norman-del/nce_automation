#!/usr/bin/env node
// Read-only audit of Shopify store configuration.
// Pulls everything reachable with the current access token's scopes
// (orders, products, shipping, publications, payouts) and writes a JSON
// report to docs/handoffs/shopify-config-audit-<date>.json so we can
// cross-reference against PRD + nce_automation features.
//
// No mutations. Safe to run anytime.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// Lightweight .env.local loader (no dep)
const envPath = join(ROOT, '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const DOMAIN = process.env.SHOPIFY_STORE_DOMAIN
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN
const API_VERSION = '2024-10'

if (!DOMAIN || !TOKEN) {
  console.error('Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_ACCESS_TOKEN in env')
  process.exit(1)
}

const REST_BASE = `https://${DOMAIN}/admin/api/${API_VERSION}`
const GQL_URL = `${REST_BASE}/graphql.json`

async function rest(path) {
  const res = await fetch(`${REST_BASE}${path}`, {
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
  })
  const text = await res.text()
  if (!res.ok) return { ok: false, status: res.status, body: text.slice(0, 500) }
  try { return { ok: true, status: res.status, data: JSON.parse(text) } }
  catch { return { ok: true, status: res.status, raw: text.slice(0, 500) } }
}

async function gql(query, variables = {}) {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || (json && json.errors)) {
    return { ok: false, status: res.status, errors: json?.errors, body: JSON.stringify(json).slice(0, 800) }
  }
  return { ok: true, data: json?.data }
}

const report = {
  generated_at: new Date().toISOString(),
  store: DOMAIN,
  api_version: API_VERSION,
  sections: {},
}

async function section(name, fn) {
  process.stdout.write(`→ ${name} … `)
  try {
    const result = await fn()
    report.sections[name] = result
    const summary =
      result?.ok === false ? `403/err (${result.status})`
      : Array.isArray(result?.items) ? `${result.items.length} items`
      : result?.count !== undefined ? `${result.count}`
      : 'ok'
    console.log(summary)
  } catch (e) {
    report.sections[name] = { ok: false, error: e.message }
    console.log(`error: ${e.message}`)
  }
}

// 1. Shop info — basic store metadata
await section('shop', async () => {
  const r = await rest('/shop.json')
  if (!r.ok) return r
  const s = r.data.shop
  return {
    ok: true,
    name: s.name,
    primary_domain: s.domain,
    myshopify_domain: s.myshopify_domain,
    plan: s.plan_name,
    plan_display: s.plan_display_name,
    country_code: s.country_code,
    currency: s.currency,
    timezone: s.iana_timezone,
    weight_unit: s.weight_unit,
    enabled_presentment_currencies: s.enabled_presentment_currencies,
    has_storefront: s.has_storefront,
    has_discounts: s.has_discounts,
    has_gift_cards: s.has_gift_cards,
    checkout_api_supported: s.checkout_api_supported,
    multi_location_enabled: s.multi_location_enabled,
    transactional_sms_disabled: s.transactional_sms_disabled,
    setup_required: s.setup_required,
  }
})

// 2. Locations (via REST — different from shipping zones)
await section('locations', async () => {
  const r = await rest('/locations.json')
  if (!r.ok) return r
  return {
    ok: true,
    items: r.data.locations.map(l => ({
      id: l.id, name: l.name, address1: l.address1, city: l.city,
      country_code: l.country_code, active: l.active, legacy: l.legacy,
    })),
  }
})

// 3. Publications / sales channels
await section('publications', async () => {
  const q = `{ publications(first: 50) { edges { node { id name supportsFuturePublishing } } } }`
  const r = await gql(q)
  if (!r.ok) return r
  return { ok: true, items: r.data.publications.edges.map(e => e.node) }
})

// 4. Delivery profiles (full GraphQL)
await section('delivery_profiles', async () => {
  const q = `{
    deliveryProfiles(first: 25) {
      edges { node {
        id name default
        productVariantsCount { count }
        profileLocationGroups {
          locationGroupZones(first: 50) {
            edges { node {
              zone { id name countries { code { countryCode } provinces { code } } }
              methodDefinitions(first: 50) {
                edges { node {
                  id name active
                  rateProvider { __typename
                    ... on DeliveryRateDefinition { price { amount currencyCode } }
                  }
                  methodConditions { field operator conditionCriteria { __typename
                    ... on MoneyV2 { amount currencyCode }
                    ... on Weight { value unit }
                  } }
                } }
              }
            } }
          }
        }
      } }
    }
  }`
  const r = await gql(q)
  if (!r.ok) return r
  const profiles = r.data.deliveryProfiles.edges.map(e => {
    const p = e.node
    const zones = []
    for (const lg of p.profileLocationGroups || []) {
      for (const ze of lg.locationGroupZones?.edges || []) {
        const z = ze.node
        zones.push({
          name: z.zone.name,
          countries: z.zone.countries?.map(c => c.code.countryCode) || [],
          methods: z.methodDefinitions.edges.map(me => {
            const m = me.node
            return {
              name: m.name, active: m.active,
              rate_type: m.rateProvider?.__typename,
              price: m.rateProvider?.price ? `${m.rateProvider.price.amount} ${m.rateProvider.price.currencyCode}` : null,
              conditions: m.methodConditions?.map(c => ({
                field: c.field, operator: c.operator,
                value: c.conditionCriteria?.amount ?? c.conditionCriteria?.value,
                unit: c.conditionCriteria?.currencyCode ?? c.conditionCriteria?.unit,
              })),
            }
          }),
        })
      }
    }
    return {
      id: p.id, name: p.name, is_default: p.default,
      product_variant_count: p.productVariantsCount?.count,
      zones,
    }
  })
  return { ok: true, items: profiles }
})

// 5. Carrier services (third-party rate providers like APC, Pallettrack, Royal Mail)
await section('carrier_services', async () => {
  const r = await rest('/carrier_services.json')
  if (!r.ok) return r
  return { ok: true, items: r.data.carrier_services }
})

// 6. Fulfillment services (3PL providers, fulfillment apps)
await section('fulfillment_services', async () => {
  const r = await rest('/fulfillment_services.json?scope=all')
  if (!r.ok) return r
  return { ok: true, items: r.data.fulfillment_services }
})

// 7. Product totals + types/vendors/tags counts (we already know these but capture for diff)
await section('products_summary', async () => {
  const c = await rest('/products/count.json')
  if (!c.ok) return c
  // Sample first 250 to enumerate types/vendors actually in use right now
  const sample = await rest('/products.json?limit=250&fields=id,product_type,vendor,status,published_at,tags')
  if (!sample.ok) return sample
  const types = new Set(), vendors = new Set(), statuses = {}, tagSet = new Set()
  for (const p of sample.data.products) {
    if (p.product_type) types.add(p.product_type)
    if (p.vendor) vendors.add(p.vendor)
    statuses[p.status] = (statuses[p.status] || 0) + 1
    if (p.tags) p.tags.split(',').forEach(t => tagSet.add(t.trim()))
  }
  return {
    ok: true,
    total_count: c.data.count,
    sample_size: sample.data.products.length,
    distinct_types_in_sample: types.size,
    distinct_vendors_in_sample: vendors.size,
    distinct_tags_in_sample: tagSet.size,
    status_breakdown_in_sample: statuses,
  }
})

// 8. Custom collections / smart collections (counts only)
await section('custom_collections', async () => {
  const r = await rest('/custom_collections/count.json')
  if (!r.ok) return r
  return { ok: true, count: r.data.count }
})
await section('smart_collections', async () => {
  const r = await rest('/smart_collections/count.json')
  if (!r.ok) return r
  return { ok: true, count: r.data.count }
})

// 9. Metafield definitions (product-level — what custom fields the store uses)
await section('product_metafield_definitions', async () => {
  const q = `{
    metafieldDefinitions(first: 100, ownerType: PRODUCT) {
      edges { node { id name namespace key type { name } description } }
    }
  }`
  const r = await gql(q)
  if (!r.ok) return r
  return { ok: true, items: r.data.metafieldDefinitions.edges.map(e => e.node) }
})

await section('variant_metafield_definitions', async () => {
  const q = `{ metafieldDefinitions(first: 100, ownerType: PRODUCTVARIANT) { edges { node { id name namespace key type { name } } } } }`
  const r = await gql(q)
  if (!r.ok) return r
  return { ok: true, items: r.data.metafieldDefinitions.edges.map(e => e.node) }
})

// 10. Metaobjects (newer concept — custom data structures store may use for content)
await section('metaobject_definitions', async () => {
  const q = `{ metaobjectDefinitions(first: 50) { edges { node { id name type displayNameKey fieldDefinitions { name key type { name } } } } } }`
  const r = await gql(q)
  if (!r.ok) return r
  return { ok: true, items: r.data.metaobjectDefinitions.edges.map(e => e.node) }
})

// 11. Webhooks registered (tells us what events Shopify is told to push)
await section('webhooks', async () => {
  const r = await rest('/webhooks.json')
  if (!r.ok) return r
  return { ok: true, items: r.data.webhooks.map(w => ({
    id: w.id, topic: w.topic, address: w.address, format: w.format, api_version: w.api_version,
  })) }
})

// 12. Inventory locations counts via product listings
await section('product_listings_count', async () => {
  const r = await rest('/product_listings/count.json')
  if (!r.ok) return r
  return { ok: true, count: r.data.count }
})

// 13. Orders snapshot (last 30 days, just counts by financial/fulfillment status)
await section('orders_snapshot', async () => {
  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const r = await rest(`/orders.json?status=any&created_at_min=${since}&limit=250&fields=id,financial_status,fulfillment_status,source_name,gateway,tags,total_price`)
  if (!r.ok) return r
  const fin = {}, ful = {}, source = {}, gateway = {}
  let totalGbp = 0
  for (const o of r.data.orders) {
    fin[o.financial_status || 'null'] = (fin[o.financial_status || 'null'] || 0) + 1
    ful[o.fulfillment_status || 'null'] = (ful[o.fulfillment_status || 'null'] || 0) + 1
    source[o.source_name || 'null'] = (source[o.source_name || 'null'] || 0) + 1
    gateway[o.gateway || 'null'] = (gateway[o.gateway || 'null'] || 0) + 1
    totalGbp += parseFloat(o.total_price || '0')
  }
  return {
    ok: true,
    last_30d_count: r.data.orders.length,
    by_financial_status: fin,
    by_fulfillment_status: ful,
    by_source_name: source,
    by_payment_gateway: gateway,
    last_30d_gross_gbp: Math.round(totalGbp),
  }
})

// 14. Apps installed — needs read_apps which we don't have. Try anyway, capture failure.
await section('installed_apps_attempt', async () => {
  const q = `{ apps(first: 50) { edges { node { id title } } } }`
  const r = await gql(q)
  return r
})

// 15. Discounts — needs read_discounts. Try anyway.
await section('discounts_attempt', async () => {
  const r = await rest('/price_rules.json?limit=10')
  return r
})

// 16. Customers — needs read_customers. Try anyway.
await section('customers_attempt', async () => {
  const r = await rest('/customers/count.json')
  return r
})

// 17. Themes — needs read_themes. Try anyway.
await section('themes_attempt', async () => {
  const r = await rest('/themes.json')
  return r
})

// 18. Markets — newer feature, usually requires read_markets.
await section('markets_attempt', async () => {
  const q = `{ markets(first: 25) { edges { node { id name primary enabled regions(first: 25) { edges { node { ... on MarketRegionCountry { code name } } } } } } } }`
  const r = await gql(q)
  return r
})

// 19. Files / content
await section('files_attempt', async () => {
  const q = `{ files(first: 5) { edges { node { id alt fileStatus } } } }`
  const r = await gql(q)
  return r
})

// 20. Returns (returns API)
await section('returns_attempt', async () => {
  const q = `{ returns(first: 5) { edges { node { id status } } } }`
  const r = await gql(q)
  return r
})

// 21. Marketing events / activities
await section('marketing_events_attempt', async () => {
  const r = await rest('/marketing_events.json?limit=5')
  return r
})

// 22. Gift cards
await section('gift_cards_attempt', async () => {
  const r = await rest('/gift_cards/count.json')
  return r
})

// Write report
const date = new Date().toISOString().slice(0, 10)
const outDir = join(ROOT, 'docs', 'handoffs')
mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, `shopify-config-audit-${date}.json`)
writeFileSync(outPath, JSON.stringify(report, null, 2))
console.log(`\nReport: ${outPath}`)
