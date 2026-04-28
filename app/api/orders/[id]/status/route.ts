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

    // Fire-and-forget: notify nce-site to send the cancellation email when the
    // order has just transitioned into 'cancelled'. Best-effort — a Resend
    // hiccup must not stall or fail the status update.
    if (newStatus === 'cancelled') {
      const siteUrl = process.env.NCE_SITE_URL
      const internalKey = process.env.INTERNAL_API_KEY
      if (siteUrl && internalKey) {
        fetch(`${siteUrl}/api/email/cancelled`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': internalKey,
          },
          body: JSON.stringify({ orderId: id }),
        })
          .then(async (res) => {
            if (!res.ok) {
              const body = await res.json().catch(() => ({}))
              console.warn('[orders/status] cancellation email trigger failed:', body.error ?? res.status)
              try {
                await db.from('sync_log').insert({
                  action: 'nce_site_cancelled_email',
                  status: 'error',
                  details: { order_id: id, http_status: res.status, error: body.error ?? null },
                })
              } catch {
                // ignore secondary logging failure
              }
            }
          })
          .catch(async (err) => {
            console.warn('[orders/status] cancellation email trigger request failed:', String(err))
            try {
              await db.from('sync_log').insert({
                action: 'nce_site_cancelled_email',
                status: 'error',
                details: { order_id: id, error: String(err) },
              })
            } catch {
              // ignore secondary logging failure
            }
          })
      }
    }

    return NextResponse.json({ ok: true, status: newStatus })
  } catch (e) {
    console.error('[orders/status] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
