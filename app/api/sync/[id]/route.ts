import { NextRequest, NextResponse } from 'next/server'
import { syncPayout } from '@/lib/sync/orchestrator'
import { createServiceClient } from '@/lib/supabase/client'

// POST /api/sync/[id] — run full sync for a single payout (by DB id)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const db = createServiceClient()
    const { data: payout } = await db
      .from('payouts')
      .select('shopify_payout_id')
      .eq('id', id)
      .single()

    if (!payout) {
      return NextResponse.json({ error: 'Payout not found' }, { status: 404 })
    }

    const result = await syncPayout(payout.shopify_payout_id)
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
