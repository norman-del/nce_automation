import { NextRequest, NextResponse } from 'next/server'
import { fetchPayouts } from '@/lib/shopify/payouts'
import { syncPayout } from '@/lib/sync/orchestrator'
import { createServiceClient } from '@/lib/supabase/client'

export async function GET(req: NextRequest) {
  // Verify Vercel Cron secret
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const db = createServiceClient()

    // Fetch last 7 days of paid payouts
    const dateMin = new Date()
    dateMin.setDate(dateMin.getDate() - 7)
    const payouts = await fetchPayouts({
      date_min: dateMin.toISOString().split('T')[0],
      status: 'paid',
    })

    const results = []
    for (const payout of payouts) {
      // Upsert payout record
      await db.from('payouts').upsert(
        {
          shopify_payout_id: payout.id,
          status: payout.status,
          amount: parseFloat(payout.amount),
          currency: payout.currency,
          payout_date: payout.date,
        },
        { onConflict: 'shopify_payout_id', ignoreDuplicates: false }
      )

      // Sync (idempotent)
      const result = await syncPayout(payout.id)
      results.push({ payoutId: payout.id, ...result })
    }

    return NextResponse.json({ processed: results.length, results })
  } catch (e) {
    console.error('Cron sync error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
