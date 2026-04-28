import { NextRequest, NextResponse } from 'next/server'
import { runMerchantFeed } from '@/lib/merchant-feed/run'

// Daily Google Merchant Center feed. Vercel cron hits this — auth via CRON_SECRET.
// Manual triggers from the admin panel hit /api/merchant-feed/run instead.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await runMerchantFeed('cron')
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }
  return NextResponse.json(result)
}
