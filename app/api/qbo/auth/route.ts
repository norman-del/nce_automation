import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens, getAuthorizationUrl } from '@/lib/qbo/auth'
import { createServiceClient } from '@/lib/supabase/client'
import { encrypt } from '@/lib/crypto'

// GET /api/qbo/auth — redirect to Intuit, or handle OAuth callback
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')

  // No code = initiate OAuth flow
  if (!code) {
    const url = getAuthorizationUrl()
    return NextResponse.redirect(url)
  }

  // Has code = callback from Intuit
  // Reconstruct the full callback URL using the configured redirect URI as base
  // (req.url may resolve to localhost internally, but Intuit needs the registered ngrok URL)
  const callbackUrl = `${process.env.QBO_REDIRECT_URI}?${searchParams.toString()}`

  try {
    const tokens = await exchangeCodeForTokens(callbackUrl)
    const db = createServiceClient()

    const { error } = await db.from('qbo_connections').upsert(
      {
        realm_id: tokens.realmId,
        access_token_encrypted: encrypt(tokens.accessToken),
        refresh_token_encrypted: encrypt(tokens.refreshToken),
        token_expires_at: tokens.expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'realm_id' }
    )

    if (error) throw error

    return NextResponse.redirect('http://localhost:3000/settings?qbo=connected')
  } catch (e) {
    console.error('QBO auth error:', e)
    const msg = e instanceof Error ? e.message : JSON.stringify(e)
    return NextResponse.redirect(
      `http://localhost:3000/settings?qbo=error&message=${encodeURIComponent(msg)}`
    )
  }
}
