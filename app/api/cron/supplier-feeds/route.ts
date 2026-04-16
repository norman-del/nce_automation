import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { runSupplierFeed } from '@/lib/suppliers/run'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[supplier-feeds-cron] starting')

  const db = createServiceClient()
  const { data: suppliers, error } = await db
    .from('suppliers')
    .select('id, name')
    .eq('stock_feed_enabled', true)

  if (error) {
    console.error('[supplier-feeds-cron] supplier list error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const list = suppliers ?? []
  const results = []
  for (const s of list) {
    try {
      results.push(await runSupplierFeed(s.id))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[supplier-feeds-cron] ${s.name} threw:`, msg)
      results.push({
        supplierId: s.id,
        supplierName: s.name,
        status: 'error' as const,
        rowCount: 0,
        matchedCount: 0,
        updatedCount: 0,
        error: msg,
      })
    }
  }

  console.log('[supplier-feeds-cron] done — processed', results.length)
  return NextResponse.json({ processed: results.length, results })
}
