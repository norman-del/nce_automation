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
  updated_at?: string
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
/* Token refresh with cross-instance safety                            */
/*                                                                     */
/* Problem: Intuit invalidates the old refresh token the moment a new  */
/* one is issued. If two Vercel function instances both read the same  */
/* expired token and both try to refresh, the second one kills the     */
/* chain permanently.                                                  */
/*                                                                     */
/* Solution: Two layers of protection:                                 */
/* 1. In-memory mutex (same instance, concurrent requests)             */
/* 2. Optimistic locking via updated_at (cross-instance)               */
/*    - Before refreshing, record the connection's updated_at          */
/*    - After refreshing, only save if updated_at hasn't changed       */
/*    - If another instance already refreshed, re-read the fresh token */
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

  // In-memory mutex: if this instance is already refreshing, wait for that result
  if (refreshPromise) {
    console.log('[qbo-client] Refresh already in progress (same instance), waiting...')
    return refreshPromise
  }

  refreshPromise = doRefresh(connection)

  try {
    return await refreshPromise
  } finally {
    refreshPromise = null
  }
}

async function doRefresh(connection: QboConnection): Promise<{
  accessToken: string
  connection: QboConnection
}> {
  const db = createServiceClient()
  const savedUpdatedAt = connection.updated_at

  console.log('[qbo-client] Token expired or expiring soon, refreshing...')
  const refreshToken = decrypt(connection.refresh_token_encrypted)

  let refreshed: Awaited<ReturnType<typeof refreshAccessToken>>
  try {
    refreshed = await refreshAccessToken(refreshToken)
  } catch (err) {
    // Refresh failed — maybe another instance already rotated the token.
    // Re-read from DB and check if the token is now valid.
    console.warn('[qbo-client] Refresh failed, checking if another instance already refreshed...')
    const freshConn = await getQboConnection()
    if (freshConn && freshConn.updated_at !== savedUpdatedAt) {
      // Another instance updated the token — check if it's now valid
      const freshExpiry = new Date(freshConn.token_expires_at)
      if (freshExpiry.getTime() - Date.now() > 60_000) {
        console.log('[qbo-client] Another instance already refreshed, using their token')
        return { accessToken: decrypt(freshConn.access_token_encrypted), connection: freshConn }
      }
    }
    // Genuinely dead — surface the error
    console.error('[qbo-client] Token refresh FAILED:', String(err))
    throw new Error(`QBO token refresh failed — please re-connect QuickBooks via Settings. (${String(err)})`)
  }

  console.log('[qbo-client] Token refreshed successfully, new expiry:', refreshed.expiresAt.toISOString())

  const now = new Date().toISOString()
  const newConn: QboConnection = {
    ...connection,
    access_token_encrypted: encrypt(refreshed.accessToken),
    refresh_token_encrypted: encrypt(refreshed.refreshToken),
    token_expires_at: refreshed.expiresAt.toISOString(),
    refresh_token_expires_at: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: now,
  }

  // Optimistic lock: only save if no other instance beat us to it
  const { data: updated } = await db
    .from('qbo_connections')
    .update({
      access_token_encrypted: newConn.access_token_encrypted,
      refresh_token_encrypted: newConn.refresh_token_encrypted,
      token_expires_at: newConn.token_expires_at,
      refresh_token_expires_at: newConn.refresh_token_expires_at,
      updated_at: now,
    })
    .eq('id', connection.id)
    .eq('updated_at', savedUpdatedAt ?? '')
    .select('id')

  if (!updated || updated.length === 0) {
    // Another instance beat us — re-read and use their token
    console.log('[qbo-client] Another instance refreshed first (optimistic lock), re-reading...')
    const freshConn = await getQboConnection()
    if (freshConn) {
      return { accessToken: decrypt(freshConn.access_token_encrypted), connection: freshConn }
    }
  }

  return { accessToken: refreshed.accessToken, connection: newConn }
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
