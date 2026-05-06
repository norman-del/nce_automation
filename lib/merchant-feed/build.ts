import { createServiceClient } from '@/lib/supabase/client'

// Google Shopping feed CSV generator.
// Spec: https://support.google.com/merchants/answer/7052112
//
// Required columns we always emit:
//   id, title, description, link, image_link, availability, price,
//   condition, brand, google_product_category, identifier_exists, shipping
// Optional we emit when present:
//   additional_image_link, gtin, mpn

const BASE_URL = 'https://nationwidecatering.co.uk'

// Top-level collection handle → Google taxonomy ID. Best-effort coarse map.
// Refine over time.
const GOOGLE_CATEGORY_MAP: Record<string, number> = {
  'refrigeration': 4595,
  'commercial-refrigeration': 4595,
  'fridges': 4595,
  'freezers': 4595,
  'cooking': 2520,
  'cooking-equipment': 2520,
  'ovens': 730,
  'ranges': 2520,
  'fryers': 2520,
  'grills': 2520,
  'griddles': 2520,
  'dishwashers': 5340,
  'glasswashers': 5340,
  'preparation': 2520,
  'food-preparation': 2520,
  'storage': 2520,
  'shelving': 4131,
  'bain-maries': 2520,
  'hot-cupboards': 2520,
  'ice-machines': 4595,
  'coffee-machines': 736,
  'beverage': 736,
  'extraction': 2520,
  'sinks-and-tabling': 2520,
}
const DEFAULT_CATEGORY = 2520 // Commercial Kitchen Equipment

const HEADERS = [
  'id',
  'title',
  'description',
  'link',
  'image_link',
  'additional_image_link',
  'availability',
  'price',
  'condition',
  'brand',
  'gtin',
  'mpn',
  'google_product_category',
  'identifier_exists',
  'shipping',
] as const

type Row = Record<(typeof HEADERS)[number], string>

interface Product {
  id: string
  sku: string | null
  handle: string | null
  title: string
  body_html: string | null
  vendor: string | null
  condition: string | null
  selling_price: number | null
  vat_applicable: boolean | null
  stock_quantity: number | null
  status: string | null
  collections: string[] | null
  product_type: string | null
  model_number: string | null
  free_delivery_included: boolean | null
}

interface Image {
  product_id: string
  src: string | null
  position: number | null
}

function csvEscape(v: string | null | undefined): string {
  const s = (v ?? '').toString()
  if (s === '') return ''
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function stripHtml(html: string | null): string {
  if (!html) return ''
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function mapCondition(c: string | null): string {
  const v = (c ?? '').toLowerCase()
  if (v === 'new') return 'new'
  if (v === 'refurbished') return 'refurbished'
  // 'used', 'b-grade', 'clearance' all map to Google Shopping's "used".
  return 'used'
}

function pickCategory(collections: string[] | null, productType: string | null): number {
  const candidates: string[] = []
  for (const c of collections ?? []) {
    candidates.push(c.toLowerCase().replace(/\s+/g, '-'))
  }
  if (productType) candidates.push(productType.toLowerCase().replace(/\s+/g, '-'))
  for (const c of candidates) {
    if (GOOGLE_CATEGORY_MAP[c]) return GOOGLE_CATEGORY_MAP[c]
    for (const key of Object.keys(GOOGLE_CATEGORY_MAP)) {
      if (c.includes(key)) return GOOGLE_CATEGORY_MAP[key]
    }
  }
  return DEFAULT_CATEGORY
}

function priceGbp(p: Product): string {
  if (p.selling_price == null) return ''
  // VAT: new + vat_applicable → add 20%; used (margin scheme) → as-is.
  const incVat = p.vat_applicable ? Number(p.selling_price) * 1.2 : Number(p.selling_price)
  return `${incVat.toFixed(2)} GBP`
}

function shippingValue(p: Product): string {
  // Coarse: free if flagged, else £4.99 parcel default.
  const price = p.free_delivery_included ? '0.00 GBP' : '4.99 GBP'
  return `GB:::Standard:${price}`
}

export interface FeedResult {
  csv: string
  rowCount: number
  skipped: number
}

export async function buildMerchantFeedCsv(): Promise<FeedResult> {
  const db = createServiceClient()

  const PAGE = 1000
  let from = 0
  const products: Product[] = []
  for (;;) {
    const { data, error } = await db
      .from('products')
      .select('id, sku, handle, title, body_html, vendor, condition, selling_price, vat_applicable, stock_quantity, status, collections, product_type, model_number, free_delivery_included')
      .eq('status', 'active')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    products.push(...(data as Product[]))
    if (data.length < PAGE) break
    from += PAGE
  }

  const ids = products.map(p => p.id)
  const imagesByProduct = new Map<string, Image[]>()
  if (ids.length > 0) {
    const CHUNK = 500
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK)
      const { data: imgs, error } = await db
        .from('product_images')
        .select('product_id, src, position')
        .in('product_id', slice)
        .order('position', { ascending: true })
      if (error) throw error
      for (const img of (imgs ?? []) as Image[]) {
        const list = imagesByProduct.get(img.product_id) ?? []
        list.push(img)
        imagesByProduct.set(img.product_id, list)
      }
    }
  }

  const lines: string[] = [HEADERS.join(',')]
  let skipped = 0
  for (const p of products) {
    if (!p.handle || p.selling_price == null) {
      skipped += 1
      continue
    }
    const imgs = (imagesByProduct.get(p.id) ?? []).filter(i => i.src)
    if (imgs.length === 0) {
      skipped += 1
      continue
    }
    const [primary, ...rest] = imgs
    const additional = rest.slice(0, 10).map(i => i.src!).join('|')

    const idValue = p.sku || p.handle
    const description = stripHtml(p.body_html) || p.title
    const condition = mapCondition(p.condition)
    const availability = (p.stock_quantity ?? 0) > 0 ? 'in_stock' : 'out_of_stock'
    const mpn = (p.model_number ?? '').trim()
    const gtin = ''
    const identifier_exists = mpn ? 'yes' : 'no'

    const row: Row = {
      id: idValue,
      title: p.title.slice(0, 150),
      description: description.slice(0, 5000),
      link: `${BASE_URL}/products/${p.handle}`,
      image_link: primary.src!,
      additional_image_link: additional,
      availability,
      price: priceGbp(p),
      condition,
      brand: p.vendor || 'Nationwide Catering Equipment',
      gtin,
      mpn,
      google_product_category: String(pickCategory(p.collections, p.product_type)),
      identifier_exists,
      shipping: shippingValue(p),
    }

    lines.push(HEADERS.map(h => csvEscape(row[h])).join(','))
  }

  return { csv: lines.join('\n'), rowCount: lines.length - 1, skipped }
}

export async function publishMerchantFeed(): Promise<{ rowCount: number; skipped: number; publicUrl: string }> {
  const db = createServiceClient()
  const { csv, rowCount, skipped } = await buildMerchantFeedCsv()

  const { error: upErr } = await db.storage
    .from('merchant-feed')
    .upload('feed.csv', Buffer.from(csv, 'utf8'), {
      contentType: 'text/csv; charset=utf-8',
      upsert: true,
    })
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`)

  const { data: urlData } = db.storage.from('merchant-feed').getPublicUrl('feed.csv')
  return { rowCount, skipped, publicUrl: urlData.publicUrl }
}
