import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { uploadProductImage, updateProductStatus } from '@/lib/shopify/products'

// POST /api/products/[id]/images — upload photos and auto-activate
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const db = createServiceClient()

    // Verify product exists and has a Shopify ID
    const { data: product, error: fetchErr } = await db
      .from('products')
      .select('id, sku, shopify_product_id, status')
      .eq('id', id)
      .single()

    if (fetchErr || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    if (!product.shopify_product_id) {
      return NextResponse.json(
        { error: 'Product has not been pushed to Shopify yet. Retry the Shopify sync first.' },
        { status: 400 }
      )
    }

    const formData = await req.formData()
    const files = formData.getAll('images') as File[]

    if (files.length === 0) {
      return NextResponse.json({ error: 'No images provided' }, { status: 400 })
    }

    const uploaded: { fileName: string; shopifyImageId: number }[] = []
    const errors: string[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      try {
        // Convert file to base64
        const buffer = await file.arrayBuffer()
        const base64 = Buffer.from(buffer).toString('base64')

        const { shopifyImageId } = await uploadProductImage(
          product.shopify_product_id,
          base64,
          file.name,
          i + 1
        )

        // Save image record to Supabase
        await db.from('product_images').insert({
          product_id: id,
          file_name: file.name,
          shopify_image_id: shopifyImageId,
          position: i + 1,
        })

        uploaded.push({ fileName: file.name, shopifyImageId })
      } catch (imgErr) {
        errors.push(`${file.name}: ${String(imgErr)}`)
      }
    }

    // If at least one image uploaded, activate the product
    if (uploaded.length > 0) {
      try {
        await updateProductStatus(product.shopify_product_id, 'active')
        await db
          .from('products')
          .update({
            status: 'active',
            shopify_status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
      } catch (activateErr) {
        errors.push(`Activation failed: ${String(activateErr)}`)
      }
    }

    return NextResponse.json({
      uploaded: uploaded.length,
      errors,
      activated: uploaded.length > 0 && errors.every((e) => !e.includes('Activation')),
    })
  } catch (e) {
    console.error('Image upload error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
