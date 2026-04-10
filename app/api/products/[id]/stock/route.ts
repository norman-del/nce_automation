import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'

// POST /api/products/[id]/stock — adjust stock quantity
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { quantity_change, reason, notes } = await req.json()

    if (typeof quantity_change !== 'number' || quantity_change === 0) {
      return NextResponse.json({ error: 'quantity_change must be a non-zero number' }, { status: 400 })
    }

    if (!reason || typeof reason !== 'string') {
      return NextResponse.json({ error: 'reason is required' }, { status: 400 })
    }

    const db = createServiceClient()

    const { data: product, error: fetchError } = await db
      .from('products')
      .select('stock_quantity')
      .eq('id', id)
      .single()

    if (fetchError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const previousQuantity = product.stock_quantity
    const newQuantity = previousQuantity + quantity_change

    if (newQuantity < 0) {
      return NextResponse.json(
        { error: `Cannot reduce stock below 0 (current: ${previousQuantity}, change: ${quantity_change})` },
        { status: 400 }
      )
    }

    // Update stock
    const { error: updateError } = await db
      .from('products')
      .update({ stock_quantity: newQuantity, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (updateError) throw updateError

    // Log adjustment
    const { error: logError } = await db
      .from('stock_adjustments')
      .insert({
        product_id: id,
        quantity_change,
        reason,
        notes: notes || null,
        previous_quantity: previousQuantity,
        new_quantity: newQuantity,
      })

    if (logError) console.error('[stock] Failed to log adjustment:', logError)

    return NextResponse.json({
      ok: true,
      previous_quantity: previousQuantity,
      new_quantity: newQuantity,
    })
  } catch (e) {
    console.error('[stock] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// GET /api/products/[id]/stock — get stock history
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const db = createServiceClient()

    const { data, error } = await db
      .from('stock_adjustments')
      .select('*')
      .eq('product_id', id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error

    return NextResponse.json(data ?? [])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
