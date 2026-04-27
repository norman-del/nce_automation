import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { updateProductImagePosition } from '@/lib/shopify/products'
import { isShopifySyncEnabled } from '@/lib/shopify/config'

// PATCH /api/products/[id]/images/order
// Body: { order: number[] }  — array of Shopify image IDs in desired display order
//
// Updates positions on Shopify (REST PUT per image, in order) and mirrors the
// new position back to product_images.position. Position 1 is the cover image.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t0 = Date.now()
  try {
    const { id } = await params
    const { order } = (await req.json()) as { order: number[] }

    if (!Array.isArray(order) || order.length === 0) {
      return NextResponse.json({ error: 'order array is required' }, { status: 400 })
    }

    const db = createServiceClient()

    const { data: product } = await db
      .from('products')
      .select('id, sku, shopify_product_id')
      .eq('id', id)
      .single()
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    const errors: string[] = []

    if (isShopifySyncEnabled() && product.shopify_product_id) {
      // Shopify positions are 1-indexed. Apply sequentially — applying in
      // parallel makes Shopify auto-shift positions in conflicting ways.
      for (let i = 0; i < order.length; i++) {
        const imageId = order[i]
        const position = i + 1
        try {
          await updateProductImagePosition(product.shopify_product_id, imageId, position)
        } catch (e) {
          errors.push(`image ${imageId}: ${String(e)}`)
        }
      }
    }

    // Mirror to Supabase. Using a single UPDATE with CASE would be cleaner, but
    // PostgREST doesn't expose CASE — issue one update per image.
    for (let i = 0; i < order.length; i++) {
      await db
        .from('product_images')
        .update({ position: i + 1 })
        .eq('product_id', id)
        .eq('shopify_image_id', order[i])
    }

    console.log('[images/order] done', { sku: product.sku, count: order.length, errors: errors.length, ms: Date.now() - t0 })
    return NextResponse.json({ ok: errors.length === 0, errors })
  } catch (e) {
    console.error('[images/order] failed:', String(e))
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
