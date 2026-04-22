// Throwaway diagnostic: dump every QBO tax code.
// Read-only. Nothing is changed. See docs/plans/now-vs-strategic.md §5 Bug 1.
//
// Usage: node scripts/dump-qbo-tax-codes.mjs

import { createClient } from '@supabase/supabase-js'
import QuickBooks from 'node-quickbooks'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Decrypt helper — matches lib/crypto.ts: format is iv_hex:authTag_hex:ciphertext_hex
import { createDecipheriv } from 'crypto'
function decrypt(payload) {
  const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY.trim(), 'hex')
  const [ivHex, tagHex, ctHex] = payload.split(':')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]).toString('utf8')
}

const { data: conn, error } = await supabase
  .from('qbo_connections')
  .select('*')
  .single()
if (error) { console.error('No QBO connection:', error.message); process.exit(1) }

// IMPORTANT: do NOT refresh here — QBO rotates refresh tokens and this script
// doesn't save the new one back, which would invalidate the chain (see CLAUDE.md).
// If the access token is expired, ask user to let the app refresh it first.
const accessToken = decrypt(conn.access_token_encrypted)
const expiresAt = new Date(conn.token_expires_at)
if (expiresAt < new Date(Date.now() + 60_000)) {
  console.error(`Access token expired at ${expiresAt.toISOString()}. Open the dashboard once to let the app refresh, then re-run this script. NOT refreshing from script to avoid invalidating the refresh-token chain.`)
  process.exit(1)
}

const isSandbox = process.env.QBO_ENVIRONMENT?.trim() !== 'production'
const qbo = new QuickBooks(
  process.env.QBO_CLIENT_ID,
  process.env.QBO_CLIENT_SECRET,
  accessToken,
  false,
  conn.realm_id,
  isSandbox,
  false,
  null,
  '2.0',
  decrypt(conn.refresh_token_encrypted),
)

const codes = await new Promise((resolve, reject) => {
  qbo.findTaxCodes({}, (err, result) => {
    if (err) reject(err)
    else resolve(result?.QueryResponse?.TaxCode ?? [])
  })
})

console.log(`\nFound ${codes.length} tax codes in QBO (realm ${conn.realm_id}):\n`)
for (const tc of codes) {
  console.log(`  id=${tc.Id}  name="${tc.Name}"  active=${tc.Active}  taxable=${tc.Taxable}  hidden=${tc.Hidden ?? false}`)
  if (tc.Description) console.log(`    description: ${tc.Description}`)
  const salesRates = tc.SalesTaxRateList?.TaxRateDetail ?? []
  const purchRates = tc.PurchaseTaxRateList?.TaxRateDetail ?? []
  if (salesRates.length) console.log(`    sales rates: ${salesRates.map(r => `${r.TaxRateRef?.name ?? r.TaxRateRef?.value}@${r.TaxTypeApplicable ?? '?'}`).join(', ')}`)
  if (purchRates.length) console.log(`    purchase rates: ${purchRates.map(r => `${r.TaxRateRef?.name ?? r.TaxRateRef?.value}@${r.TaxTypeApplicable ?? '?'}`).join(', ')}`)
}

// Show what the current buggy heuristic in lib/qbo/items.ts picks
let std = null, margin = null
for (const tc of codes) {
  const n = String(tc.Name).toLowerCase()
  if (n.includes('20') && !std) std = tc
  if (n.includes('margin') && !margin) margin = tc
}
console.log(`\nCurrent code's heuristic would pick:`)
console.log(`  standard (includes "20"): ${std ? `id=${std.Id} "${std.Name}"` : 'NOTHING (would throw)'}`)
console.log(`  margin   (includes "margin"): ${margin ? `id=${margin.Id} "${margin.Name}"` : 'NOTHING (would throw)'}`)
