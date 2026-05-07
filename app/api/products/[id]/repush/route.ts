import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { createShopifyProduct, deleteShopifyProduct, addProductToCollections } from '@/lib/shopify/products'
import { createQboItem } from '@/lib/qbo/items'
import { getQboClient } from '@/lib/qbo/client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QboAny = any

// POST /api/products/[id]/repush — DESTRUCTIVE: delete from Shopify+QBO and
// re-create from scratch.
//
// 2026-05-07 incident (Bill 818, SKU 6429/6434/6435/6436/6437/6438/6439):
// the QBO half of this action deactivates the existing inventory item. QBO
// auto-zeroes its QtyOnHand on deactivation (via Shrinkage adjustment) and
// the item shows " (deleted)" against any bills/invoices/sales that
// referenced it. The replacement item starts at QtyOnHand 0 with no history.
// Recovering takes manual bill-line edits in the QBO UI.
//
// To prevent another incident this endpoint now:
//   1. Requires a body of `{ confirmedSku: "<sku>" }` matching the product's
//      current SKU. Stops accidental clicks.
//   2. Reads the QBO item's QtyOnHand before deactivating. If non-zero, the
//      request is rejected — recreating an item with stock against it is
//      almost never the right move and demands manual intervention.
//   3. Logs every successful destructive run to sync_log.
//
// For the normal "Shopify push got into a weird state" case, use the
// safer `/api/products/[id]/repush-shopify` endpoint instead.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t0 = Date.now()
  const { id } = await params

  let body: { confirmedSku?: unknown } = {}
  try {
    body = (await req.json()) as { confirmedSku?: unknown }
  } catch {
    // empty body
  }
  const confirmedSku = typeof body.confirmedSku === 'string' ? body.confirmedSku : ''

  console.log('[repush] start', { id, hasConfirmation: !!confirmedSku })

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

    if (confirmedSku !== product.sku) {
      return NextResponse.json(
        {
          error:
            'This action recreates the QuickBooks item, deactivating the old one. ' +
            'Stock on the old item is zeroed and any bills/invoices that reference it ' +
            'will show "(deleted)". Confirm by sending { "confirmedSku": "<sku>" } in the body.',
        },
        { status: 400 }
      )
    }

    // QBO safety check — if the live QBO item has stock, refuse.
    if (product.qbo_item_id) {
      try {
        const { client: _client } = await getQboClient()
        const client = _client as QboAny
        const item = await new Promise<{ QtyOnHand?: number }>((resolve, reject) => {
          client.getItem(product.qbo_item_id, (err: unknown, result: { QtyOnHand?: number }) => {
            if (err) reject(err)
            else resolve(result)
          })
        })
        const qty = Number(item.QtyOnHand ?? 0)
        if (qty > 0) {
          return NextResponse.json(
            {
              error:
                `Refused: QuickBooks item ${product.qbo_item_id} currently has QtyOnHand=${qty}. ` +
                'Recreating it would zero the stock and orphan any bills/invoices against it. ' +
                'Resolve the inventory in QBO first, or use /repush-shopify if you only need to fix Shopify.',
            },
            { status: 409 }
          )
        }
      } catch (err) {
        console.warn('[repush] QBO pre-check failed; refusing to proceed:', String(err))
        return NextResponse.json(
          { error: `QBO pre-check failed: ${String(err)}. Refusing destructive write.` },
          { status: 502 }
        )
      }
    }

    const results: { shopify?: string; qbo?: string; errors: string[] } = { errors: [] }
    const originalQboItemId = product.qbo_item_id ?? null

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

    // 2. Deactivate existing QBO item
    if (product.qbo_item_id) {
      try {
        console.log(`[repush] ${product.sku} → deactivating QBO item ${product.qbo_item_id}`)
        const { client: _client } = await getQboClient()
        const client = _client as QboAny
        // Fetch current SyncToken — QBO rejects updates with a stale token.
        const current = await new Promise<{ Id: string; SyncToken: string }>((resolve, reject) => {
          client.getItem(product.qbo_item_id, (err: unknown, result: { Id: string; SyncToken: string }) => {
            if (err) reject(err)
            else resolve(result)
          })
        })
        await new Promise<void>((resolve, reject) => {
          client.updateItem({
            Id: product.qbo_item_id,
            SyncToken: current.SyncToken,
            sparse: true,
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
    let newQboItemId: string | null = null
    console.log(`[repush] ${product.sku} → QBO push`)
    try {
      newQboItemId = await createQboItem({
        sku: product.sku,
        title: product.title,
        sellingPrice: product.selling_price,
        costPrice: product.cost_price,
        vatApplicable: product.vat_applicable,
        qboVendorId: product.qbo_vendor_id || null,
      })

      await db.from('products').update({
        qbo_item_id: newQboItemId,
        qbo_synced: true,
      }).eq('id', id)

      results.qbo = `ok (${newQboItemId})`
      console.log(`[repush] ${product.sku} → QBO ok, itemId=${newQboItemId}`)
    } catch (err) {
      results.errors.push(`QBO: ${String(err)}`)
      console.error(`[repush] ${product.sku} → QBO FAILED:`, String(err))
    }

    if (results.errors.length > 0) {
      await db.from('products').update({ sync_error: results.errors.join('; ') }).eq('id', id)
    }

    // Audit log — destructive action, always record it
    await db.from('sync_log').insert({
      action: 'product_repush_destructive',
      status: results.errors.length > 0 ? 'partial' : 'success',
      details: {
        product_id: id,
        sku: product.sku,
        original_qbo_item_id: originalQboItemId,
        new_qbo_item_id: newQboItemId,
        original_shopify_product_id: product.shopify_product_id ?? null,
        errors: results.errors,
        durationMs: Date.now() - t0,
      },
    })

    console.log('[repush] done', { sku: product.sku, results, ms: Date.now() - t0 })
    return NextResponse.json(results, { status: results.errors.length > 0 ? 207 : 200 })
  } catch (e) {
    console.error('[repush] failed:', String(e), { ms: Date.now() - t0 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
