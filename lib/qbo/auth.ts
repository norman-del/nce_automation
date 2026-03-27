import OAuthClient from 'intuit-oauth'

function createOAuthClient(): OAuthClient {
  return new OAuthClient({
    clientId: process.env.QBO_CLIENT_ID!,
    clientSecret: process.env.QBO_CLIENT_SECRET!,
    environment: (process.env.QBO_ENVIRONMENT as 'sandbox' | 'production') ?? 'sandbox',
    redirectUri: process.env.QBO_REDIRECT_URI!,
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
  const client = createOAuthClient()
  client.setToken({ refresh_token: refreshToken })
  const authResponse = await client.refresh()
  const token = authResponse.getJson()

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: new Date(Date.now() + token.expires_in * 1000),
  }
}
