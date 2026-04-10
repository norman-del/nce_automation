import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { getStripe } from '@/lib/stripe/client'
import { getStaffUserFromRequest } from '@/lib/auth/staff'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Admin-only: refunds require admin role
    const staff = await getStaffUserFromRequest(req)
    if (!staff || staff.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { id } = await params
    const db = createServiceClient()

    // Fetch order
    const { data: order, error: fetchError } = await db
      .from('orders')
      .select('id, order_number, status, stripe_payment_intent_id, total_pence')
      .eq('id', id)
      .single()

    if (fetchError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.status === 'refunded') {
      return NextResponse.json({ error: 'Order already refunded' }, { status: 400 })
    }

    if (order.status === 'cancelled') {
      return NextResponse.json({ error: 'Cannot refund a cancelled order' }, { status: 400 })
    }

    if (!order.stripe_payment_intent_id) {
      return NextResponse.json({ error: 'No Stripe payment intent linked to this order' }, { status: 400 })
    }

    // Issue Stripe refund
    const stripe = getStripe()
    const refund = await stripe.refunds.create({
      payment_intent: order.stripe_payment_intent_id,
    })

    // Update order status
    const { error: updateError } = await db
      .from('orders')
      .update({ status: 'refunded', updated_at: new Date().toISOString() })
      .eq('id', id)

    if (updateError) throw updateError

    // Log to sync_log
    await db.from('sync_log').insert({
      action: 'stripe_refund',
      status: 'success',
      details: {
        order_id: order.id,
        order_number: order.order_number,
        stripe_refund_id: refund.id,
        amount_pence: order.total_pence,
        payment_intent_id: order.stripe_payment_intent_id,
      },
    })

    console.log('[orders/refund] success:', {
      orderId: id,
      refundId: refund.id,
      amount: order.total_pence,
    })

    return NextResponse.json({ ok: true, refund_id: refund.id })
  } catch (e) {
    const errorMsg = String(e)
    console.error('[orders/refund] error:', errorMsg)

    // Log failure
    try {
      const db = createServiceClient()
      const { id } = await params
      await db.from('sync_log').insert({
        action: 'stripe_refund',
        status: 'error',
        details: { order_id: id, error: errorMsg },
      })
    } catch {
      // ignore logging failure
    }

    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}
