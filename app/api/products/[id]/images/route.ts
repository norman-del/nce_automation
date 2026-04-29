import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { uploadProductImage } from '@/lib/shopify/products'
import { isShopifySyncEnabled } from '@/lib/shopify/config'

// POST /api/products/[id]/images — upload photos. Activation is a separate
// call (POST /api/products/[id]/activate) so concurrent image uploads don't
// race on Shopify's per-product write lock.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t0 = Date.now()
  try {
    const { id } = await params
    const db = createServiceClient()
    const shopifyEnabled = isShopifySyncEnabled()

    // Verify product exists
    const { data: product, error: fetchErr } = await db
      .from('products')
      .select('id, sku, shopify_product_id, status')
      .eq('id', id)
      .single()

    if (fetchErr || !product) {
      console.error('[images/POST] Product not found:', id, fetchErr?.message)
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    console.log('[images/POST] start', { sku: product.sku, shopifyId: product.shopify_product_id, status: product.status, shopifyEnabled })

    // When Shopify sync is enabled, we need a Shopify ID to upload images
    if (shopifyEnabled && !product.shopify_product_id) {
      console.warn('[images/POST] No Shopify ID — cannot upload images for', product.sku)
      return NextResponse.json(
        { error: 'Product has not been pushed to Shopify yet. Retry the Shopify sync first.' },
        { status: 400 }
      )
    }

    const formData = await req.formData()
    const files = formData.getAll('images') as File[]

    if (files.length === 0) {
      console.warn('[images/POST] No files in request for', product.sku)
      return NextResponse.json({ error: 'No images provided' }, { status: 400 })
    }

    console.log('[images/POST]', product.sku, '— received', files.length, 'file(s):', files.map(f => `${f.name} (${(f.size / 1024).toFixed(0)}KB)`).join(', '))

    const uploaded: { fileName: string; shopifyImageId?: number; storagePath?: string }[] = []
    const errors: string[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      try {
        console.log(`[images/POST] ${product.sku} — uploading ${file.name} (${i + 1}/${files.length})`)
        const buffer = await file.arrayBuffer()

        if (shopifyEnabled && product.shopify_product_id) {
          // Upload to Shopify CDN
          const base64 = Buffer.from(buffer).toString('base64')
          const { shopifyImageId } = await uploadProductImage(
            product.shopify_product_id,
            base64,
            file.name
          )

          await db.from('product_images').insert({
            product_id: id,
            file_name: file.name,
            shopify_image_id: shopifyImageId,
            position: i + 1,
          })

          uploaded.push({ fileName: file.name, shopifyImageId })
          console.log(`[images/POST] ${product.sku} — ${file.name} uploaded to Shopify, imageId=${shopifyImageId}`)
        } else {
          // Upload to Supabase Storage
          const ext = file.name.split('.').pop() || 'jpg'
          const storagePath = `${product.sku}/${Date.now()}-${i}.${ext}`

          const { error: uploadErr } = await db.storage
            .from('product-images')
            .upload(storagePath, Buffer.from(buffer), {
              contentType: file.type || 'image/jpeg',
              upsert: false,
            })

          if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`)

          // Get public URL
          const { data: urlData } = db.storage
            .from('product-images')
            .getPublicUrl(storagePath)

          await db.from('product_images').insert({
            product_id: id,
            file_name: file.name,
            storage_path: storagePath,
            image_url: urlData.publicUrl,
            position: i + 1,
          })

          uploaded.push({ fileName: file.name, storagePath })
          console.log(`[images/POST] ${product.sku} — ${file.name} uploaded to Supabase Storage: ${storagePath}`)
        }
      } catch (imgErr) {
        const msg = `${file.name}: ${String(imgErr)}`
        errors.push(msg)
        console.error(`[images/POST] ${product.sku} — ${file.name} FAILED:`, String(imgErr))
      }
    }

    console.log('[images/POST] done', { sku: product.sku, uploaded: uploaded.length, errors: errors.length, ms: Date.now() - t0 })

    return NextResponse.json({
      uploaded: uploaded.length,
      errors,
    })
  } catch (e) {
    console.error('[images/POST] failed:', String(e), { ms: Date.now() - t0 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
