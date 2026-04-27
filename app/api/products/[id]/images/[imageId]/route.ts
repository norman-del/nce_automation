import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { deleteProductImage } from '@/lib/shopify/products'
import { isShopifySyncEnabled } from '@/lib/shopify/config'

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
