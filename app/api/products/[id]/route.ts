import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { calculateShippingTier } from '@/lib/products/shipping'
import { deleteShopifyProduct, updateShopifyProduct } from '@/lib/shopify/products'
import { updateQboItem } from '@/lib/qbo/items'
import { getQboClient } from '@/lib/qbo/client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QboAny = any

// DELETE /api/products/[id] — delete from Supabase, Shopify, and QBO
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const db = createServiceClient()

    // Fetch product first to get Shopify/QBO IDs
    const { data: product } = await db
      .from('products')
      .select('id, sku, shopify_product_id, qbo_item_id')
      .eq('id', id)
      .single()

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    console.log('[products/DELETE] start', { id, sku: product.sku, shopify: product.shopify_product_id, qbo: product.qbo_item_id })

    // Delete from Shopify
    if (product.shopify_product_id) {
      try {
        await deleteShopifyProduct(product.shopify_product_id)
        console.log('[products/DELETE] Shopify product deleted:', product.shopify_product_id)
      } catch (err) {
        console.warn('[products/DELETE] Shopify delete failed (may already be gone):', String(err))
      }
    }

    // Deactivate in QBO (QBO doesn't allow hard delete of items)
    if (product.qbo_item_id) {
      try {
        const { client: _client } = await getQboClient()
        const client = _client as QboAny
        await new Promise<void>((resolve, reject) => {
          client.updateItem({
            Id: product.qbo_item_id,
            SyncToken: '0',
            Active: false,
          }, (err: unknown) => {
            if (err) reject(err)
            else resolve()
          })
        })
        console.log('[products/DELETE] QBO item deactivated:', product.qbo_item_id)
      } catch (err) {
        console.warn('[products/DELETE] QBO deactivate failed (may already be gone):', String(err))
      }
    }

    // Delete from Supabase (product_images cascade-deletes via FK)
    const { error } = await db
      .from('products')
      .delete()
      .eq('id', id)

    if (error) throw error

    console.log('[products/DELETE] done:', product.sku)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[products/DELETE] failed:', String(e))
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// GET /api/products/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const db = createServiceClient()

    const { data, error } = await db
      .from('products')
      .select('*, suppliers(*), product_images(*)')
      .eq('id', id)
      .single()

    if (error) throw error
    if (!data) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (e) {
    console.error('Product GET error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PATCH /api/products/[id] — update product fields in Supabase, then sync to Shopify + QBO
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const db = createServiceClient()

    // Fetch current product (need it for dimension merge + external IDs)
    const { data: current, error: fetchError } = await db
      .from('products')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !current) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // If SKU is being changed, validate uniqueness
    if (body.sku != null && body.sku !== current.sku) {
      const trimmedSku = body.sku.trim()
      if (!trimmedSku) {
        return NextResponse.json({ error: 'SKU cannot be empty' }, { status: 400 })
      }
      const { data: existing } = await db
        .from('products')
        .select('id')
        .eq('sku', trimmedSku)
        .neq('id', id)
        .maybeSingle()
      if (existing) {
        return NextResponse.json({ error: `SKU "${trimmedSku}" is already in use` }, { status: 409 })
      }
      body.sku = trimmedSku
    }

    // If dimensions changed, recalculate shipping tier
    const updates = { ...body, updated_at: new Date().toISOString() }

    if (body.width_cm != null || body.height_cm != null || body.depth_cm != null) {
      const w = body.width_cm ?? current.width_cm
      const h = body.height_cm ?? current.height_cm
      const d = body.depth_cm ?? current.depth_cm
      const wt = body.weight_kg ?? current.weight_kg
      updates.shipping_tier = calculateShippingTier(w, h, d, wt)
    }

    // Save to Supabase
    const { data, error } = await db
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // Sync to external systems (non-blocking — collect errors but don't fail the request)
    const syncErrors: string[] = []
    const product = data

    // Sync to Shopify if product has a Shopify ID
    if (product.shopify_product_id) {
      try {
        await updateShopifyProduct(product.shopify_product_id, {
          sku: product.sku,
          title: product.title,
          condition: product.condition,
          vatApplicable: product.vat_applicable,
          sellingPrice: product.selling_price,
          productType: product.product_type,
          vendor: product.vendor,
          tags: product.tags ?? [],
          shippingTier: product.shipping_tier,
          widthCm: product.width_cm,
          heightCm: product.height_cm,
          depthCm: product.depth_cm,
          weightKg: product.weight_kg,
          notes: product.notes,
        })
        console.log('[products/PATCH] Shopify updated:', product.sku)
      } catch (err) {
        syncErrors.push(`Shopify: ${String(err)}`)
        console.error('[products/PATCH] Shopify sync failed:', String(err))
      }
    }

    // Sync to QBO if product has a QBO item ID
    if (product.qbo_item_id) {
      try {
        await updateQboItem({
          qboItemId: product.qbo_item_id,
          sku: product.sku,
          title: product.title,
          sellingPrice: product.selling_price,
          costPrice: product.cost_price,
          vatApplicable: product.vat_applicable,
          qboVendorId: product.qbo_vendor_id || null,
        })
        console.log('[products/PATCH] QBO updated:', product.sku)
      } catch (err) {
        syncErrors.push(`QBO: ${String(err)}`)
        console.error('[products/PATCH] QBO sync failed:', String(err))
      }
    }

    // Store sync errors if any
    if (syncErrors.length > 0) {
      await db.from('products').update({ sync_error: syncErrors.join('; ') }).eq('id', id)
      return NextResponse.json({ ...product, sync_error: syncErrors.join('; '), _syncErrors: syncErrors }, { status: 207 })
    }

    // Clear any previous sync errors on success
    if (product.sync_error && (product.shopify_product_id || product.qbo_item_id)) {
      await db.from('products').update({ sync_error: null }).eq('id', id)
    }

    return NextResponse.json(data)
  } catch (e) {
    console.error('Product PATCH error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
