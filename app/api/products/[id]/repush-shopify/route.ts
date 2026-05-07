import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { createShopifyProduct, deleteShopifyProduct, addProductToCollections } from '@/lib/shopify/products'
import { isShopifySyncEnabled } from '@/lib/shopify/config'

// POST /api/products/[id]/repush-shopify — rebuild Shopify product only.
// Does NOT touch QBO. Safe to use on products that already have a working
// QBO item with stock, bills, or sales against them.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t0 = Date.now()
  const { id } = await params
  console.log('[repush-shopify] start', { id })

  if (!isShopifySyncEnabled()) {
    return NextResponse.json({ error: 'Shopify sync is disabled' }, { status: 400 })
  }

  try {
    const db = createServiceClient()
    const { data: product, error } = await db
      .from('products')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const results: { shopify?: string; errors: string[] } = { errors: [] }

    if (product.shopify_product_id) {
      try {
        console.log(`[repush-shopify] ${product.sku} → deleting Shopify product ${product.shopify_product_id}`)
        await deleteShopifyProduct(product.shopify_product_id)
      } catch (err) {
        console.warn(`[repush-shopify] ${product.sku} → Shopify delete failed (may already be gone):`, String(err))
      }
      await db.from('products').update({
        shopify_product_id: null,
        shopify_status: null,
      }).eq('id', id)
    }

    await db.from('products').update({ sync_error: null }).eq('id', id)

    try {
      const { shopifyProductId } = await createShopifyProduct({
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

      await db.from('products').update({
        shopify_product_id: shopifyProductId,
        shopify_status: 'draft',
      }).eq('id', id)

      if (product.collections?.length > 0) {
        await addProductToCollections(shopifyProductId, product.collections)
      }

      results.shopify = `ok (${shopifyProductId})`
      console.log(`[repush-shopify] ${product.sku} → Shopify ok, id=${shopifyProductId}`)
    } catch (err) {
      results.errors.push(`Shopify: ${String(err)}`)
      console.error(`[repush-shopify] ${product.sku} → Shopify FAILED:`, String(err))
      await db.from('products').update({ sync_error: `Shopify: ${String(err)}` }).eq('id', id)
    }

    console.log('[repush-shopify] done', { sku: product.sku, results, ms: Date.now() - t0 })
    return NextResponse.json(results, { status: results.errors.length > 0 ? 207 : 200 })
  } catch (e) {
    console.error('[repush-shopify] failed:', String(e), { ms: Date.now() - t0 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
