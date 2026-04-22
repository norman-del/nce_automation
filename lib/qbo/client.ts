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
  last_refreshed_by?: string | null
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
/* Token refresh with atomic compare-and-swap lock                     */
/*                                                                     */
/* Problem: Intuit invalidates the old refresh token the moment a new  */
/* one is issued (single-use). If two instances refresh simultaneously */
/* the second kills the chain permanently.                             */
/*                                                                     */
/* Solution: Atomic CAS via Supabase RPC.                              */
/* 1. claim_qbo_refresh_lock() — UPDATE ... WHERE lock_holder IS NULL  */
/*    Only ONE caller wins the row (Postgres atomicity). Loser gets    */
/*    zero rows back.                                                  */
/* 2. Winner calls Intuit, then save_refreshed_qbo_token() to save    */
/*    new tokens + release the lock.                                   */
/* 3. Loser polls until fresh tokens appear (or lock times out).       */
/* 4. Stale locks (>30s) are auto-broken so a crashed instance can't   */
/*    deadlock the system.                                             */
/* ------------------------------------------------------------------ */

/** Identifier for log tracing */
const INSTANCE_ID = process.env.VERCEL
  ? `vercel-${(process.env.VERCEL_DEPLOYMENT_ID ?? '').slice(0, 8)}`
  : 'local'

const REFRESH_THRESHOLD_MS = 15 * 60 * 1000 // refresh if <15 min left
const POLL_INTERVAL_MS = 500
const MAX_POLL_ATTEMPTS = 40 // 20 seconds max wait
const SAVE_RETRY_ATTEMPTS = 3
const SAVE_RETRY_BACKOFF_MS = 250

async function getValidToken(connection: QboConnection): Promise<{
  accessToken: string
  connection: QboConnection
}> {
  const expiresAt = new Date(connection.token_expires_at)
  const timeLeft = expiresAt.getTime() - Date.now()
  console.log(`[qbo:${INSTANCE_ID}] Token expires at:`, expiresAt.toISOString(),
    '— time left:', Math.round(timeLeft / 1000), 's')

  if (timeLeft >= REFRESH_THRESHOLD_MS) {
    return { accessToken: decrypt(connection.access_token_encrypted), connection }
  }

  // Token needs refresh
  console.log(`[qbo:${INSTANCE_ID}] Token expired/expiring, attempting refresh...`)
  return refreshWithCAS(connection)
}

async function refreshWithCAS(connection: QboConnection): Promise<{
  accessToken: string
  connection: QboConnection
}> {
  const db = createServiceClient()

  // Try to claim the refresh lock (atomic — only one caller wins)
  const { data: rows } = await db.rpc('claim_qbo_refresh_lock', {
    conn_id: connection.id,
    caller_id: INSTANCE_ID,
  })

  const claimed = (rows as QboConnection[] | null)?.[0] ?? null

  if (claimed) {
    // We won the lock — we are the sole refresher
    console.log(`[qbo:${INSTANCE_ID}] Lock claimed, refreshing with Intuit...`)
    return doRefreshAndSave(claimed)
  }

  // We lost the lock — another instance is refreshing. Poll until done.
  console.log(`[qbo:${INSTANCE_ID}] Another instance is refreshing, waiting...`)
  return pollForFreshToken(connection.id)
}

async function doRefreshAndSave(connection: QboConnection): Promise<{
  accessToken: string
  connection: QboConnection
}> {
  const db = createServiceClient()
  const refreshToken = decrypt(connection.refresh_token_encrypted)

  let refreshed: Awaited<ReturnType<typeof refreshAccessToken>>
  try {
    refreshed = await refreshAccessToken(refreshToken)
  } catch (err) {
    // Release the lock so others can try (or detect the failure)
    console.error(`[qbo:${INSTANCE_ID}] Refresh FAILED:`, String(err))
    await db.rpc('release_qbo_refresh_lock', { conn_id: connection.id })
    throw new Error(`QBO token refresh failed — re-connect via Settings. (${String(err)})`)
  }

  console.log(`[qbo:${INSTANCE_ID}] Refreshed OK, new expiry:`, refreshed.expiresAt.toISOString())

  // Save new tokens + release lock atomically.
  // CRITICAL: if Intuit issued new tokens but our DB save fails, the chain dies
  // (the old refresh token is single-use and now consumed). Retry the save aggressively
  // — transient DB errors must not lose tokens we already received.
  const newAccessEnc = encrypt(refreshed.accessToken)
  const newRefreshEnc = encrypt(refreshed.refreshToken)
  const refreshTokenExpiresAtISO = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000).toISOString()

  let saveErr: { message: string } | null = null
  for (let attempt = 1; attempt <= SAVE_RETRY_ATTEMPTS; attempt++) {
    const result = await db.rpc('save_refreshed_qbo_token', {
      conn_id: connection.id,
      new_access_token_encrypted: newAccessEnc,
      new_refresh_token_encrypted: newRefreshEnc,
      new_token_expires_at: refreshed.expiresAt.toISOString(),
      new_refresh_token_expires_at: refreshTokenExpiresAtISO,
      refreshed_by: INSTANCE_ID,
    })
    saveErr = result.error
    if (!saveErr) break
    console.warn(
      `[qbo:${INSTANCE_ID}] save_refreshed_qbo_token attempt ${attempt}/${SAVE_RETRY_ATTEMPTS} failed:`,
      saveErr.message
    )
    if (attempt < SAVE_RETRY_ATTEMPTS) {
      await new Promise(r => setTimeout(r, SAVE_RETRY_BACKOFF_MS * attempt))
    }
  }

  if (saveErr) {
    // All retries exhausted. Refresh token chain is now broken — Intuit invalidated
    // the old one when it issued these new ones, but we couldn't persist them.
    console.error(
      `[qbo:${INSTANCE_ID}] CRITICAL: Refreshed but ${SAVE_RETRY_ATTEMPTS} save attempts failed. Chain broken.`,
      saveErr.message
    )
    throw new Error(`Token refreshed but save failed — re-connect via Settings. (${saveErr.message})`)
  }

  const updatedConn: QboConnection = {
    ...connection,
    access_token_encrypted: newAccessEnc,
    refresh_token_encrypted: newRefreshEnc,
    token_expires_at: refreshed.expiresAt.toISOString(),
    refresh_token_expires_at: refreshTokenExpiresAtISO,
    updated_at: new Date().toISOString(),
    last_refreshed_by: INSTANCE_ID,
  }

  return { accessToken: refreshed.accessToken, connection: updatedConn }
}

async function pollForFreshToken(connId: string): Promise<{
  accessToken: string
  connection: QboConnection
}> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))

    const fresh = await getQboConnection()
    if (!fresh || fresh.id !== connId) {
      throw new Error('QBO connection disappeared while waiting for token refresh')
    }

    const timeLeft = new Date(fresh.token_expires_at).getTime() - Date.now()
    if (timeLeft >= REFRESH_THRESHOLD_MS) {
      console.log(`[qbo:${INSTANCE_ID}] Fresh token available after ${(i + 1) * POLL_INTERVAL_MS}ms wait`)
      return { accessToken: decrypt(fresh.access_token_encrypted), connection: fresh }
    }
  }

  // Timed out — the other instance probably crashed. Try claiming the lock ourselves.
  console.warn(`[qbo:${INSTANCE_ID}] Timed out waiting for refresh, attempting takeover...`)
  const conn = await getQboConnection()
  if (!conn) throw new Error('QBO not connected')
  return refreshWithCAS(conn)
}

export async function getQboClient(): Promise<{
  client: QuickBooks
  connection: QboConnection
  accessToken: string
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

  return { client: qbo, connection: conn, accessToken }
}
