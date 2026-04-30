// Dump a single QBO item's raw fields. Useful for inspecting what's actually
// stored vs what we send. Read-only.
//
// Usage: node scripts/dump-qbo-item.mjs <qbo_item_id> [<qbo_item_id> ...]

import { createClient } from '@supabase/supabase-js'
import QuickBooks from 'node-quickbooks'
import { readFileSync } from 'node:fs'
import { createDecipheriv } from 'node:crypto'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

function decrypt(payload) {
  const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY.trim(), 'hex')
  const [ivHex, tagHex, ctHex] = payload.split(':')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]).toString('utf8')
}

const ids = process.argv.slice(2)
if (!ids.length) { console.error('Usage: node scripts/dump-qbo-item.mjs <id> [<id> ...]'); process.exit(1) }

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data: conn } = await supabase.from('qbo_connections').select('*').limit(1).single()
if (!conn) { console.error('No qbo_connections row'); process.exit(1) }

const expiresAt = new Date(conn.token_expires_at).getTime()
if (expiresAt < Date.now()) {
  console.error('Access token expired. Hit any QBO endpoint via the app to refresh it, then re-run.')
  process.exit(1)
}

const accessToken = decrypt(conn.access_token_encrypted)

const client = new QuickBooks(
  process.env.QBO_CLIENT_ID,
  process.env.QBO_CLIENT_SECRET,
  accessToken,
  false, // no token secret
  conn.realm_id,
  conn.environment === 'sandbox',
  false, // debug
  null,
  '2.0',
  conn.refresh_token ? decrypt(conn.refresh_token) : null
)

for (const id of ids) {
  const item = await new Promise((resolve, reject) => {
    client.getItem(id, (err, result) => {
      if (err) reject(err)
      else resolve(result)
    })
  })
  console.log(JSON.stringify(item, null, 2))
  console.log('---')
}
