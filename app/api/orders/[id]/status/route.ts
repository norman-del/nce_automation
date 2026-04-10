import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'

const VALID_TRANSITIONS: Record<string, string[]> = {
  paid:       ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped:    ['delivered'],
  delivered:  [],
  cancelled:  [],
  refunded:   [],
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { status: newStatus } = await req.json()

    if (!newStatus || typeof newStatus !== 'string') {
      return NextResponse.json({ error: 'status is required' }, { status: 400 })
    }

    const db = createServiceClient()

    // Get current order
    const { data: order, error: fetchError } = await db
      .from('orders')
      .select('status')
      .eq('id', id)
      .single()

    if (fetchError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Validate transition
    const allowed = VALID_TRANSITIONS[order.status] ?? []
    if (!allowed.includes(newStatus)) {
      return NextResponse.json(
        { error: `Cannot transition from ${order.status} to ${newStatus}` },
        { status: 400 }
      )
    }

    const { error: updateError } = await db
      .from('orders')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (updateError) throw updateError

    return NextResponse.json({ ok: true, status: newStatus })
  } catch (e) {
    console.error('[orders/status] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
