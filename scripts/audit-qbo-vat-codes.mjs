// Audit QBO items against the correct VAT tax codes (Bug 1 remediation).
// Dry-run by default — writes nothing.
// Pass --apply to actually update items in QBO.
//
// Usage:
//   node --env-file=.env.local scripts/audit-qbo-vat-codes.mjs          # dry-run
//   node --env-file=.env.local scripts/audit-qbo-vat-codes.mjs --apply  # remediate

import { createClient } from '@supabase/supabase-js'
import QuickBooks from 'node-quickbooks'
import { createDecipheriv } from 'crypto'
import { writeFileSync } from 'fs'

const APPLY = process.argv.includes('--apply')

function decrypt(payload) {
  const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY.trim(), 'hex')
  const [ivHex, tagHex, ctHex] = payload.split(':')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]).toString('utf8')
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { data: conn, error: connErr } = await supabase.from('qbo_connections').select('*').single()
if (connErr) { console.error('No QBO connection:', connErr.message); process.exit(1) }

const EXPECTED_STANDARD = conn.vat_standard_tax_code_id
const EXPECTED_MARGIN_SALE = conn.vat_margin_sale_tax_code_id
const EXPECTED_MARGIN_PURCHASE = conn.vat_margin_purchase_tax_code_id // may be null

if (!EXPECTED_STANDARD || !EXPECTED_MARGIN_SALE) {
  console.error('VAT mapping is not seeded on qbo_connections. Aborting.')
  process.exit(1)
}

const accessToken = decrypt(conn.access_token_encrypted)
if (new Date(conn.token_expires_at) < new Date(Date.now() + 60_000)) {
  console.error(`Access token expired (${conn.token_expires_at}). Open the dashboard to refresh, then re-run.`)
  process.exit(1)
}

const isSandbox = process.env.QBO_ENVIRONMENT?.trim() !== 'production'
const qbo = new QuickBooks(
  process.env.QBO_CLIENT_ID,
  process.env.QBO_CLIENT_SECRET,
  accessToken, false,
  conn.realm_id, isSandbox,
  false, null, '2.0',
  decrypt(conn.refresh_token_encrypted),
)

console.log(`\nExpected mapping:`)
console.log(`  standard        = ${EXPECTED_STANDARD}`)
console.log(`  margin (sale)   = ${EXPECTED_MARGIN_SALE}`)
console.log(`  margin (purch)  = ${EXPECTED_MARGIN_PURCHASE ?? '(none — should be omitted)'}`)
console.log(`Mode: ${APPLY ? 'APPLY (will write to QBO)' : 'DRY-RUN (read-only)'}\n`)

// Load every product with a QBO item id
const { data: products, error: prodErr } = await supabase
  .from('products')
  .select('id, sku, title, vat_applicable, qbo_item_id')
  .not('qbo_item_id', 'is', null)
  .order('id', { ascending: true })
if (prodErr) { console.error(prodErr); process.exit(1) }

console.log(`Found ${products.length} products with a QBO item id. Fetching current tax codes...\n`)

function getItem(id) {
  return new Promise((resolve, reject) => {
    qbo.getItem(id, (err, item) => err ? reject(err) : resolve(item))
  })
}
function updateItem(item) {
  return new Promise((resolve, reject) => {
    qbo.updateItem(item, (err, res) => err ? reject(err) : resolve(res))
  })
}

const report = []
let ok = 0, mismatched = 0, errors = 0

for (const p of products) {
  try {
    const item = await getItem(p.qbo_item_id)
    const currentSale = item.SalesTaxCodeRef?.value ?? null
    const currentPurch = item.PurchaseTaxCodeRef?.value ?? null
    const expectedSale = p.vat_applicable ? EXPECTED_STANDARD : EXPECTED_MARGIN_SALE
    const expectedPurch = p.vat_applicable ? EXPECTED_STANDARD : EXPECTED_MARGIN_PURCHASE

    const saleWrong = currentSale !== expectedSale
    const purchWrong = (expectedPurch === null)
      ? (currentPurch !== null) // should be absent but isn't
      : (currentPurch !== expectedPurch)

    if (!saleWrong && !purchWrong) {
      ok++
      continue
    }

    mismatched++
    report.push({
      product_id: p.id,
      sku: p.sku,
      title: p.title,
      vat_applicable: p.vat_applicable,
      qbo_item_id: p.qbo_item_id,
      current_sale: currentSale,
      expected_sale: expectedSale,
      current_purch: currentPurch,
      expected_purch: expectedPurch,
      sale_wrong: saleWrong,
      purch_wrong: purchWrong,
    })

    if (APPLY) {
      const update = {
        Id: item.Id,
        SyncToken: item.SyncToken,
        Name: item.Name,
        Sku: item.Sku,
        SalesTaxIncluded: true,
        SalesTaxCodeRef: { value: expectedSale },
      }
      if (expectedPurch) {
        update.PurchaseTaxIncluded = true
        update.PurchaseTaxCodeRef = { value: expectedPurch }
      }
      // Note: cannot "unset" a PurchaseTaxCodeRef via node-quickbooks update —
      // QBO requires a sparse update flag or different endpoint. Flag in report.
      await updateItem(update)
      console.log(`  [APPLIED] ${p.sku} item=${p.qbo_item_id}`)
    }
  } catch (e) {
    errors++
    console.error(`  [ERROR] ${p.sku} item=${p.qbo_item_id}: ${e.message ?? e}`)
  }

  if ((ok + mismatched + errors) % 50 === 0) {
    console.log(`  progress: ${ok + mismatched + errors}/${products.length} (ok=${ok} mismatched=${mismatched} errors=${errors})`)
  }
}

console.log(`\nDone.\n  ok=${ok}\n  mismatched=${mismatched}\n  errors=${errors}`)

if (report.length) {
  const csvPath = `qbo-vat-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`
  const headers = Object.keys(report[0])
  const lines = [headers.join(',')]
  for (const row of report) {
    lines.push(headers.map(h => {
      const v = row[h]
      if (v === null || v === undefined) return ''
      const s = String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }).join(','))
  }
  writeFileSync(csvPath, lines.join('\n'))
  console.log(`\nReport written: ${csvPath}`)
}

if (!APPLY && mismatched > 0) {
  console.log(`\nRe-run with --apply to remediate these ${mismatched} items.`)
}
