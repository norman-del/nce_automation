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

    // Trigger shipping notification email via nce-site
    const siteUrl = process.env.NCE_SITE_URL
    const internalKey = process.env.INTERNAL_API_KEY
    if (siteUrl && internalKey) {
      try {
        const emailRes = await fetch(`${siteUrl}/api/email/shipping`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': internalKey,
          },
          body: JSON.stringify({ order_id: id }),
        })
        if (!emailRes.ok) {
          const body = await emailRes.json().catch(() => ({}))
          console.warn('[orders/ship] Shipping email failed:', body.error ?? emailRes.status)
        } else {
          console.log('[orders/ship] Shipping email sent for order', id)
        }
      } catch (emailErr) {
        console.warn('[orders/ship] Shipping email request failed:', String(emailErr))
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[orders/ship] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
