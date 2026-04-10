import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export type StaffRole = 'admin' | 'staff'

export interface StaffUser {
  id: string
  auth_user_id: string
  email: string
  name: string
  role: StaffRole
}

/**
 * Get the currently authenticated staff user from the session cookie.
 * Returns null if not authenticated or not in the staff_users table.
 */
export async function getStaffUser(): Promise<StaffUser | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // read-only — we don't need to set cookies here
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Look up the staff record using the service client to bypass RLS
  const { createServiceClient } = await import('@/lib/supabase/client')
  const db = createServiceClient()
  const { data } = await db
    .from('staff_users')
    .select('id, auth_user_id, email, name, role')
    .eq('auth_user_id', user.id)
    .single()

  if (!data) return null
  return data as StaffUser
}

/**
 * Check if the given role has admin privileges.
 */
export function isAdmin(role: StaffRole): boolean {
  return role === 'admin'
}

/**
 * Get the staff user from an API request's cookies.
 * Uses the request's cookie header instead of next/headers cookies().
 */
export async function getStaffUserFromRequest(request: Request): Promise<StaffUser | null> {
  const { createServerClient } = await import('@supabase/ssr')
  const cookieHeader = request.headers.get('cookie') ?? ''
  const cookiePairs = cookieHeader.split(';').map(c => {
    const [name, ...rest] = c.trim().split('=')
    return { name: name ?? '', value: rest.join('=') }
  }).filter(c => c.name)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookiePairs },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { createServiceClient } = await import('@/lib/supabase/client')
  const db = createServiceClient()
  const { data } = await db
    .from('staff_users')
    .select('id, auth_user_id, email, name, role')
    .eq('auth_user_id', user.id)
    .single()

  if (!data) return null
  return data as StaffUser
}
