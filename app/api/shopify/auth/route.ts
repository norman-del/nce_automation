import { NextRequest, NextResponse } from 'next/server'

/**
 * Shopify OAuth initiation — redirects to Shopify's authorize URL.
 * Called when Shopify redirects to our app after install.
 */
export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get('shop')
  const clientId = process.env.SHOPIFY_CLIENT_ID
  const redirectUri = `${req.nextUrl.origin}/api/shopify/auth/callback`
  const scopes = 'read_orders,read_products,write_products,read_shopify_payments_payouts'

  if (!shop || !clientId) {
    return new NextResponse(`Missing shop or SHOPIFY_CLIENT_ID. shop=${shop}, clientId=${!!clientId}`, { status: 400 })
  }

  const authorizeUrl = `https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}`

  console.log('[shopify-auth] Redirecting to:', authorizeUrl)

  return NextResponse.redirect(authorizeUrl)
}
