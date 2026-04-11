import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — do not remove this call
  const { data: { user } } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isPublic =
    path === '/login' ||
    path.startsWith('/api/auth') ||
    path.startsWith('/api/qbo/auth') ||
    path.startsWith('/api/shopify/auth') ||
    path.startsWith('/api/cron') ||
    path.startsWith('/api/setup')

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && path === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/products'
    return NextResponse.redirect(url)
  }

  // Staff role protection — staff can only access /products and /finance
  // Check role for any page route that isn't already staff-allowed
  if (user && !isPublic && !path.startsWith('/api/')) {
    const staffAllowedRoutes = ['/products', '/finance', '/settings']
    const isStaffAllowed = staffAllowedRoutes.some(r => path.startsWith(r))

    if (!isStaffAllowed) {
      const { createClient } = await import('@supabase/supabase-js')
      const serviceClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )
      const { data: staffUser } = await serviceClient
        .from('staff_users')
        .select('role')
        .eq('auth_user_id', user.id)
        .single()

      if (staffUser && staffUser.role !== 'admin') {
        const url = request.nextUrl.clone()
        url.pathname = '/products'
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
