import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { tracking_number } = await req.json()

    if (!tracking_number || typeof tracking_number !== 'string') {
      return NextResponse.json({ error: 'tracking_number is required' }, { status: 400 })
    }

    const db = createServiceClient()

    // Must be in processing state to ship
    const { data: order, error: fetchError } = await db
      .from('orders')
      .select('status')
      .eq('id', id)
      .single()

    if (fetchError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.status !== 'processing') {
      return NextResponse.json(
        { error: `Cannot ship order in ${order.status} status — must be processing` },
        { status: 400 }
      )
    }

    const { error: updateError } = await db
      .from('orders')
      .update({
        status: 'shipped',
        tracking_number,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updateError) throw updateError

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[orders/ship] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
