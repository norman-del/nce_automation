import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  console.log('[auth/login] POST received')
  const cookieStore = await cookies()
  const { email, password } = (await request.json()) as { email: string; password: string }
  console.log('[auth/login] attempting sign-in for:', email)

  const response = NextResponse.json({ ok: true })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    console.error('[auth/login] sign-in failed:', error.message)
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  console.log('[auth/login] sign-in success, user id:', data.user?.id)
  return response
}
