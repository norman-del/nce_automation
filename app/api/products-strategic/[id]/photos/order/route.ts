// Reorder strategic product photos. Body: { order: string[] } — array of
// product_images.id in desired order (1-indexed positions assigned by index).

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const order: unknown = body?.order
    if (!Array.isArray(order) || order.some((v) => typeof v !== 'string')) {
      return NextResponse.json({ error: 'order must be a string[]' }, { status: 400 })
    }

    const db = createServiceClient()

    const { data: product } = await db
      .from('products')
      .select('id, shopify_product_id')
      .eq('id', id)
      .single()
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }
    if (product.shopify_product_id) {
      return NextResponse.json({ error: 'Bridge product — use /api/products/[id]/images/order instead' }, { status: 400 })
    }

    // Two-phase update to avoid colliding with any unique (product_id, position)
    // index that may exist now or in future. Phase 1: shift to negative slots.
    // Phase 2: set final positions.
    for (let i = 0; i < order.length; i++) {
      await db
        .from('product_images')
        .update({ position: -(i + 1) })
        .eq('id', order[i])
        .eq('product_id', id)
    }
    for (let i = 0; i < order.length; i++) {
      await db
        .from('product_images')
        .update({ position: i + 1 })
        .eq('id', order[i])
        .eq('product_id', id)
    }

    console.log('[products-strategic/photos/order] reordered', { id, count: order.length })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[products-strategic/photos/order] failed:', String(e))
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
