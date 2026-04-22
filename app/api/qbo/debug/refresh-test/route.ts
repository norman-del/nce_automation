import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { decrypt } from '@/lib/crypto'

export const runtime = 'nodejs'

/**
 * Diagnostic: read the stored refresh token, call Intuit's refresh endpoint
 * directly (bypassing intuit-oauth), and return the full response for
 * inspection. Admin-only via CRON_SECRET.
 *
 * DO NOT SAVE the new tokens — this is read-only diagnostic. It WILL rotate
 * the refresh token at Intuit's side (single-use), so after running, the
 * user must reconnect. Only hit this once when investigating a broken chain.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const { data: conn } = await db
    .from('qbo_connections')
    .select('realm_id, refresh_token_encrypted, token_expires_at, updated_at')
    .limit(1)
    .single()

  if (!conn) {
    return NextResponse.json({ error: 'No connection' }, { status: 404 })
  }

  let refreshToken: string
  try {
    refreshToken = decrypt(conn.refresh_token_encrypted)
  } catch (e) {
    return NextResponse.json({
      step: 'decrypt',
      error: e instanceof Error ? e.message : String(e),
    })
  }

  const clientId = process.env.QBO_CLIENT_ID!.trim()
  const clientSecret = process.env.QBO_CLIENT_SECRET!.trim()
  const env = process.env.QBO_ENVIRONMENT?.trim() ?? 'sandbox'

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })

  const intuitRes = await fetch(
    'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: body.toString(),
    }
  )

  const responseText = await intuitRes.text()
  let responseJson: unknown = null
  try { responseJson = JSON.parse(responseText) } catch { /* keep as text */ }

  return NextResponse.json({
    diagnostic: 'raw refresh call, NOT saved — you WILL need to reconnect after this',
    env,
    clientIdPrefix: clientId.slice(0, 12) + '...',
    realmId: conn.realm_id,
    refreshTokenPrefix: refreshToken.slice(0, 20) + '...',
    refreshTokenLength: refreshToken.length,
    storedTokenExpiresAt: conn.token_expires_at,
    storedUpdatedAt: conn.updated_at,
    intuitHttpStatus: intuitRes.status,
    intuitResponseJson: responseJson,
    intuitResponseText: responseJson ? undefined : responseText.slice(0, 500),
  })
}
