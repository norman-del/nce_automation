import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { createShopifyProduct, addProductToCollections } from '@/lib/shopify/products'
import { createQboItem } from '@/lib/qbo/items'
import { isShopifySyncEnabled } from '@/lib/shopify/config'

// POST /api/products/batch-retry — retry all products with sync errors
export async function POST() {
  const t0 = Date.now()
  console.log('[batch-retry] start')

  try {
    const db = createServiceClient()

    // Find all products that have at least one failed sync
    const { data: products, error } = await db
      .from('products')
      .select('*')
      .not('sync_error', 'is', null)
      .order('created_at', { ascending: true })

    if (error) throw error

    if (!products || products.length === 0) {
      return NextResponse.json({ message: 'No failed products to retry', results: [] })
    }

    console.log(`[batch-retry] found ${products.length} products with sync errors`)

    const results: {
      id: string
      sku: string
      shopify?: string
      qbo?: string
      errors: string[]
    }[] = []

    for (const product of products) {
      const item: typeof results[number] = {
        id: product.id,
        sku: product.sku,
        errors: [],
      }

      // Retry Shopify if not yet synced
      if (!product.shopify_product_id && isShopifySyncEnabled()) {
        console.log(`[batch-retry] ${product.sku} -> Shopify push`)
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
            bodyHtml: product.body_html,
          })

          await db
            .from('products')
            .update({ shopify_product_id: shopifyProductId, shopify_status: 'draft' })
            .eq('id', product.id)

          if (product.collections?.length > 0) {
            await addProductToCollections(shopifyProductId, product.collections)
          }

          item.shopify = `ok (${shopifyProductId})`
          console.log(`[batch-retry] ${product.sku} -> Shopify ok, id=${shopifyProductId}`)
        } catch (err) {
          const msg = `Shopify: ${String(err)}`
          item.errors.push(msg)
          console.error(`[batch-retry] ${product.sku} -> Shopify FAILED:`, String(err))
        }
      } else {
        item.shopify = product.shopify_product_id ? 'already synced' : 'sync disabled'
      }

      // Retry QBO if not yet synced
      if (!product.qbo_synced) {
        console.log(`[batch-retry] ${product.sku} -> QBO push`)
        try {
          const qboItemId = await createQboItem({
            sku: product.sku,
            title: product.title,
            sellingPrice: product.selling_price,
            costPrice: product.cost_price,
            vatApplicable: product.vat_applicable,
            qboVendorId: product.qbo_vendor_id || null,
          })

          await db
            .from('products')
            .update({ qbo_item_id: qboItemId, qbo_synced: true })
            .eq('id', product.id)

          item.qbo = `ok (${qboItemId})`
          console.log(`[batch-retry] ${product.sku} -> QBO ok, itemId=${qboItemId}`)
        } catch (err) {
          const msg = `QBO: ${String(err)}`
          item.errors.push(msg)
          console.error(`[batch-retry] ${product.sku} -> QBO FAILED:`, String(err))
        }
      } else {
        item.qbo = 'already synced'
      }

      // Update sync_error: clear if all good, update if still failing
      if (item.errors.length > 0) {
        await db
          .from('products')
          .update({ sync_error: item.errors.join('; ') })
          .eq('id', product.id)
      } else {
        await db
          .from('products')
          .update({ sync_error: null })
          .eq('id', product.id)
      }

      results.push(item)
    }

    const succeeded = results.filter((r) => r.errors.length === 0).length
    const failed = results.filter((r) => r.errors.length > 0).length

    console.log('[batch-retry] done', { total: results.length, succeeded, failed, ms: Date.now() - t0 })

    return NextResponse.json(
      { total: results.length, succeeded, failed, results },
      { status: failed > 0 ? 207 : 200 }
    )
  } catch (e) {
    console.error('[batch-retry] failed:', String(e), { ms: Date.now() - t0 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
