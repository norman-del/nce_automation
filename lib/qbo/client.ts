import QuickBooks from 'node-quickbooks'
import { createServiceClient } from '../supabase/client'
import { decrypt, encrypt } from '../crypto'
import { refreshAccessToken } from './auth'

export interface QboConnection {
  id: string
  realm_id: string
  access_token_encrypted: string
  refresh_token_encrypted: string
  token_expires_at: string
  refresh_token_expires_at: string | null
  company_name: string | null
  shopify_fees_account_id: string | null
  bank_account_id: string | null
}

export async function getQboConnection(): Promise<QboConnection | null> {
  const db = createServiceClient()
  const { data, error } = await db
    .from('qbo_connections')
    .select('*')
    .limit(1)
    .single()

  if (error || !data) return null
  return data as QboConnection
}

/* ------------------------------------------------------------------ */
/* Refresh mutex — prevents concurrent refreshes from killing the     */
/* token chain. Intuit invalidates the old refresh token the moment   */
/* a new one is issued, so two concurrent refreshes = dead chain.     */
/* ------------------------------------------------------------------ */

let refreshPromise: Promise<{
  accessToken: string
  connection: QboConnection
}> | null = null

async function getValidToken(connection: QboConnection): Promise<{
  accessToken: string
  connection: QboConnection
}> {
  const expiresAt = new Date(connection.token_expires_at)
  const fiveMinutes = 5 * 60 * 1000
  const timeLeft = expiresAt.getTime() - Date.now()
  console.log('[qbo-client] Token expires at:', expiresAt.toISOString(), '— time left:', Math.round(timeLeft / 1000), 'seconds')

  if (timeLeft >= fiveMinutes) {
    return { accessToken: decrypt(connection.access_token_encrypted), connection }
  }

  // If another caller is already refreshing, wait for that result
  if (refreshPromise) {
    console.log('[qbo-client] Refresh already in progress, waiting...')
    return refreshPromise
  }

  // We're the first caller — take the lock and refresh
  refreshPromise = (async () => {
    console.log('[qbo-client] Token expired or expiring soon, refreshing...')
    const refreshToken = decrypt(connection.refresh_token_encrypted)
    let refreshed: Awaited<ReturnType<typeof refreshAccessToken>>
    try {
      refreshed = await refreshAccessToken(refreshToken)
    } catch (err) {
      console.error('[qbo-client] Token refresh FAILED:', String(err))
      console.error('[qbo-client] Refresh token may be expired or revoked. Re-auth needed via /settings')
      throw new Error(`QBO token refresh failed — please re-connect QuickBooks via Settings. (${String(err)})`)
    }
    console.log('[qbo-client] Token refreshed successfully, new expiry:', refreshed.expiresAt.toISOString())

    const db = createServiceClient()
    const newConn: QboConnection = {
      ...connection,
      access_token_encrypted: encrypt(refreshed.accessToken),
      refresh_token_encrypted: encrypt(refreshed.refreshToken),
      token_expires_at: refreshed.expiresAt.toISOString(),
      refresh_token_expires_at: new Date(
        Date.now() + 100 * 24 * 60 * 60 * 1000
      ).toISOString(),
    }

    await db
      .from('qbo_connections')
      .update({
        access_token_encrypted: newConn.access_token_encrypted,
        refresh_token_encrypted: newConn.refresh_token_encrypted,
        token_expires_at: newConn.token_expires_at,
        refresh_token_expires_at: newConn.refresh_token_expires_at,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id)

    return { accessToken: refreshed.accessToken, connection: newConn }
  })()

  try {
    return await refreshPromise
  } finally {
    // Release the lock so next expiry cycle can refresh again
    refreshPromise = null
  }
}

export async function getQboClient(): Promise<{
  client: QuickBooks
  connection: QboConnection
}> {
  const connection = await getQboConnection()
  if (!connection) throw new Error('QBO not connected. Please connect via Settings.')

  const { accessToken, connection: conn } = await getValidToken(connection)

  const isSandbox = process.env.QBO_ENVIRONMENT?.trim() !== 'production'
  const qbo = new QuickBooks(
    process.env.QBO_CLIENT_ID!.trim(),
    process.env.QBO_CLIENT_SECRET!.trim(),
    accessToken,
    false, // no OAuth token secret (OAuth 2)
    conn.realm_id,
    isSandbox,
    false, // debug
    null, // minor version
    '2.0', // OAuth version
    null // refresh token (we handle refresh ourselves)
  )

  return { client: qbo, connection: conn }
}
