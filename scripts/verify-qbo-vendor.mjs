import { readFileSync } from 'node:fs'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const { createClient } = await import('@supabase/supabase-js')
const { getQboClient } = await import('../lib/qbo/client.ts').catch(async () => {
  throw new Error('use tsx: npx tsx scripts/verify-qbo-vendor.mjs')
})

const vendorId = process.argv[2]
const itemId = process.argv[3]
if (!vendorId) { console.error('Usage: verify <vendorId> [itemId]'); process.exit(1) }

const { accessToken, connection } = await getQboClient()
const env = process.env.QBO_ENVIRONMENT?.trim() === 'production'
  ? 'https://quickbooks.api.intuit.com'
  : 'https://sandbox-quickbooks.api.intuit.com'

async function q(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })
  return { status: res.status, body: await res.json() }
}

const v = await q(`${env}/v3/company/${connection.realm_id}/vendor/${vendorId}?minorversion=65`)
console.log('VENDOR', v.status, JSON.stringify(v.body.Vendor, null, 2))

if (itemId) {
  const i = await q(`${env}/v3/company/${connection.realm_id}/item/${itemId}?minorversion=65`)
  console.log('ITEM', i.status, JSON.stringify(i.body.Item, null, 2))
}
