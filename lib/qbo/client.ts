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

export async function getQboClient(): Promise<{
  client: QuickBooks
  connection: QboConnection
}> {
  const connection = await getQboConnection()
  if (!connection) throw new Error('QBO not connected. Please connect via Settings.')

  let accessToken = decrypt(connection.access_token_encrypted)
  let conn = connection

  // Refresh if token expires within 5 minutes
  const expiresAt = new Date(connection.token_expires_at)
  const fiveMinutes = 5 * 60 * 1000
  const timeLeft = expiresAt.getTime() - Date.now()
  console.log('[qbo-client] Token expires at:', expiresAt.toISOString(), '— time left:', Math.round(timeLeft / 1000), 'seconds')

  if (timeLeft < fiveMinutes) {
    console.log('[qbo-client] Token expired or expiring soon, refreshing...')
    const refreshToken = decrypt(connection.refresh_token_encrypted)
    const refreshed = await refreshAccessToken(refreshToken)
    console.log('[qbo-client] Token refreshed successfully, new expiry:', refreshed.expiresAt.toISOString())

    const db = createServiceClient()
    await db
      .from('qbo_connections')
      .update({
        access_token_encrypted: encrypt(refreshed.accessToken),
        refresh_token_encrypted: encrypt(refreshed.refreshToken),
        token_expires_at: refreshed.expiresAt.toISOString(),
        refresh_token_expires_at: new Date(
          Date.now() + 100 * 24 * 60 * 60 * 1000
        ).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id)

    accessToken = refreshed.accessToken
    conn = {
      ...connection,
      access_token_encrypted: encrypt(refreshed.accessToken),
      refresh_token_encrypted: encrypt(refreshed.refreshToken),
      token_expires_at: refreshed.expiresAt.toISOString(),
      refresh_token_expires_at: new Date(
        Date.now() + 100 * 24 * 60 * 60 * 1000
      ).toISOString(),
    }
  }

  const isSandbox = process.env.QBO_ENVIRONMENT !== 'production'
  const qbo = new QuickBooks(
    process.env.QBO_CLIENT_ID!,
    process.env.QBO_CLIENT_SECRET!,
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
