// Strategic product update — Supabase + QBO only, no Shopify.
//
// Mirrors the bridge PATCH in app/api/products/[id]/route.ts but skips every
// Shopify call. Reuses the same QBO Item update (lib/qbo/items.ts) and the
// same shipping-tier calc (lib/products/shipping.ts).
//
// Bridge code is not edited.

import { createServiceClient } from '@/lib/supabase/client'
import { calculateShippingTier } from '@/lib/products/shipping'
import { updateQboItem } from '@/lib/qbo/items'

export interface StrategicUpdateInput {
  sku?: string
  title?: string
  condition?: 'new' | 'used'
  vat_applicable?: boolean
  cost_price?: number
  selling_price?: number
  original_rrp?: number | null
  model_number?: string | null
  year_of_manufacture?: number | null
  electrical_requirements?: string | null
  notes?: string | null
  body_html?: string | null
  width_cm?: number
  height_cm?: number
  depth_cm?: number
  weight_kg?: number | null
  product_type?: string
  vendor?: string
  collections?: string[]
  tags?: string[]
  qbo_vendor_id?: string | null
  qbo_vendor_name?: string | null
  free_delivery_included?: boolean
  warranty_term_code?: string | null
  shipping_tier_override?: 0 | 1 | 2 | null
}

export interface StrategicUpdateResult {
  product: Record<string, unknown>
  syncErrors: string[]
}

export async function updateStrategicProduct(
  id: string,
  input: StrategicUpdateInput
): Promise<StrategicUpdateResult> {
  const db = createServiceClient()

  const { data: current, error: fetchError } = await db
    .from('products')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !current) {
    throw new Error('Product not found')
  }

  if (current.shopify_product_id) {
    throw new Error('This product is bridge-managed. Use /products/[id]/edit instead.')
  }

  // SKU uniqueness check
  if (input.sku != null && input.sku !== current.sku) {
    const trimmed = input.sku.trim()
    if (!trimmed) throw new Error('SKU cannot be empty')
    const { data: existing } = await db
      .from('products')
      .select('id')
      .eq('sku', trimmed)
      .neq('id', id)
      .maybeSingle()
    if (existing) throw new Error(`SKU "${trimmed}" is already in use`)
    input.sku = trimmed
  }

  const updates: Record<string, unknown> = { ...input, updated_at: new Date().toISOString() }

  // Recalc shipping tier if any dimension or weight changed
  if (
    input.width_cm != null ||
    input.height_cm != null ||
    input.depth_cm != null ||
    input.weight_kg !== undefined
  ) {
    const w = input.width_cm ?? current.width_cm
    const h = input.height_cm ?? current.height_cm
    const d = input.depth_cm ?? current.depth_cm
    const wt = input.weight_kg !== undefined ? input.weight_kg : current.weight_kg
    updates.shipping_tier = calculateShippingTier(w, h, d, wt)
  }

  // shipping_tier_override: undefined keeps existing, null clears, 0/1/2 sets
  if (input.shipping_tier_override === undefined) {
    delete updates.shipping_tier_override
  }

  const { data: updated, error: updateError } = await db
    .from('products')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (updateError) throw updateError

  // Best-effort chat reindex on nce-site
  const siteUrl = process.env.NCE_SITE_URL
  const internalKey = process.env.INTERNAL_API_KEY
  if (siteUrl && internalKey && updated.handle) {
    fetch(`${siteUrl}/api/chat/reindex`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': internalKey },
      body: JSON.stringify({ kind: 'product', id: updated.handle }),
    }).catch((err) => console.warn('[strategic/update] reindex failed:', String(err)))
  }

  // QBO sync — only if the item is linked AND a QBO-relevant field changed
  const syncErrors: string[] = []
  const qboRelevantChanged =
    input.sku !== undefined ||
    input.title !== undefined ||
    input.selling_price !== undefined ||
    input.cost_price !== undefined ||
    input.vat_applicable !== undefined ||
    input.qbo_vendor_id !== undefined

  if (updated.qbo_item_id && qboRelevantChanged) {
    try {
      await updateQboItem({
        qboItemId: updated.qbo_item_id,
        sku: updated.sku,
        title: updated.title,
        sellingPrice: updated.selling_price,
        costPrice: updated.cost_price,
        vatApplicable: updated.vat_applicable,
        qboVendorId: updated.qbo_vendor_id || null,
      })
      console.log('[strategic/update] QBO updated:', updated.sku)
    } catch (err) {
      syncErrors.push(`QBO: ${String(err)}`)
      console.error('[strategic/update] QBO sync failed:', String(err))
    }
  }

  if (syncErrors.length > 0) {
    await db.from('products').update({ sync_error: syncErrors.join('; ') }).eq('id', id)
  } else if (updated.sync_error && updated.qbo_item_id) {
    await db.from('products').update({ sync_error: null }).eq('id', id)
  }

  return { product: updated, syncErrors }
}
