import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { calculateShippingTier } from '@/lib/products/shipping'

// DELETE /api/products/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const db = createServiceClient()

    // product_images cascade-deletes via FK
    const { error } = await db
      .from('products')
      .delete()
      .eq('id', id)

    if (error) throw error

    console.log('[products/DELETE] deleted product:', id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[products/DELETE] failed:', String(e))
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// GET /api/products/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const db = createServiceClient()

    const { data, error } = await db
      .from('products')
      .select('*, suppliers(*), product_images(*)')
      .eq('id', id)
      .single()

    if (error) throw error
    if (!data) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (e) {
    console.error('Product GET error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PATCH /api/products/[id] — update product fields
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const db = createServiceClient()

    // If dimensions changed, recalculate shipping tier
    const updates = { ...body, updated_at: new Date().toISOString() }

    if (body.width_cm != null || body.height_cm != null || body.depth_cm != null) {
      // Fetch current dimensions to fill in any missing values
      const { data: current, error: fetchError } = await db
        .from('products')
        .select('width_cm, height_cm, depth_cm, weight_kg')
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError

      const w = body.width_cm ?? current.width_cm
      const h = body.height_cm ?? current.height_cm
      const d = body.depth_cm ?? current.depth_cm
      const wt = body.weight_kg ?? current.weight_kg

      updates.shipping_tier = calculateShippingTier(w, h, d, wt)
    }

    const { data, error } = await db
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (e) {
    console.error('Product PATCH error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
