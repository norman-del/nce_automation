// One-shot cleanup of orphan external records left behind by the deleted
// Claude test product (commit 622f82d, 2026-04-28).
//
// The product row in Supabase was already removed but the Shopify draft
// product and the QBO inventory item it had created are still hanging around.
// This script:
//
//   1. Deletes the Shopify product (DELETE /products/{id}.json).
//      A 404 is treated as success (already gone — idempotent).
//   2. Deactivates the QBO item (Active=false) — QBO does not allow hard
//      delete of items that may have journal entries against them.
//   3. Logs the outcome to sync_log so we have an audit trail.
//
// Usage:
//   node --env-file=.env.local scripts/cleanup-claude-test-orphans.mjs
//
// Env vars required (already in .env.local):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   TOKEN_ENCRYPTION_KEY
//   SHOPIFY_STORE_DOMAIN
//   SHOPIFY_ACCESS_TOKEN
//   QBO_ENVIRONMENT (optional — defaults to production)
//
// Filed as .mjs to match the rest of scripts/ — the one-shot folder
// referenced in the kickoff doesn't exist in this repo.

import { createClient } from '@supabase/supabase-js'
import QuickBooks from 'node-quickbooks'
import { createDecipheriv } from 'crypto'

const SHOPIFY_PRODUCT_ID = 10636859900237
const QBO_ITEM_ID = '6537'

function decrypt(payload) {
  const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY.trim(), 'hex')
  const [ivHex, tagHex, ctHex] = payload.split(':')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]).toString('utf8')
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const result = {
  shopify: { id: SHOPIFY_PRODUCT_ID, status: 'pending', detail: null },
  qbo: { id: QBO_ITEM_ID, status: 'pending', detail: null },
}

/* ----------------------------- Shopify ----------------------------- */

const shopDomain = process.env.SHOPIFY_STORE_DOMAIN
const shopToken = process.env.SHOPIFY_ACCESS_TOKEN
if (!shopDomain || !shopToken) {
  result.shopify.status = 'auth_error'
  result.shopify.detail = 'Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_ACCESS_TOKEN'
  console.warn('[cleanup] Shopify creds missing — skipping')
} else {
  const url = `https://${shopDomain}/admin/api/2024-10/products/${SHOPIFY_PRODUCT_ID}.json`
  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { 'X-Shopify-Access-Token': shopToken, 'Content-Type': 'application/json' },
    })
    if (res.ok) {
      result.shopify.status = 'deleted'
      console.log('[cleanup] Shopify product deleted:', SHOPIFY_PRODUCT_ID)
    } else if (res.status === 404) {
      result.shopify.status = 'already_gone'
      console.log('[cleanup] Shopify product 404 — treating as already gone')
    } else if (res.status === 401 || res.status === 403) {
      result.shopify.status = 'auth_error'
      result.shopify.detail = `HTTP ${res.status}`
      console.error('[cleanup] Shopify auth error — token may be invalid')
    } else {
      const text = await res.text().catch(() => '')
      result.shopify.status = 'error'
      result.shopify.detail = `HTTP ${res.status}: ${text.slice(0, 200)}`
      console.error('[cleanup] Shopify delete failed:', result.shopify.detail)
    }
  } catch (e) {
    result.shopify.status = 'error'
    result.shopify.detail = String(e)
    console.error('[cleanup] Shopify request threw:', e)
  }
}

/* ------------------------------- QBO ------------------------------- */

const { data: conn, error: connErr } = await supabase
  .from('qbo_connections')
  .select('*')
  .limit(1)
  .single()

if (connErr || !conn) {
  result.qbo.status = 'auth_error'
  result.qbo.detail = `No QBO connection row: ${connErr?.message || 'not found'}`
  console.warn('[cleanup] No QBO connection — skipping')
} else {
  // Refresh access token (mirrors lib/qbo/auth.ts logic but inlined for the script)
  const tokenExpiresAt = new Date(conn.token_expires_at).getTime()
  let accessToken = decrypt(conn.access_token_encrypted)

  if (tokenExpiresAt - Date.now() < 5 * 60 * 1000) {
    // Refresh
    try {
      const refreshToken = decrypt(conn.refresh_token_encrypted)
      const clientId = process.env.QBO_CLIENT_ID
      const clientSecret = process.env.QBO_CLIENT_SECRET
      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
      const resp = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
      })
      const tokens = await resp.json()
      if (!resp.ok) throw new Error(`QBO refresh ${resp.status}: ${JSON.stringify(tokens)}`)
      accessToken = tokens.access_token
      console.log('[cleanup] QBO access token refreshed')
    } catch (e) {
      result.qbo.status = 'auth_error'
      result.qbo.detail = `Token refresh failed: ${String(e)}`
      console.error('[cleanup] QBO refresh failed:', e)
    }
  }

  if (result.qbo.status === 'pending') {
    const isSandbox = (process.env.QBO_ENVIRONMENT || 'production').trim() !== 'production'
    const client = new QuickBooks(
      process.env.QBO_CLIENT_ID,
      process.env.QBO_CLIENT_SECRET,
      accessToken,
      false, // no token secret in OAuth2
      conn.realm_id,
      isSandbox,
      false, // debug
      null,
      '2.0',
      decrypt(conn.refresh_token_encrypted)
    )

    try {
      // Fetch current item to grab SyncToken — required for any QBO update
      const current = await new Promise((resolve, reject) => {
        client.getItem(QBO_ITEM_ID, (err, item) => {
          if (err) reject(err)
          else resolve(item)
        })
      })

      if (current.Active === false) {
        result.qbo.status = 'already_inactive'
        console.log('[cleanup] QBO item already inactive — nothing to do')
      } else {
        await new Promise((resolve, reject) => {
          client.updateItem(
            { Id: QBO_ITEM_ID, SyncToken: current.SyncToken, sparse: true, Active: false },
            (err) => {
              if (err) reject(err)
              else resolve()
            }
          )
        })
        result.qbo.status = 'deactivated'
        console.log('[cleanup] QBO item', QBO_ITEM_ID, 'deactivated (Active=false)')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // node-quickbooks surfaces axios errors with a response.data payload
      const detail = e?.response?.data ? JSON.stringify(e.response.data) : msg
      // 404 / "Object Not Found" → already deleted somehow → success
      if (detail.includes('Object Not Found') || detail.includes('"code":"610"')) {
        result.qbo.status = 'already_gone'
        result.qbo.detail = detail.slice(0, 300)
        console.log('[cleanup] QBO item not found — treating as already gone')
      } else {
        result.qbo.status = 'error'
        result.qbo.detail = detail.slice(0, 500)
        console.error('[cleanup] QBO operation failed:', detail)
      }
    }
  }
}

/* ----------------------------- sync_log ----------------------------- */

try {
  const { error: logErr } = await supabase.from('sync_log').insert({
    action: 'cleanup_orphan_test_data',
    status:
      result.shopify.status.match(/^(deleted|already_gone)$/) &&
      result.qbo.status.match(/^(deactivated|already_inactive|already_gone)$/)
        ? 'success'
        : 'partial',
    details: {
      reason: 'Cleanup of orphan Shopify product + QBO item left by deleted Claude test product (commit 622f82d, 2026-04-28)',
      shopify: result.shopify,
      qbo: result.qbo,
      ran_at: new Date().toISOString(),
    },
  })
  if (logErr) console.warn('[cleanup] sync_log insert failed:', logErr.message)
  else console.log('[cleanup] sync_log entry written')
} catch (e) {
  console.warn('[cleanup] sync_log insert threw:', e)
}

console.log('\n=== Cleanup result ===')
console.log(JSON.stringify(result, null, 2))

// Non-zero exit if anything truly failed (auth or other error). "Already gone"
// counts as success.
const ok =
  result.shopify.status.match(/^(deleted|already_gone)$/) &&
  result.qbo.status.match(/^(deactivated|already_inactive|already_gone)$/)
process.exit(ok ? 0 : 1)
