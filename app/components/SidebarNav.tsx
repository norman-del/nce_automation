'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { StaffRole } from '@/lib/auth/staff'

const navLinks = [
  { href: '/',          label: 'Dashboard', adminOnly: false },
  { href: '/orders',    label: 'Orders',    adminOnly: false },
  { href: '/products',  label: 'Products',  adminOnly: false },
  { href: '/customers', label: 'Customers', adminOnly: false },
  { href: '/finance',   label: 'Finance',   adminOnly: true  },
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

  const visibleLinks = navLinks.filter(l => !l.adminOnly || isAdmin)

  async function handleSignOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className="flex flex-col flex-1 px-3 py-4">
      <div className="space-y-0.5 flex-1">
        {visibleLinks.map(({ href, label }) => {
          const active =
            pathname === href ||
            (href !== '/' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center px-3 py-2 rounded-md text-sm transition-colors ${
                active
                  ? 'bg-overlay text-accent font-medium border border-accent/20'
                  : 'text-secondary hover:bg-overlay hover:text-primary'
              }`}
            >
              {label}
            </Link>
          )
        })}
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
