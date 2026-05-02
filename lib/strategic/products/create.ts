// Strategic product ingestion — Supabase + QBO only, no Shopify.
//
// Mirrors the bridge POST in app/api/products/route.ts but skips every Shopify
// call. Reuses the same QBO Item create (lib/qbo/items.ts) and the same
// shipping-tier calc (lib/products/shipping.ts). Status is 'active' on create
// because there's no draft state to wait on.
//
// Bridge code is not edited. This module is the Strategic-side equivalent.

import { createServiceClient } from '@/lib/supabase/client'
import { calculateShippingTier } from '@/lib/products/shipping'
import { createQboItem } from '@/lib/qbo/items'

type DbClient = ReturnType<typeof createServiceClient>

export interface StrategicProductInput {
  sku_override?: string
  title: string
  condition: 'new' | 'used'
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
  shipping_tier_override?: 0 | 1 | 2 | null
  weight_kg?: number | null
  supplier_id?: string
  qbo_vendor_id?: string | null
  qbo_vendor_name?: string | null
  product_type: string
  vendor: string
  collections?: string[] | null
  tags?: string[] | null
  body_html?: string | null
  free_delivery_included?: boolean
  warranty_term_code?: string | null
}

export interface StrategicCreateResult {
  sku: string
  id: string
  qbo_item_id?: string | null
  error?: string
}

async function generateUniqueSku(db: DbClient): Promise<string> {
  const { data: skuRow, error } = await db.rpc('generate_product_sku')
  if (error) throw new Error(`SKU generation failed: ${error.message}`)
  return skuRow as string
}

function validate(input: StrategicProductInput): void {
  if (!input.title?.trim()) throw new Error('Title is required')
  if (!input.condition) throw new Error('Condition is required')
  if (input.cost_price == null) throw new Error('Cost price is required')
  if (input.selling_price == null) throw new Error('Selling price is required')
  if (input.width_cm == null || input.height_cm == null || input.depth_cm == null) {
    throw new Error('All dimensions (width, height, depth) are required')
  }
  if (!input.product_type?.trim()) throw new Error('Product type is required')
  if (!input.vendor?.trim()) throw new Error('Vendor/brand is required')
}

export async function createStrategicProduct(
  input: StrategicProductInput
): Promise<StrategicCreateResult> {
  validate(input)
  const db = createServiceClient()

  // Resolve SKU
  let sku: string
  if (input.sku_override?.trim()) {
    sku = input.sku_override.trim()
    const { data: existing } = await db
      .from('products')
      .select('id')
      .eq('sku', sku)
      .maybeSingle()
    if (existing) throw new Error(`SKU "${sku}" is already in use`)
  } else {
    sku = await generateUniqueSku(db)
  }

  // Shipping tier (auto + override)
  const autoTier = calculateShippingTier(
    input.width_cm,
    input.height_cm,
    input.depth_cm,
    input.weight_kg ?? null
  )
  const overrideTier = input.shipping_tier_override ?? null

  // Insert into Supabase. Status is 'active' on create — no draft state because
  // there's no Shopify side to wait on.
  const { data, error } = await db
    .from('products')
    .insert({
      sku,
      title: input.title.trim(),
      condition: input.condition,
      vat_applicable: input.vat_applicable ?? false,
      cost_price: input.cost_price,
      selling_price: input.selling_price,
      original_rrp: input.original_rrp ?? null,
      model_number: input.model_number?.trim() || null,
      year_of_manufacture: input.year_of_manufacture ?? null,
      electrical_requirements: input.electrical_requirements?.trim() || null,
      notes: input.notes?.trim() || null,
      width_cm: input.width_cm,
      height_cm: input.height_cm,
      depth_cm: input.depth_cm,
      weight_kg: input.weight_kg ?? null,
      shipping_tier: autoTier,
      shipping_tier_override: overrideTier,
      supplier_id: input.supplier_id || null,
      qbo_vendor_id: input.qbo_vendor_id || null,
      qbo_vendor_name: input.qbo_vendor_name || null,
      product_type: input.product_type.trim(),
      vendor: input.vendor.trim(),
      collections: input.collections ?? [],
      tags: input.tags ?? [],
      body_html: input.body_html?.trim() || null,
      free_delivery_included: input.free_delivery_included ?? false,
      warranty_term_code: input.warranty_term_code || null,
      status: 'active',
    })
    .select()
    .single()

  if (error) throw error

  // QBO Item create — non-blocking. Product is saved even if QBO fails;
  // sync_error captures the reason for staff visibility.
  let qboItemId: string | null = null
  try {
    qboItemId = await createQboItem({
      sku,
      title: input.title.trim(),
      sellingPrice: input.selling_price,
      costPrice: input.cost_price,
      vatApplicable: input.vat_applicable ?? false,
      qboVendorId: input.qbo_vendor_id || null,
    })
    await db
      .from('products')
      .update({ qbo_item_id: qboItemId, qbo_synced: true })
      .eq('id', data.id)
  } catch (qboErr) {
    console.error(`[strategic/create] ${sku} → QBO FAILED:`, String(qboErr))
    await db
      .from('products')
      .update({ sync_error: `QBO: ${String(qboErr)}` })
      .eq('id', data.id)
  }

  // Best-effort chat reindex on nce-site (same pattern as bridge)
  const siteUrl = process.env.NCE_SITE_URL
  const internalKey = process.env.INTERNAL_API_KEY
  if (siteUrl && internalKey && data.handle) {
    fetch(`${siteUrl}/api/chat/reindex`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': internalKey },
      body: JSON.stringify({ kind: 'product', id: data.handle }),
    }).catch((err) => console.warn('[strategic/create] reindex failed:', String(err)))
  }

  return { sku, id: data.id, qbo_item_id: qboItemId }
}
