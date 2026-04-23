// Dev-only: assign a known password to a user via service role.
// Use this to enable Playwright login. Save the chosen password in .env.local
// under DEV_LOGIN_PASSWORD for reuse.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const email = process.argv[2]
const password = process.argv[3]
if (!email || !password) {
  console.error('Usage: node scripts/dev-set-password.mjs <email> <password>')
  process.exit(1)
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const { data: list, error: listErr } = await sb.auth.admin.listUsers()
if (listErr) { console.error(listErr); process.exit(1) }
const user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
if (!user) { console.error('User not found:', email); process.exit(1) }

const { error } = await sb.auth.admin.updateUserById(user.id, { password })
if (error) { console.error(error); process.exit(1) }
console.log('Password updated for', email)
