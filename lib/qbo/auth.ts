import OAuthClient from 'intuit-oauth'

function createOAuthClient(): OAuthClient {
  return new OAuthClient({
    clientId: process.env.QBO_CLIENT_ID!.trim(),
    clientSecret: process.env.QBO_CLIENT_SECRET!.trim(),
    environment: (process.env.QBO_ENVIRONMENT as 'sandbox' | 'production') ?? 'sandbox',
    redirectUri: process.env.QBO_REDIRECT_URI!.trim(),
  })
}

export function getAuthorizationUrl(): string {
  const client = createOAuthClient()
  return client.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state: 'qbo-auth',
  })
}

export async function exchangeCodeForTokens(url: string): Promise<{
  accessToken: string
  refreshToken: string
  realmId: string
  expiresAt: Date
}> {
  const client = createOAuthClient()
  const authResponse = await client.createToken(url)
  const token = authResponse.getJson()

  // realmId comes from the callback URL query param, not the token body
  const realmId = token.realmId ?? new URL(url).searchParams.get('realmId') ?? ''

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    realmId,
    expiresAt: new Date(Date.now() + token.expires_in * 1000),
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string
  refreshToken: string
  expiresAt: Date
}> {
  // We bypass intuit-oauth's client.refresh() because it has been silently
  // failing in production with "Refresh token is invalid" even when the token
  // is valid. Confirmed 2026-04-22 by diagnostic: a raw POST to the same
  // endpoint with the same credentials and same refresh token returns 200
  // while client.refresh() returns "invalid". Library bug.
  // Raw fetch matches what client.refresh() *should* do per Intuit's docs.
  const clientId = process.env.QBO_CLIENT_ID!.trim()
  const clientSecret = process.env.QBO_CLIENT_SECRET!.trim()
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch(
    'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    }
  )

  const text = await res.text()
  if (!res.ok) {
    throw new Error(
      `Intuit refresh failed (HTTP ${res.status}): ${text.slice(0, 300)}`
    )
  }

  let token: { access_token: string; refresh_token: string; expires_in: number }
  try {
    token = JSON.parse(text)
  } catch {
    throw new Error(`Intuit returned non-JSON: ${text.slice(0, 300)}`)
  }

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: new Date(Date.now() + token.expires_in * 1000),
  }
}
