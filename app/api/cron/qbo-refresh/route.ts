import { NextRequest, NextResponse } from 'next/server'
import { getQboClient } from '@/lib/qbo/client'
import { createServiceClient } from '@/lib/supabase/client'

export const runtime = 'nodejs'
export const maxDuration = 30

type QboAny = {
  getCompanyInfo: (
    realmId: string,
    cb: (err: unknown, info: unknown) => void
  ) => void
}

/**
 * Keep-alive cron — fires once daily at 13:00 UTC (see vercel.json).
 * Hobby plan caps us at 2 crons; the other slot is the payout sync.
 *
 * Calls getQboClient() (which auto-refreshes the access token if it's
 * within 15 min of expiry) and then makes one trivial read so we know
 * the token is actually valid against Intuit. Logs every run to
 * sync_log so we can see refresh health at a glance.
 *
 * Why this exists: token life is ~1 hr, refresh tokens are single-use,
 * and our other crons go long stretches without calling QBO. Without
 * this, refresh chains break silently and the next caller (a product
 * create or the daily payout sync) discovers a dead connection at the
 * worst possible time.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const startedAt = Date.now()

  try {
    const { client, connection } = await getQboClient()
    const qbo = client as unknown as QboAny

    await new Promise<void>((resolve, reject) => {
      qbo.getCompanyInfo(connection.realm_id, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })

    const tokenExpiresAt = new Date(connection.token_expires_at)
    const refreshTokenExpiresAt = connection.refresh_token_expires_at
      ? new Date(connection.refresh_token_expires_at)
      : null

    await db.from('sync_log').insert({
      action: 'qbo_keepalive',
      status: 'success',
      details: {
        durationMs: Date.now() - startedAt,
        tokenExpiresAt: tokenExpiresAt.toISOString(),
        tokenSecondsLeft: Math.round(
          (tokenExpiresAt.getTime() - Date.now()) / 1000
        ),
        refreshTokenExpiresAt: refreshTokenExpiresAt?.toISOString() ?? null,
        lastRefreshedBy: connection.last_refreshed_by ?? null,
      },
    })

    return NextResponse.json({
      ok: true,
      tokenExpiresAt: tokenExpiresAt.toISOString(),
      refreshTokenExpiresAt: refreshTokenExpiresAt?.toISOString() ?? null,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await db.from('sync_log').insert({
      action: 'qbo_keepalive',
      status: 'error',
      details: { error: message, durationMs: Date.now() - startedAt },
    })
    console.error('[qbo-refresh-cron] FAILED:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
