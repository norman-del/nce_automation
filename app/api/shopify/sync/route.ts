import { NextRequest, NextResponse } from 'next/server'
import { fetchPayouts } from '@/lib/shopify/payouts'
import { createServiceClient } from '@/lib/supabase/client'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { date_min, date_max } = body as { date_min?: string; date_max?: string }

    const payouts = await fetchPayouts({ date_min, date_max, status: 'paid' })
    const db = createServiceClient()

    let inserted = 0
    let skipped = 0

    for (const payout of payouts) {
      const gross =
        parseFloat(payout.summary.charges_gross_amount) +
        parseFloat(payout.summary.adjustments_gross_amount)
      const fees =
        parseFloat(payout.summary.charges_fee_amount) +
        parseFloat(payout.summary.adjustments_fee_amount)

      const { error } = await db.from('payouts').upsert(
        {
          shopify_payout_id: payout.id,
          status: payout.status,
          amount: parseFloat(payout.amount),
          gross_amount: gross,
          total_fees: fees,
          currency: payout.currency,
          payout_date: payout.date,
        },
        { onConflict: 'shopify_payout_id', ignoreDuplicates: true }
      )

      if (error) {
        console.error('Upsert error:', error)
        skipped++
      } else {
        inserted++
      }
    }

    return NextResponse.json({ synced: inserted, skipped, total: payouts.length })
  } catch (e) {
    console.error('Shopify sync error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
