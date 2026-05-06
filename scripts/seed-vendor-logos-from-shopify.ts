// Seeds vendor_logos from the live Shopify storefront's "trusted brands"
// homepage strip (#16(b) bonus, see now-vs-strategic.md and the storefront
// owner-feedback handoff).
//
// Strategy:
//   1. Fetch https://nationwidecatering.co.uk/ HTML.
//   2. Parse the <ul class="logo-list"> block — each <li> wraps an <a> whose
//      href contains `filter.p.vendor=<Name>` and an <img src=…> with the logo.
//   3. Match each scraped vendor name against vendor_logos.aliases.
//   4. Download the image, upload to the vendor-logos Supabase Storage bucket,
//      update the matching vendor_logos row.
//
// Dry-run by default. Pass --apply to write.
//
// Usage:
//   npx tsx scripts/seed-vendor-logos-from-shopify.ts          # dry-run
//   npx tsx scripts/seed-vendor-logos-from-shopify.ts --apply  # write

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const STOREFRONT = 'https://nationwidecatering.co.uk/'
const BUCKET = 'vendor-logos'
const APPLY = process.argv.includes('--apply')

interface ScrapedLogo {
  vendorName: string
  imageUrl: string
}

interface BrandRow {
  handle: string
  name: string
  aliases: string[]
  storage_path: string | null
}

function makeDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { persistSession: false } })
}

async function fetchStorefrontHtml(): Promise<string> {
  const res = await fetch(STOREFRONT, { headers: { 'user-agent': 'nce-automation/seed-vendor-logos' } })
  if (!res.ok) throw new Error(`Storefront fetch failed: ${res.status}`)
  return res.text()
}

function parseLogos(html: string): ScrapedLogo[] {
  // Find each list item that has a vendor-filter link AND an inner <img>.
  // Shopify's HTML is enough on its own here — no JS execution needed.
  const out: ScrapedLogo[] = []
  // Match each <a ... vendor=…>…<img src="…"…>
  const liRe = /<a[^>]+href="[^"]*filter\.p\.vendor=([^"&]+)"[^>]*>\s*<img[^>]+src="([^"]+)"/gi
  let m: RegExpExecArray | null
  while ((m = liRe.exec(html)) !== null) {
    const vendorName = decodeURIComponent(m[1].replace(/\+/g, ' ')).trim()
    let imageUrl = m[2]
    // Shopify CDN URLs often start with `//` — promote to https.
    if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl
    // Strip ?width=120 etc. and request a larger version. The CDN serves the
    // original when no width param is given, but for logos a width of ~600
    // is plenty and faster. We'll request width=600.
    imageUrl = imageUrl.replace(/[?&]width=\d+/g, '')
    imageUrl += imageUrl.includes('?') ? '&width=600' : '?width=600'
    out.push({ vendorName, imageUrl })
  }
  return out
}

function contentTypeFromUrl(url: string): { contentType: string; ext: string } {
  const lower = url.toLowerCase()
  if (lower.includes('.svg')) return { contentType: 'image/svg+xml', ext: 'svg' }
  if (lower.includes('.png')) return { contentType: 'image/png', ext: 'png' }
  if (lower.includes('.webp')) return { contentType: 'image/webp', ext: 'webp' }
  return { contentType: 'image/jpeg', ext: 'jpg' }
}

async function main() {
  console.log(`[seed-vendor-logos] mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)
  const db = makeDb()

  // Pull catalogue once
  const { data: brandRows, error: brandsErr } = await db
    .from('vendor_logos')
    .select('handle, name, aliases, storage_path')
  if (brandsErr) throw brandsErr
  const brands = (brandRows ?? []) as BrandRow[]
  if (brands.length === 0) {
    console.log('No vendor_logos rows. Did you run the migration?')
    return
  }

  // Build alias → row index for quick match
  const byAlias = new Map<string, BrandRow>()
  for (const b of brands) {
    for (const a of b.aliases) byAlias.set(a.toLowerCase().trim(), b)
  }

  console.log(`[seed-vendor-logos] catalogue: ${brands.length} brands`)
  console.log('[seed-vendor-logos] fetching storefront…')
  const html = await fetchStorefrontHtml()
  const scraped = parseLogos(html)
  console.log(`[seed-vendor-logos] found ${scraped.length} logo entries on Shopify homepage`)

  let matched = 0
  let uploaded = 0
  const skipped: string[] = []
  const failed: string[] = []

  for (const s of scraped) {
    const key = s.vendorName.toLowerCase().trim()
    const brand = byAlias.get(key)
    if (!brand) {
      skipped.push(`${s.vendorName} — no matching alias in vendor_logos`)
      continue
    }
    matched++
    const { contentType, ext } = contentTypeFromUrl(s.imageUrl)
    console.log(`  • ${brand.handle}  ←  ${s.vendorName}  (${contentType})`)

    if (!APPLY) continue

    // Download
    const imgRes = await fetch(s.imageUrl, { headers: { 'user-agent': 'nce-automation/seed-vendor-logos' } })
    if (!imgRes.ok) { failed.push(`${brand.handle}: download ${imgRes.status}`); continue }
    const buf = await imgRes.arrayBuffer()
    if (buf.byteLength > 2 * 1024 * 1024) {
      failed.push(`${brand.handle}: file too large (${buf.byteLength} bytes)`)
      continue
    }

    const storagePath = `${brand.handle}/${Date.now()}.${ext}`
    const { error: upErr } = await db.storage.from(BUCKET).upload(storagePath, buf, { contentType, upsert: false })
    if (upErr) { failed.push(`${brand.handle}: upload ${upErr.message}`); continue }
    const { data: pub } = db.storage.from(BUCKET).getPublicUrl(storagePath)
    const logoUrl = pub.publicUrl

    // Update row
    const { error: updErr } = await db
      .from('vendor_logos')
      .update({ logo_url: logoUrl, storage_path: storagePath, content_type: contentType, updated_at: new Date().toISOString() })
      .eq('handle', brand.handle)
    if (updErr) {
      await db.storage.from(BUCKET).remove([storagePath]).catch(() => {})
      failed.push(`${brand.handle}: update ${updErr.message}`)
      continue
    }

    // Best-effort: clean up the previous file
    if (brand.storage_path && brand.storage_path !== storagePath) {
      await db.storage.from(BUCKET).remove([brand.storage_path]).catch(() => {})
    }

    // Backfill products.vendor_logo_url for every product whose vendor is in
    // this brand's alias set.
    const { data: candidates } = await db.from('products').select('id, vendor')
    if (candidates) {
      const aliasSet = new Set(brand.aliases.map((a) => a.toLowerCase().trim()))
      const ids = candidates
        .filter((p) => p.vendor && aliasSet.has(p.vendor.toLowerCase().trim()))
        .map((p) => p.id)
      if (ids.length > 0) {
        await db.from('products').update({ vendor_logo_url: logoUrl }).in('id', ids)
        console.log(`    ↳ backfilled ${ids.length} product(s)`)
      }
    }

    uploaded++
  }

  console.log('')
  console.log(`Matched:  ${matched}`)
  console.log(`Uploaded: ${uploaded}${APPLY ? '' : ' (dry-run — would have uploaded)'}`)
  if (skipped.length) {
    console.log(`Skipped (${skipped.length}):`)
    for (const s of skipped) console.log(`  - ${s}`)
  }
  if (failed.length) {
    console.log(`Failed (${failed.length}):`)
    for (const f of failed) console.log(`  - ${f}`)
  }
  if (!APPLY) console.log('\nRe-run with --apply to write.')
}

main().catch((err) => { console.error(err); process.exit(1) })
