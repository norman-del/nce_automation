import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { calculateShippingTier } from '@/lib/products/shipping'

interface ImportRow {
  sku: string
  title: string
  condition: string
  vat_applicable: boolean
  cost_price: number
  selling_price: number
  original_rrp?: number | null
  model_number?: string | null
  year_of_manufacture?: number | null
  electrical_requirements?: string | null
  notes?: string | null
  width_cm: number
  height_cm: number
  depth_cm: number
  weight_kg?: number | null
  product_type: string
  vendor: string
  tags?: string[]
  collections?: string[]
  shopify_product_id?: number | null
  qbo_item_id?: string | null
  handle?: string | null
  body_html?: string | null
  status?: string
  free_delivery_included?: boolean
}

const REQUIRED_FIELDS = ['sku', 'title', 'condition', 'cost_price', 'selling_price', 'width_cm', 'height_cm', 'depth_cm', 'product_type', 'vendor'] as const

export async function POST(req: NextRequest) {
  try {
    const { rows } = await req.json() as { rows: ImportRow[] }

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 })
    }

    if (rows.length > 1000) {
      return NextResponse.json({ error: 'Max 1000 rows per batch. Split your CSV and import in chunks.' }, { status: 400 })
    }

    const db = createServiceClient()

    // Check for existing SKUs to skip duplicates
    const skus = rows.map(r => r.sku).filter(Boolean)
    const { data: existing } = await db
      .from('products')
      .select('sku')
      .in('sku', skus)

    const existingSkus = new Set((existing ?? []).map(e => e.sku))

    const errors: { row: number; sku: string; error: string }[] = []
    const toInsert: Record<string, unknown>[] = []
    let skipped = 0

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]

      // Skip duplicates
      if (existingSkus.has(row.sku)) {
        skipped++
        continue
      }

      // Validate required fields
      const missing = REQUIRED_FIELDS.filter(f => {
        const val = row[f]
        return val === undefined || val === null || val === ''
      })

      if (missing.length > 0) {
        errors.push({ row: i + 1, sku: row.sku || '?', error: `Missing: ${missing.join(', ')}` })
        continue
      }

      // Validate condition
      const condition = String(row.condition).toLowerCase()
      if (condition !== 'new' && condition !== 'used') {
        errors.push({ row: i + 1, sku: row.sku, error: `Invalid condition: "${row.condition}" (must be new or used)` })
        continue
      }

      const w = Number(row.width_cm)
      const h = Number(row.height_cm)
      const d = Number(row.depth_cm)
      const wt = row.weight_kg != null ? Number(row.weight_kg) : null

      if (isNaN(w) || isNaN(h) || isNaN(d)) {
        errors.push({ row: i + 1, sku: row.sku, error: 'Invalid dimensions' })
        continue
      }

      const shippingTier = calculateShippingTier(w, h, d, wt)

      // Determine status — if Shopify and QBO IDs are provided, mark as active
      let status = 'processing'
      if (row.shopify_product_id && row.qbo_item_id) {
        status = 'active'
      } else if (row.status === 'active' || row.status === 'processing') {
        status = row.status
      }

      toInsert.push({
        sku: row.sku,
        title: row.title,
        condition,
        vat_applicable: row.vat_applicable ?? false,
        cost_price: Number(row.cost_price),
        selling_price: Number(row.selling_price),
        original_rrp: row.original_rrp != null ? Number(row.original_rrp) : null,
        model_number: row.model_number || null,
        year_of_manufacture: row.year_of_manufacture != null ? Number(row.year_of_manufacture) : null,
        electrical_requirements: row.electrical_requirements || null,
        notes: row.notes || null,
        width_cm: w,
        height_cm: h,
        depth_cm: d,
        weight_kg: wt,
        shipping_tier: shippingTier,
        product_type: row.product_type,
        vendor: row.vendor,
        tags: row.tags ?? [],
        collections: row.collections ?? [],
        shopify_product_id: row.shopify_product_id || null,
        shopify_status: row.shopify_product_id ? 'active' : 'draft',
        qbo_item_id: row.qbo_item_id || null,
        qbo_synced: !!row.qbo_item_id,
        handle: row.handle || null,
        body_html: row.body_html || null,
        status,
        free_delivery_included: row.free_delivery_included ?? false,
      })
    }

    // Batch insert (Supabase handles up to 1000 rows)
    let inserted = 0
    if (toInsert.length > 0) {
      const { error: insertError, count } = await db
        .from('products')
        .insert(toInsert, { count: 'exact' })

      if (insertError) throw insertError
      inserted = count ?? toInsert.length
    }

    console.log(`[products/import] done: ${inserted} inserted, ${skipped} skipped (duplicate), ${errors.length} errors`)

    return NextResponse.json({
      inserted,
      skipped,
      errors,
      total: rows.length,
    })
  } catch (e) {
    console.error('[products/import] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
