import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { createShopifyProduct, deleteShopifyProduct, addProductToCollections } from '@/lib/shopify/products'
import { createQboItem } from '@/lib/qbo/items'
import { getQboClient } from '@/lib/qbo/client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QboAny = any

// POST /api/products/[id]/repush — delete from Shopify+QBO and re-create
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t0 = Date.now()
  const { id } = await params
  console.log('[repush] start', { id })

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

    const results: { shopify?: string; qbo?: string; errors: string[] } = { errors: [] }

    // 1. Delete existing Shopify product if it exists
    if (product.shopify_product_id) {
      try {
        console.log(`[repush] ${product.sku} → deleting Shopify product ${product.shopify_product_id}`)
        await deleteShopifyProduct(product.shopify_product_id)
      } catch (err) {
        console.warn(`[repush] ${product.sku} → Shopify delete failed (may already be gone):`, String(err))
      }
      await db.from('products').update({
        shopify_product_id: null,
        shopify_status: null,
      }).eq('id', id)
    }

    // 2. Delete existing QBO item if it exists
    if (product.qbo_item_id) {
      try {
        console.log(`[repush] ${product.sku} → deactivating QBO item ${product.qbo_item_id}`)
        const { client: _client } = await getQboClient()
        const client = _client as QboAny
        // QBO doesn't allow hard delete of items — set Active to false
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
      } catch (err) {
        console.warn(`[repush] ${product.sku} → QBO deactivate failed (may already be gone):`, String(err))
      }
      await db.from('products').update({
        qbo_item_id: null,
        qbo_synced: false,
      }).eq('id', id)
    }

    // 3. Clear sync error
    await db.from('products').update({ sync_error: null }).eq('id', id)

    // 4. Re-create in Shopify
    console.log(`[repush] ${product.sku} → Shopify push`)
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
      console.log(`[repush] ${product.sku} → Shopify ok, id=${shopifyProductId}`)
    } catch (err) {
      results.errors.push(`Shopify: ${String(err)}`)
      console.error(`[repush] ${product.sku} → Shopify FAILED:`, String(err))
    }

    // 5. Re-create in QBO
    console.log(`[repush] ${product.sku} → QBO push`)
    try {
      const qboItemId = await createQboItem({
        sku: product.sku,
        title: product.title,
        sellingPrice: product.selling_price,
        costPrice: product.cost_price,
        vatApplicable: product.vat_applicable,
        qboVendorId: product.qbo_vendor_id || null,
      })

      await db.from('products').update({
        qbo_item_id: qboItemId,
        qbo_synced: true,
      }).eq('id', id)

      results.qbo = `ok (${qboItemId})`
      console.log(`[repush] ${product.sku} → QBO ok, itemId=${qboItemId}`)
    } catch (err) {
      results.errors.push(`QBO: ${String(err)}`)
      console.error(`[repush] ${product.sku} → QBO FAILED:`, String(err))
    }

    // Update sync_error
    if (results.errors.length > 0) {
      await db.from('products').update({ sync_error: results.errors.join('; ') }).eq('id', id)
    }

    console.log('[repush] done', { sku: product.sku, results, ms: Date.now() - t0 })
    return NextResponse.json(results, { status: results.errors.length > 0 ? 207 : 200 })
  } catch (e) {
    console.error('[repush] failed:', String(e), { ms: Date.now() - t0 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
