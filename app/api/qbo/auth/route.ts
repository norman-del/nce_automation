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
        refresh_token_expires_at: new Date(
          Date.now() + 100 * 24 * 60 * 60 * 1000
        ).toISOString(),
        updated_at: new Date().toISOString(),
        // Fixed account mappings — Shopify Charges (133) and Shopify Receipt Account (1150040008)
        shopify_fees_account_id: '133',
        bank_account_id: '1150040008',
      },
      { onConflict: 'realm_id' }
    )

    if (error) throw error

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nce-automation.vercel.app'
    return NextResponse.redirect(`${siteUrl}/settings?qbo=connected`)
  } catch (e) {
    console.error('QBO auth error:', e)
    const msg = e instanceof Error ? e.message : JSON.stringify(e)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nce-automation.vercel.app'
    return NextResponse.redirect(
      `${siteUrl}/settings?qbo=error&message=${encodeURIComponent(msg)}`
    )
  }
}
