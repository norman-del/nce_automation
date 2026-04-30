import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { calculateShippingTier } from '@/lib/products/shipping'
import {
  createShopifyProduct,
  addProductToCollections,
  assignVariantToDeliveryProfile,
} from '@/lib/shopify/products'
import { createQboItem } from '@/lib/qbo/items'
import { isShopifySyncEnabled } from '@/lib/shopify/config'

// GET /api/products?status=processing&q=search&limit=50&offset=0
export async function GET(req: NextRequest) {
  const t0 = Date.now()
  const params = req.nextUrl.searchParams
  const status = params.get('status')
  const q = params.get('q')?.trim()
  const limit = Math.min(parseInt(params.get('limit') || '50', 10), 100)
  const offset = parseInt(params.get('offset') || '0', 10)

  console.log('[products/GET] start', { status, q, limit, offset })

  try {
    const db = createServiceClient()

    let query = db
      .from('products')
      .select('*, suppliers(id, name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) {
      query = query.eq('status', status)
    }

    if (q) {
      query = query.or(`sku.ilike.%${q}%,title.ilike.%${q}%,vendor.ilike.%${q}%`)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('[products/GET] Supabase error:', error.message, error.code)
      throw error
    }

    console.log('[products/GET] ok', { count, returned: data?.length, ms: Date.now() - t0 })
    return NextResponse.json({ products: data, total: count })
  } catch (e) {
    console.error('[products/GET] failed:', String(e), { ms: Date.now() - t0 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

type DbClient = ReturnType<typeof createServiceClient>

async function generateUniqueSku(db: DbClient): Promise<string> {
  const { data: skuRow, error: skuError } = await db.rpc('generate_product_sku')
  if (skuError) throw new Error(`SKU generation failed: ${skuError.message}`)
  return skuRow as string
}

interface ProductInput {
  sku_override?: string
  title: string
  condition: 'new' | 'used'
  vat_applicable: boolean
  cost_price: number
  selling_price: number
  original_rrp?: number | null
  model_number?: string | null
  year_of_manufacture?: number | null
  electrical_requirements?: string | null
  notes?: string | null
  width_cm: number
  height_cm: number
  depth_cm: number
  shipping_tier_override?: 0 | 1 | 2 | null
  weight_kg?: number | null
  supplier_id?: string
  qbo_vendor_id?: string | null
  qbo_vendor_name?: string | null
  product_type: string
  vendor: string
  collections?: string[] | null
  tags?: string[] | null
  body_html?: string | null
  shopify_delivery_profile_id?: string | null
  free_delivery_included?: boolean
  warranty_term_code?: string | null
}

// POST /api/products — create one or more products (batch supported)
export async function POST(req: NextRequest) {
  const t0 = Date.now()
  console.log('[products/POST] start')
  try {
    const body = await req.json()

    // Accept a single object or an array for batch creation
    const inputs: ProductInput[] = Array.isArray(body) ? body : [body]

    if (inputs.length === 0) {
      return NextResponse.json({ error: 'No products provided' }, { status: 400 })
    }

    const db = createServiceClient()
    const results: { sku: string; id: string; error?: string }[] = []

    for (const input of inputs) {
      try {
        // Validate required fields
        if (!input.title?.trim()) throw new Error('Title is required')
        if (!input.condition) throw new Error('Condition is required')
        if (input.cost_price == null) throw new Error('Cost price is required')
        if (input.selling_price == null) throw new Error('Selling price is required')
        if (input.width_cm == null || input.height_cm == null || input.depth_cm == null) {
          throw new Error('All dimensions (width, height, depth) are required')
        }
        if (!input.product_type?.trim()) throw new Error('Product type is required')
        if (!input.vendor?.trim()) throw new Error('Vendor/brand is required')

        // Use manual SKU or auto-generate
        let sku: string
        if (input.sku_override?.trim()) {
          sku = input.sku_override.trim()
          // Check uniqueness before insert to give a clear error
          const { data: existing } = await db
            .from('products')
            .select('id')
            .eq('sku', sku)
            .maybeSingle()
          if (existing) throw new Error(`SKU "${sku}" is already in use`)
        } else {
          sku = await generateUniqueSku(db)
        }

        // Calculate shipping tier (auto), then apply override if provided.
        const autoShippingTier = calculateShippingTier(
          input.width_cm,
          input.height_cm,
          input.depth_cm,
          input.weight_kg ?? null
        )
        const overrideTier = input.shipping_tier_override ?? null
        const shippingTier = overrideTier ?? autoShippingTier

        const { data, error } = await db
          .from('products')
          .insert({
            sku,
            title: input.title.trim(),
            condition: input.condition,
            vat_applicable: input.vat_applicable ?? false,
            cost_price: input.cost_price,
            selling_price: input.selling_price,
            original_rrp: input.original_rrp ?? null,
            model_number: input.model_number?.trim() || null,
            year_of_manufacture: input.year_of_manufacture ?? null,
            electrical_requirements: input.electrical_requirements?.trim() || null,
            notes: input.notes?.trim() || null,
            width_cm: input.width_cm,
            height_cm: input.height_cm,
            depth_cm: input.depth_cm,
            weight_kg: input.weight_kg ?? null,
            shipping_tier: autoShippingTier,
            shipping_tier_override: overrideTier,
            supplier_id: input.supplier_id || null,
            qbo_vendor_id: input.qbo_vendor_id || null,
            qbo_vendor_name: input.qbo_vendor_name || null,
            product_type: input.product_type.trim(),
            vendor: input.vendor.trim(),
            collections: input.collections ?? [],
            tags: input.tags ?? [],
            body_html: input.body_html?.trim() || null,
            shopify_delivery_profile_id: input.shopify_delivery_profile_id || null,
            free_delivery_included: input.free_delivery_included ?? false,
            warranty_term_code: input.warranty_term_code || null,
            // TODO(WP-6): during the cutover window, mirror this flag onto the
            // Shopify product (tag or metafield) so the live store renders the
            // same shipping behaviour. See PRD §3.10 WP-6 — automation half.
          })
          .select()
          .single()

        if (error) throw error

        // Push to Shopify as draft (non-blocking — product is saved even if Shopify fails)
        if (isShopifySyncEnabled()) {
          console.log(`[products/POST] ${sku} → Shopify push starting`)
          try {
            const { shopifyProductId, shopifyVariantId } = await createShopifyProduct({
              sku,
              title: input.title.trim(),
              condition: input.condition,
              vatApplicable: input.vat_applicable ?? false,
              sellingPrice: input.selling_price,
              productType: input.product_type.trim(),
              vendor: input.vendor.trim(),
              tags: input.tags ?? [],
              shippingTier,
              widthCm: input.width_cm,
              heightCm: input.height_cm,
              depthCm: input.depth_cm,
              weightKg: input.weight_kg ?? null,
              notes: input.notes?.trim() || null,
              bodyHtml: input.body_html?.trim() || null,
            })

            // Update Supabase with Shopify ID
            await db
              .from('products')
              .update({ shopify_product_id: shopifyProductId, shopify_status: 'draft' })
              .eq('id', data.id)

            // Add to collections if any
            if (input.collections && input.collections.length > 0) {
              await addProductToCollections(shopifyProductId, input.collections)
            }

            // Attach to chosen delivery profile so Rich doesn't have to do it
            // manually in Shopify admin. Best-effort — a missing scope or bad
            // profile id shouldn't block product creation.
            if (input.shopify_delivery_profile_id && shopifyVariantId) {
              try {
                await assignVariantToDeliveryProfile(
                  input.shopify_delivery_profile_id,
                  shopifyVariantId
                )
              } catch (profileErr) {
                console.warn(
                  `[products/POST] ${sku} → delivery profile assignment failed (non-fatal):`,
                  String(profileErr)
                )
              }
            }

            console.log(`[products/POST] ${sku} → Shopify ok, productId=${shopifyProductId}`)
          } catch (shopifyErr) {
            console.error(`[products/POST] ${sku} → Shopify FAILED:`, String(shopifyErr))
            await db
              .from('products')
              .update({ sync_error: `Shopify: ${String(shopifyErr)}` })
              .eq('id', data.id)
          }
        } else {
          console.log(`[products/POST] ${sku} → Shopify sync disabled, skipping`)
        }

        // Push to QBO (non-blocking — product is saved even if QBO fails)
        console.log(`[products/POST] ${sku} → QBO push starting`)
        try {
          const qboItemId = await createQboItem({
            sku,
            title: input.title.trim(),
            sellingPrice: input.selling_price,
            costPrice: input.cost_price,
            vatApplicable: input.vat_applicable ?? false,
            qboVendorId: input.qbo_vendor_id || null,
          })

          await db
            .from('products')
            .update({ qbo_item_id: qboItemId, qbo_synced: true })
            .eq('id', data.id)
          console.log(`[products/POST] ${sku} → QBO ok, itemId=${qboItemId}`)
        } catch (qboErr) {
          console.error(`[products/POST] ${sku} → QBO FAILED:`, String(qboErr))
          const existing = (
            await db.from('products').select('sync_error').eq('id', data.id).single()
          ).data
          const prevError = existing?.sync_error ? `${existing.sync_error}; ` : ''
          await db
            .from('products')
            .update({ sync_error: `${prevError}QBO: ${String(qboErr)}` })
            .eq('id', data.id)
        }

        // Fire-and-forget: notify nce-site chatbot to re-index this product.
        // Best-effort — embedding gateway hiccups must not stall product save.
        // Requires a `handle` (nce-site keys product chunks by handle).
        const siteUrl = process.env.NCE_SITE_URL
        const internalKey = process.env.INTERNAL_API_KEY
        if (siteUrl && internalKey && data.handle) {
          const productHandle = data.handle as string
          fetch(`${siteUrl}/api/chat/reindex`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': internalKey,
            },
            body: JSON.stringify({ kind: 'product', id: productHandle }),
          })
            .then(async (res) => {
              if (!res.ok) {
                const respBody = await res.json().catch(() => ({}))
                console.warn('[products/POST] chat reindex trigger failed:', respBody.error ?? res.status)
                try {
                  await db.from('sync_log').insert({
                    action: 'nce_site_chat_reindex',
                    status: 'error',
                    details: { product_id: data.id, handle: productHandle, http_status: res.status, error: respBody.error ?? null },
                  })
                } catch {
                  // ignore secondary logging failure
                }
              }
            })
            .catch(async (err) => {
              console.warn('[products/POST] chat reindex trigger request failed:', String(err))
              try {
                await db.from('sync_log').insert({
                  action: 'nce_site_chat_reindex',
                  status: 'error',
                  details: { product_id: data.id, handle: productHandle, error: String(err) },
                })
              } catch {
                // ignore secondary logging failure
              }
            })
        }

        results.push({ sku, id: data.id })
      } catch (itemError) {
        results.push({
          sku: '',
          id: '',
          error: itemError instanceof Error ? itemError.message : String(itemError),
        })
      }
    }

    const hasErrors = results.some((r) => r.error)
    console.log('[products/POST] done', { total: results.length, errors: results.filter(r => r.error).length, ms: Date.now() - t0 })
    return NextResponse.json(
      { products: results },
      { status: hasErrors ? 207 : 201 }
    )
  } catch (e) {
    console.error('[products/POST] failed:', String(e), { ms: Date.now() - t0 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
