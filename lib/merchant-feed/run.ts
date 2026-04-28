import { createServiceClient } from '@/lib/supabase/client'
import { publishMerchantFeed } from './build'

export type FeedRunSource = 'cron' | 'manual'

export type FeedRunResult =
  | { ok: true; row_count: number; skipped: number; public_url: string; duration_ms: number }
  | { ok: false; error: string; duration_ms: number }

export async function runMerchantFeed(source: FeedRunSource): Promise<FeedRunResult> {
  const db = createServiceClient()
  const start = Date.now()
  try {
    const { rowCount, skipped, publicUrl } = await publishMerchantFeed()
    const duration_ms = Date.now() - start
    await db.from('sync_log').insert({
      action: 'merchant_feed_publish',
      status: 'success',
      details: { source, row_count: rowCount, skipped, public_url: publicUrl, duration_ms },
    })
    return { ok: true, row_count: rowCount, skipped, public_url: publicUrl, duration_ms }
  } catch (e) {
    const duration_ms = Date.now() - start
    await db.from('sync_log').insert({
      action: 'merchant_feed_publish',
      status: 'error',
      details: { source, error: String(e), duration_ms },
    })
    return { ok: false, error: String(e), duration_ms }
  }
}
