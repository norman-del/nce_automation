'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { StaffRole } from '@/lib/auth/staff'

type NavLink = {
  href: string
  label: string
  adminOnly: boolean
  isActive?: (pathname: string) => boolean
}

// Bridge features: kept until Shopify cutover, then retired.
// Listed first because they're the most-used today.
const bridgeLinks: NavLink[] = [
  {
    href: '/products/new',
    label: '+ New product',
    adminOnly: false,
    isActive: (p) => p === '/products/new' || p.startsWith('/products/new/') || /^\/products\/[^/]+\/edit/.test(p),
  },
  { href: '/finance', label: 'Finance', adminOnly: true },
]

// Strategic features: post-Shopify stack.
const strategicLinks: NavLink[] = [
  { href: '/',          label: 'Dashboard', adminOnly: true,  isActive: (p) => p === '/' },
  { href: '/orders',    label: 'Orders',    adminOnly: true },
  {
    href: '/products',
    label: 'Products',
    adminOnly: false,
    // Active for /products list and /products/[id] detail, but NOT /products/new or /products/[id]/edit
    isActive: (p) =>
      (p === '/products' || (p.startsWith('/products/') && !p.startsWith('/products/new') && !/\/edit(?:$|\/)/.test(p))),
  },
  { href: '/customers', label: 'Customers', adminOnly: true  },
  { href: '/settings',  label: 'Settings',  adminOnly: true  },
]

interface Props {
  staffName?: string
  staffRole?: StaffRole
}

export default function SidebarNav({ staffName, staffRole }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const isAdmin = staffRole === 'admin'

  const visibleBridge = bridgeLinks.filter(l => !l.adminOnly || isAdmin)
  const visibleStrategic = strategicLinks.filter(l => !l.adminOnly || isAdmin)

  async function handleSignOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  function renderLink(link: NavLink) {
    const active = link.isActive
      ? link.isActive(pathname)
      : (pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href)))
    return (
      <Link
        key={link.href}
        href={link.href}
        className={`flex items-center px-3 py-2 rounded-md text-sm transition-colors ${
          active
            ? 'bg-overlay text-accent font-medium border border-accent/20'
            : 'text-secondary hover:bg-overlay hover:text-primary'
        }`}
      >
        {link.label}
      </Link>
    )
  }

  return (
    <nav className="flex flex-col flex-1 px-3 py-4">
      <div className="space-y-4 flex-1">
        {visibleBridge.length > 0 && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/[0.04] p-2">
            <p className="px-2 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-amber-300/80">
              Current solution
            </p>
            <div className="space-y-0.5">
              {visibleBridge.map(renderLink)}
            </div>
          </div>
        )}

        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.03] p-2">
          <p className="px-2 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-300/70">
            Strategic
          </p>
          <div className="space-y-0.5">
            {visibleStrategic.map(renderLink)}
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-edge pt-3">
        {staffName && (
          <p className="px-3 mb-2 text-xs text-secondary truncate flex items-baseline gap-1.5">
            <span>{staffName}</span>
            {staffRole && (
              <span className="text-[10px] uppercase tracking-wide text-secondary/60">
                {staffRole}
              </span>
            )}
          </p>
        )}
        <button
          onClick={handleSignOut}
          className="flex items-center px-3 py-2 rounded-md text-sm text-secondary hover:bg-overlay hover:text-primary transition-colors w-full text-left"
        >
          Sign out
        </button>
      </div>
    </nav>
  )
}
