import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { deleteProductImage } from '@/lib/shopify/products'
import { isShopifySyncEnabled } from '@/lib/shopify/config'

// PATCH /api/products/[id]/images/[imageId]
// Body: { alt_text: string | null }
// Updates the alt_text on the matching product_images row. We only persist to
// our DB — Shopify's image API doesn't accept alt on REST PUT for a product
// image, and the storefront reads alt straight from product_images.alt_text
// via Supabase, so a DB-only write is sufficient.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  try {
    const { id, imageId } = await params
    const shopifyImageId = parseInt(imageId, 10)
    if (Number.isNaN(shopifyImageId)) {
      return NextResponse.json({ error: 'Invalid image id' }, { status: 400 })
    }

    const body = (await req.json().catch(() => ({}))) as { alt_text?: string | null }
    const altRaw = body.alt_text
    // Trim and normalise empty string to null so we don't store blanks.
    const altText =
      typeof altRaw === 'string' ? (altRaw.trim() === '' ? null : altRaw.trim()) : null

    const db = createServiceClient()
    const { error } = await db
      .from('product_images')
      .update({ alt_text: altText })
      .eq('product_id', id)
      .eq('shopify_image_id', shopifyImageId)

    if (error) {
      console.error('[images/PATCH] update failed:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, alt_text: altText })
  } catch (e) {
    console.error('[images/PATCH] failed:', String(e))
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE /api/products/[id]/images/[imageId]
// imageId is the Shopify image ID (numeric). Removes from Shopify and from our
// product_images table.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  try {
    const { id, imageId } = await params
    const shopifyImageId = parseInt(imageId, 10)
    if (Number.isNaN(shopifyImageId)) {
      return NextResponse.json({ error: 'Invalid image id' }, { status: 400 })
    }

    const db = createServiceClient()
    const { data: product } = await db
      .from('products')
      .select('id, sku, shopify_product_id')
      .eq('id', id)
      .single()
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    if (isShopifySyncEnabled() && product.shopify_product_id) {
      try {
        await deleteProductImage(product.shopify_product_id, shopifyImageId)
      } catch (e) {
        // 404 from Shopify means it's already gone — fine, fall through.
        console.warn('[images/DELETE] Shopify delete failed (continuing):', String(e))
      }
    }

    await db
      .from('product_images')
      .delete()
      .eq('product_id', id)
      .eq('shopify_image_id', shopifyImageId)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[images/DELETE] failed:', String(e))
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
