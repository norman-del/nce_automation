import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens, getAuthorizationUrl } from '@/lib/qbo/auth'
import { createServiceClient } from '@/lib/supabase/client'
import { encrypt } from '@/lib/crypto'

// GET /api/qbo/auth — redirect to Intuit authorization page
export async function GET() {
  const url = getAuthorizationUrl()
  return NextResponse.redirect(url)
}

// GET with code param — OAuth callback from Intuit
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    if (!code) {
      return NextResponse.json({ error: 'Missing code parameter' }, { status: 400 })
    }

    const tokens = await exchangeCodeForTokens(req.url)
    const db = createServiceClient()

    // Upsert — only one QBO connection supported
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

    return NextResponse.redirect(new URL('/settings?qbo=connected', req.url))
  } catch (e) {
    console.error('QBO auth error:', e)
    return NextResponse.redirect(
      new URL(`/settings?qbo=error&message=${encodeURIComponent(String(e))}`, req.url)
    )
  }
}
