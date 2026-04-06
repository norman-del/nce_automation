import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { calculateShippingTier } from '@/lib/products/shipping'
import { deleteShopifyProduct } from '@/lib/shopify/products'
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

// PATCH /api/products/[id] — update product fields
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const db = createServiceClient()

    // If dimensions changed, recalculate shipping tier
    const updates = { ...body, updated_at: new Date().toISOString() }

    if (body.width_cm != null || body.height_cm != null || body.depth_cm != null) {
      // Fetch current dimensions to fill in any missing values
      const { data: current, error: fetchError } = await db
        .from('products')
        .select('width_cm, height_cm, depth_cm, weight_kg')
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError

      const w = body.width_cm ?? current.width_cm
      const h = body.height_cm ?? current.height_cm
      const d = body.depth_cm ?? current.depth_cm
      const wt = body.weight_kg ?? current.weight_kg

      updates.shipping_tier = calculateShippingTier(w, h, d, wt)
    }

    const { data, error } = await db
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (e) {
    console.error('Product PATCH error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
