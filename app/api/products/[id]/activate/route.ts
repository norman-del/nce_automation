import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { updateProductStatus } from '@/lib/shopify/products'
import { isShopifySyncEnabled } from '@/lib/shopify/config'

// POST /api/products/[id]/activate — flip a draft product to active.
// Split out from the image-upload route because doing both in the same
// request caused concurrent activation PUTs against Shopify (one per
// parallel image upload), which Shopify rejects with 409 Conflict.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t0 = Date.now()
  try {
    const { id } = await params
    const db = createServiceClient()
    const shopifyEnabled = isShopifySyncEnabled()

    const { data: product, error: fetchErr } = await db
      .from('products')
      .select('id, sku, shopify_product_id, status')
      .eq('id', id)
      .single()

    if (fetchErr || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    console.log('[activate/POST] start', { sku: product.sku, shopifyId: product.shopify_product_id, status: product.status })

    if (shopifyEnabled && product.shopify_product_id) {
      await updateProductStatus(product.shopify_product_id, 'active')
      await db
        .from('products')
        .update({
          status: 'active',
          shopify_status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
    } else {
      await db
        .from('products')
        .update({
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
    }

    console.log('[activate/POST] ok', { sku: product.sku, ms: Date.now() - t0 })
    return NextResponse.json({ activated: true })
  } catch (e) {
    console.error('[activate/POST] failed:', String(e), { ms: Date.now() - t0 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
