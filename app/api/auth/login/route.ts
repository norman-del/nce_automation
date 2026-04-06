import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const cookieStore = await cookies()

  // Support both JSON body and form-encoded body
  const contentType = request.headers.get('content-type') ?? ''
  let email: string
  let password: string

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const formData = await request.formData()
    email = formData.get('email') as string
    password = formData.get('password') as string
  } else {
    const body = await request.json()
    email = body.email
    password = body.password
  }

  // Build the redirect URL base from the request
  const url = new URL(request.url)
  const origin = url.origin

  const response = NextResponse.redirect(`${origin}/`, { status: 303 })

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

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent('Invalid email or password.')}`,
      { status: 303 }
    )
  }

  return response
}
