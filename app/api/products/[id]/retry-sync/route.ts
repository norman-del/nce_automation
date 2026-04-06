import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { createShopifyProduct, addProductToCollections } from '@/lib/shopify/products'
import { createQboItem, findOrCreateQboVendor } from '@/lib/qbo/items'

// POST /api/products/[id]/retry-sync — retry failed Shopify/QBO sync
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t0 = Date.now()
  const { id } = await params
  console.log('[retry-sync] start', { id })

  try {
    const db = createServiceClient()
    const { data: product, error } = await db
      .from('products')
      .select('*, suppliers(*)')
      .eq('id', id)
      .single()

    if (error || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const results: { shopify?: string; qbo?: string; errors: string[] } = { errors: [] }

    // Retry Shopify if not yet synced
    if (!product.shopify_product_id) {
      console.log(`[retry-sync] ${product.sku} → Shopify push`)
      try {
        const { shopifyProductId } = await createShopifyProduct({
          sku: product.sku,
          title: product.title,
          condition: product.condition,
          sellingPrice: product.selling_price,
          productType: product.product_type,
          vendor: product.vendor,
          tags: product.tags ?? [],
          shippingTier: product.shipping_tier,
          widthCm: product.width_cm,
          heightCm: product.height_cm,
          depthCm: product.depth_cm,
          weightKg: product.weight_kg,
        })

        await db
          .from('products')
          .update({ shopify_product_id: shopifyProductId, shopify_status: 'draft' })
          .eq('id', id)

        if (product.collections?.length > 0) {
          await addProductToCollections(shopifyProductId, product.collections)
        }

        results.shopify = `ok (${shopifyProductId})`
        console.log(`[retry-sync] ${product.sku} → Shopify ok, id=${shopifyProductId}`)
      } catch (err) {
        const msg = `Shopify: ${String(err)}`
        results.errors.push(msg)
        console.error(`[retry-sync] ${product.sku} → Shopify FAILED:`, String(err))
      }
    } else {
      results.shopify = 'already synced'
    }

    // Retry QBO if not yet synced
    if (!product.qbo_synced) {
      console.log(`[retry-sync] ${product.sku} → QBO push`)
      try {
        let qboVendorId: string | null = null
        if (product.supplier_id && product.suppliers) {
          if (product.suppliers.qbo_vendor_id) {
            qboVendorId = product.suppliers.qbo_vendor_id
          } else {
            qboVendorId = await findOrCreateQboVendor(product.suppliers)
            await db
              .from('suppliers')
              .update({ qbo_vendor_id: qboVendorId, updated_at: new Date().toISOString() })
              .eq('id', product.suppliers.id)
          }
        }

        const qboItemId = await createQboItem({
          sku: product.sku,
          title: product.title,
          sellingPrice: product.selling_price,
          costPrice: product.cost_price,
          vatApplicable: product.vat_applicable,
          qboVendorId,
        })

        await db
          .from('products')
          .update({ qbo_item_id: qboItemId, qbo_synced: true })
          .eq('id', id)

        results.qbo = `ok (${qboItemId})`
        console.log(`[retry-sync] ${product.sku} → QBO ok, itemId=${qboItemId}`)
      } catch (err) {
        const msg = `QBO: ${String(err)}`
        results.errors.push(msg)
        console.error(`[retry-sync] ${product.sku} → QBO FAILED:`, String(err))
      }
    } else {
      results.qbo = 'already synced'
    }

    // Update sync_error field
    if (results.errors.length > 0) {
      await db
        .from('products')
        .update({ sync_error: results.errors.join('; ') })
        .eq('id', id)
    } else {
      await db
        .from('products')
        .update({ sync_error: null })
        .eq('id', id)
    }

    console.log('[retry-sync] done', { sku: product.sku, results, ms: Date.now() - t0 })
    return NextResponse.json(results, { status: results.errors.length > 0 ? 207 : 200 })
  } catch (e) {
    console.error('[retry-sync] failed:', String(e), { ms: Date.now() - t0 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
