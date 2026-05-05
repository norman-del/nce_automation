// Delete a single strategic product photo: Supabase Storage + DB row.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'

const BUCKET = 'product-images'

// Reverse-engineer the storage path from a public URL like
// https://<project>.supabase.co/storage/v1/object/public/product-images/<path>
function pathFromPublicUrl(src: string): string | null {
  const marker = `/object/public/${BUCKET}/`
  const idx = src.indexOf(marker)
  if (idx === -1) return null
  return src.slice(idx + marker.length)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  try {
    const { id, imageId } = await params
    const db = createServiceClient()

    // Confirm product is strategic (no Shopify ID)
    const { data: product } = await db
      .from('products')
      .select('id, shopify_product_id')
      .eq('id', id)
      .single()
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }
    if (product.shopify_product_id) {
      return NextResponse.json({ error: 'Bridge product — use /api/products/[id]/images/[imageId] instead' }, { status: 400 })
    }

    // Fetch the image row to derive the storage path
    const { data: image, error: imgErr } = await db
      .from('product_images')
      .select('id, src')
      .eq('id', imageId)
      .eq('product_id', id)
      .single()
    if (imgErr || !image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    const storagePath = image.src ? pathFromPublicUrl(image.src) : null
    if (storagePath) {
      const { error: rmErr } = await db.storage.from(BUCKET).remove([storagePath])
      if (rmErr) {
        console.warn('[products-strategic/photos/DELETE] storage remove failed:', rmErr.message)
      }
    }

    const { error: delErr } = await db
      .from('product_images')
      .delete()
      .eq('id', imageId)
      .eq('product_id', id)
    if (delErr) throw delErr

    console.log('[products-strategic/photos/DELETE] removed', { id, imageId })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[products-strategic/photos/DELETE] failed:', String(e))
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
