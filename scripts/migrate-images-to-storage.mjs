// Image hosting migration — Shopify CDN → Supabase Storage (now-vs-strategic §12.3).
// Walks product_images rows whose `src` still points at Shopify's CDN, downloads
// each image, uploads it to the Supabase Storage `product-images` bucket using
// the same path convention as the Phase 1 strategic ingestion form
// (lib/strategic/products/photos.ts), then rewrites `product_images.src` to the
// new public URL. Logs every batch to sync_log for resumability/auditability.
//
// Dry-run by default. Pass --apply to actually write. --limit N caps how many
// rows are processed in this run (use small batches for the first apply runs).
//
// Usage:
//   node --env-file=.env.local scripts/migrate-images-to-storage.mjs                  # dry-run, all rows
//   node --env-file=.env.local scripts/migrate-images-to-storage.mjs --limit 50       # dry-run, first 50
//   node --env-file=.env.local scripts/migrate-images-to-storage.mjs --apply --limit 50
//   node --env-file=.env.local scripts/migrate-images-to-storage.mjs --apply          # full run
//
// Idempotent: rows whose src already starts with the Supabase Storage public URL
// prefix are skipped, so re-running after a partial failure is safe.

import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const LIMIT_ARG = process.argv.find((a) => a.startsWith('--limit='))
const LIMIT_FLAG_IDX = process.argv.indexOf('--limit')
const LIMIT = LIMIT_ARG
  ? Number(LIMIT_ARG.split('=')[1])
  : LIMIT_FLAG_IDX >= 0
    ? Number(process.argv[LIMIT_FLAG_IDX + 1])
    : null

const BUCKET = 'product-images'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.')
  process.exit(1)
}

const STORAGE_PUBLIC_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

function safeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
}

function isShopifyCdn(src) {
  if (!src) return false
  return src.includes('cdn.shopify.com') || src.includes('shopifycdn.com')
}

async function fetchAllRows() {
  // Page in chunks of 1000 — Supabase JS client caps single SELECTs at 1000.
  const all = []
  let from = 0
  const pageSize = 1000
  // We pull every row and filter in JS so the LIKE pattern can stay loose
  // (covers both cdn.shopify.com and shopifycdn.com variants).
  // Catalogue is small enough (~3.5k rows) that this is trivial.
  while (true) {
    const { data, error } = await supabase
      .from('product_images')
      .select('id, product_id, file_name, position, src, products!inner(sku)')
      .range(from, from + pageSize - 1)
      .order('id', { ascending: true })
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

async function migrateRow(row) {
  const sku = row.products?.sku
  if (!sku) {
    return { id: row.id, status: 'skipped', reason: 'no SKU on parent product' }
  }
  if (!row.src || !isShopifyCdn(row.src)) {
    return { id: row.id, status: 'skipped', reason: 'src is not a Shopify CDN URL' }
  }

  // Strip query string for the filename component, fall back to file_name.
  const urlNoQuery = row.src.split('?')[0]
  const lastSeg = urlNoQuery.split('/').pop() || row.file_name || `image-${row.id}.jpg`
  const fileName = safeFileName(row.file_name || lastSeg)
  const position = row.position ?? 1
  const storagePath = `${sku}/${position}-${fileName}`

  if (!APPLY) {
    return { id: row.id, status: 'would-migrate', sku, storagePath, src: row.src }
  }

  // Download from Shopify CDN.
  const resp = await fetch(row.src)
  if (!resp.ok) {
    return { id: row.id, status: 'error', reason: `download HTTP ${resp.status}` }
  }
  const contentType = resp.headers.get('content-type') || 'image/jpeg'
  const buffer = Buffer.from(await resp.arrayBuffer())

  // Upload to Supabase Storage. upsert:true so a partial-write retry overwrites
  // the previous attempt instead of erroring.
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType, upsert: true })
  if (uploadErr) {
    return { id: row.id, status: 'error', reason: `upload failed: ${uploadErr.message}` }
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
  const newSrc = urlData.publicUrl

  const { error: updErr } = await supabase
    .from('product_images')
    .update({ src: newSrc })
    .eq('id', row.id)
  if (updErr) {
    return { id: row.id, status: 'error', reason: `db update failed: ${updErr.message}` }
  }

  return { id: row.id, status: 'migrated', sku, storagePath, oldSrc: row.src, newSrc }
}

async function main() {
  const startedAt = Date.now()
  console.log(`[migrate-images] mode=${APPLY ? 'APPLY' : 'DRY-RUN'}${LIMIT ? ` limit=${LIMIT}` : ''}`)

  const allRows = await fetchAllRows()
  const candidates = allRows.filter((r) => isShopifyCdn(r.src))
  const alreadyDone = allRows.filter((r) => r.src && r.src.startsWith(STORAGE_PUBLIC_PREFIX)).length
  const nullSrc = allRows.filter((r) => !r.src).length

  console.log(`[migrate-images] catalog: ${allRows.length} total, ${candidates.length} on Shopify CDN, ${alreadyDone} already on Supabase Storage, ${nullSrc} null src`)

  const work = LIMIT ? candidates.slice(0, LIMIT) : candidates
  console.log(`[migrate-images] processing ${work.length} rows`)

  const results = { migrated: 0, wouldMigrate: 0, skipped: 0, errors: 0 }
  const errorSamples = []

  let i = 0
  for (const row of work) {
    i++
    const r = await migrateRow(row)
    if (r.status === 'migrated') results.migrated++
    else if (r.status === 'would-migrate') results.wouldMigrate++
    else if (r.status === 'skipped') results.skipped++
    else if (r.status === 'error') {
      results.errors++
      if (errorSamples.length < 20) errorSamples.push(r)
    }
    if (i % 50 === 0) {
      console.log(`[migrate-images] ${i}/${work.length} — migrated=${results.migrated} wouldMigrate=${results.wouldMigrate} skipped=${results.skipped} errors=${results.errors}`)
    }
  }

  const durationMs = Date.now() - startedAt
  const summary = {
    mode: APPLY ? 'apply' : 'dry-run',
    limit: LIMIT,
    catalogTotal: allRows.length,
    candidatesOnShopifyCdn: candidates.length,
    alreadyOnStorage: alreadyDone,
    nullSrc,
    processed: work.length,
    ...results,
    durationMs,
    errorSamples,
  }

  console.log('[migrate-images] done', JSON.stringify(summary, null, 2))

  // Log every run (dry or apply) to sync_log so we have an audit trail.
  const { error: logErr } = await supabase.from('sync_log').insert({
    action: 'image_migration',
    status: results.errors > 0 ? 'error' : 'success',
    details: summary,
  })
  if (logErr) console.warn('[migrate-images] sync_log insert failed:', logErr.message)
}

main().catch((e) => {
  console.error('[migrate-images] FAILED:', e)
  process.exit(1)
})
