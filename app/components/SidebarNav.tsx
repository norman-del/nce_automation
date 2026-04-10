'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const navLinks = [
  { href: '/',          label: 'Dashboard' },
  { href: '/orders',    label: 'Orders'    },
  { href: '/customers', label: 'Customers' },
  { href: '/products',  label: 'Products'  },
  { href: '/promotions', label: 'Promotions' },
  { href: '/shipping',   label: 'Shipping'   },
  { href: '/payouts',   label: 'Payouts'   },
  { href: '/sync-log',  label: 'Sync Log'  },
  { href: '/settings',  label: 'Settings'  },
]

export default function SidebarNav() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className="flex flex-col flex-1 px-3 py-4">
      <div className="space-y-0.5 flex-1">
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
      </div>

      <button
        onClick={handleSignOut}
        className="mt-4 flex items-center px-3 py-2 rounded-md text-sm text-secondary hover:bg-overlay hover:text-primary transition-colors w-full text-left"
      >
        Sign out
      </button>
    </nav>
  )
}
