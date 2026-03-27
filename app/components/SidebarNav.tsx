'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navLinks = [
  { href: '/',          label: 'Dashboard' },
  { href: '/payouts',   label: 'Payouts'   },
  { href: '/sync-log',  label: 'Sync Log'  },
  { href: '/settings',  label: 'Settings'  },
]

export default function SidebarNav() {
  const pathname = usePathname()

  return (
    <nav className="flex-1 px-3 py-4 space-y-0.5">
      {navLinks.map(({ href, label }) => {
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
    </nav>
  )
}
