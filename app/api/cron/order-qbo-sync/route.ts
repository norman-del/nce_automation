import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { syncOrderToQbo } from '@/lib/sync/order-to-qbo'

export const runtime = 'nodejs'
export const maxDuration = 300

const BATCH_SIZE = 25
const ELIGIBLE_STATUSES = ['paid', 'processing', 'shipped', 'delivered']

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[order-qbo-sync-cron] starting')
  const db = createServiceClient()

  // Orders eligible for sync: paid or later; not already synced successfully.
  // We use a left-join-ish pattern: find orders without a success row in order_qbo_sync.
  const { data: syncedOk } = await db
    .from('order_qbo_sync')
    .select('order_id')
    .eq('status', 'success')

  const excludeIds = (syncedOk ?? []).map((r: { order_id: string }) => r.order_id)

  const query = db
    .from('orders')
    .select('id, order_number')
    .in('status', ELIGIBLE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(BATCH_SIZE)

  // Supabase needs a non-empty list for .not('id','in',...) — supply a sentinel
  if (excludeIds.length > 0) {
    query.not('id', 'in', `(${excludeIds.join(',')})`)
  }

  const { data: orders, error } = await query
  if (error) {
    console.error('[order-qbo-sync-cron] order list error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const list = orders ?? []
  const results = []
  for (const o of list) {
    try {
      results.push(await syncOrderToQbo(o.id))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[order-qbo-sync-cron] order ${o.id} threw:`, msg)
      results.push({ orderId: o.id, status: 'error' as const, error: msg })
    }
  }

  console.log('[order-qbo-sync-cron] done — processed', results.length)
  return NextResponse.json({ processed: results.length, results })
}
