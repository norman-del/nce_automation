import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'

/**
 * Shopify OAuth callback — exchanges the auth code for a permanent access token.
 *
 * Flow:
 * 1. Store owner installs app via Shopify Dev Dashboard
 * 2. Shopify redirects here with ?code=...&shop=...&hmac=...&timestamp=...
 * 3. We verify the HMAC, exchange the code for an access token
 * 4. Display the token for the user to copy into .env.local
 */
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams
    const code = params.get('code')
    const shop = params.get('shop')
    const hmac = params.get('hmac')

    if (!code || !shop || !hmac) {
      return new NextResponse('Missing required parameters (code, shop, hmac)', { status: 400 })
    }

    const clientId = process.env.SHOPIFY_CLIENT_ID
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return new NextResponse('SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET must be set in .env.local', { status: 500 })
    }

    // Verify HMAC
    const entries = Array.from(params.entries())
      .filter(([key]) => key !== 'hmac')
      .sort(([a], [b]) => a.localeCompare(b))
    const message = entries.map(([k, v]) => `${k}=${v}`).join('&')
    const expectedHmac = createHmac('sha256', clientSecret).update(message).digest('hex')

    if (hmac !== expectedHmac) {
      return new NextResponse('HMAC verification failed — invalid request', { status: 403 })
    }

    // Exchange code for permanent access token
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    })

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text()
      return new NextResponse(`Token exchange failed: ${tokenRes.status} ${errBody}`, { status: 500 })
    }

    const tokenData = await tokenRes.json() as { access_token: string; scope: string }
    const { access_token, scope } = tokenData

    console.log('[shopify-auth] Token obtained successfully')
    console.log('[shopify-auth] Scopes:', scope)
    // Log the token to server console as backup
    console.log('[shopify-auth] Access token:', access_token)

    // Return a simple page showing the token
    const html = `<!DOCTYPE html>
<html><head><title>Shopify Connected</title>
<style>
  body { font-family: system-ui; background: #0d1117; color: #e6edf3; padding: 40px; max-width: 700px; margin: 0 auto; }
  .token { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; word-break: break-all; font-family: monospace; font-size: 14px; margin: 16px 0; }
  .success { color: #3fb950; }
  .label { color: #8b949e; font-size: 13px; }
  code { background: #1c2128; padding: 2px 6px; border-radius: 4px; }
</style></head>
<body>
  <h1 class="success">Shopify Connected Successfully</h1>
  <p>Shop: <strong>${shop}</strong></p>
  <p>Scopes: <strong>${scope}</strong></p>
  <div>
    <p class="label">Access Token (copy this into your <code>.env.local</code> as <code>SHOPIFY_ACCESS_TOKEN</code>):</p>
    <div class="token">${access_token}</div>
  </div>
  <p class="label">This token is permanent and does not expire. You can close this page once you've copied it.</p>
</body></html>`

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html' },
    })
  } catch (e) {
    console.error('Shopify auth callback error:', e)
    return new NextResponse(`Error: ${String(e)}`, { status: 500 })
  }
}
