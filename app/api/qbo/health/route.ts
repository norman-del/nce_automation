import { NextResponse } from 'next/server'
import { getQboConnection } from '@/lib/qbo/client'

// GET /api/qbo/health — token health check (no QBO API call, just reads DB)
export async function GET() {
  try {
    const connection = await getQboConnection()
    if (!connection) {
      return NextResponse.json({ status: 'disconnected', message: 'QBO not connected' })
    }

    const now = Date.now()
    const expiresAt = new Date(connection.token_expires_at)
    const refreshExpiresAt = connection.refresh_token_expires_at
      ? new Date(connection.refresh_token_expires_at)
      : null
    const timeLeftSec = Math.round((expiresAt.getTime() - now) / 1000)
    const refreshTimeLeftDays = refreshExpiresAt
      ? Math.round((refreshExpiresAt.getTime() - now) / (1000 * 60 * 60 * 24))
      : null

    const healthy = timeLeftSec > 0
    const refreshHealthy = refreshTimeLeftDays === null || refreshTimeLeftDays > 7

    return NextResponse.json({
      status: healthy ? 'healthy' : 'expired',
      access_token: {
        expires_at: expiresAt.toISOString(),
        time_left_seconds: timeLeftSec,
        time_left_human: timeLeftSec > 0
          ? `${Math.floor(timeLeftSec / 60)}m ${timeLeftSec % 60}s`
          : 'EXPIRED',
      },
      refresh_token: {
        expires_at: refreshExpiresAt?.toISOString() ?? 'unknown',
        days_remaining: refreshTimeLeftDays,
        healthy: refreshHealthy,
      },
      last_refreshed_by: connection.last_refreshed_by ?? 'unknown',
      last_updated: connection.updated_at ?? 'unknown',
      company: connection.company_name,
      realm_id: connection.realm_id,
    })
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: String(err) },
      { status: 500 }
    )
  }
}
