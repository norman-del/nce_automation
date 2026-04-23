import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens, getAuthorizationUrl } from '@/lib/qbo/auth'
import { createServiceClient } from '@/lib/supabase/client'
import { encrypt } from '@/lib/crypto'

// Track processed auth codes to prevent double-exchange
// (browser prefetch or double redirect can hit callback twice)
const processedCodes = new Set<string>()

// GET /api/qbo/auth — redirect to Intuit, or handle OAuth callback
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')

  // No code = initiate OAuth flow
  if (!code) {
    const url = getAuthorizationUrl()
    return NextResponse.redirect(url)
  }

  // Prevent double-exchange of the same auth code
  if (processedCodes.has(code)) {
    console.warn('[qbo-auth] DUPLICATE callback detected for code:', code.substring(0, 10) + '... — skipping')
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nce-automation.vercel.app'
    return NextResponse.redirect(`${siteUrl}/settings?qbo=connected`)
  }
  processedCodes.add(code)
  // Clean up old codes after 60s
  setTimeout(() => processedCodes.delete(code), 60_000)

  // Has code = callback from Intuit
  // Reconstruct the full callback URL using the configured redirect URI as base
  const callbackUrl = `${process.env.QBO_REDIRECT_URI}?${searchParams.toString()}`
  const authCode = code.substring(0, 10) + '...'
  console.log('[qbo-auth] OAuth callback received, code:', authCode, 'state:', searchParams.get('state'))

  try {
    // Immediately test: log the refresh token we get and verify it works
    const tokens = await exchangeCodeForTokens(callbackUrl)
    console.log('[qbo-auth] Token exchange success. Access token length:', tokens.accessToken.length,
      'Refresh token:', tokens.refreshToken.substring(0, 20) + '...',
      'Realm:', tokens.realmId)

    const db = createServiceClient()

    // Seed VAT tax code mapping only if currently NULL — never overwrite values
    // that have been manually tuned via Settings. See docs/plans/now-vs-strategic.md §5 Bug 1.
    const existing = await db
      .from('qbo_connections')
      .select('vat_standard_tax_code_id, vat_margin_sale_tax_code_id, vat_margin_purchase_tax_code_id')
      .eq('realm_id', tokens.realmId)
      .maybeSingle()

    const vatSeed: Record<string, string> = {}
    if (!existing.data?.vat_standard_tax_code_id) vatSeed.vat_standard_tax_code_id = '5'
    if (!existing.data?.vat_margin_sale_tax_code_id) vatSeed.vat_margin_sale_tax_code_id = '18'
    if (!existing.data?.vat_margin_purchase_tax_code_id) vatSeed.vat_margin_purchase_tax_code_id = '9'

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
        shopify_fees_account_id: '133',
        bank_account_id: '1150040008',
        ...vatSeed,
      },
      { onConflict: 'realm_id' }
    )

    if (error) throw error
    console.log('[qbo-auth] Tokens saved for realm:', tokens.realmId)

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
