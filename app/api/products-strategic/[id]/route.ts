// Strategic product PATCH — Supabase + QBO only.
// Refuses if the product has shopify_product_id (use bridge route instead).

import { NextRequest, NextResponse } from 'next/server'
import { updateStrategicProduct } from '@/lib/strategic/products/update'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t0 = Date.now()
  try {
    const { id } = await params
    const body = await req.json()
    const { product, syncErrors } = await updateStrategicProduct(id, body)
    console.log('[products-strategic/PATCH] done', { id, syncErrors: syncErrors.length, ms: Date.now() - t0 })
    if (syncErrors.length > 0) {
      return NextResponse.json({ ...product, sync_error: syncErrors.join('; '), _syncErrors: syncErrors }, { status: 207 })
    }
    return NextResponse.json(product)
  } catch (e) {
    console.error('[products-strategic/PATCH] failed:', String(e))
    const msg = e instanceof Error ? e.message : String(e)
    const status = msg === 'Product not found' ? 404
      : msg.includes('already in use') ? 409
      : msg.includes('bridge-managed') ? 400
      : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
