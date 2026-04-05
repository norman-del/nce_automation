'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import SidebarNav from './SidebarNav'

const tabs = [
  {
    href: '/payouts',
    label: 'Payouts',
    activeWhen: (p: string) => p.startsWith('/payouts'),
    icon: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18.75-9v.75c0 .414.336.75.75.75h.75m-1.5 0V18.75m0-12.75h.375c.621 0 1.125.504 1.125 1.125v.375m0 0H21m0 0v-.375A1.125 1.125 0 0019.875 6H19.5m1.5 12.75H3.75M12 12.75a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" />
      </svg>
    ),
  },
  {
    href: '/products',
    label: 'Products',
    activeWhen: (p: string) => p.startsWith('/products'),
    icon: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
      </svg>
    ),
  },
  {
    href: '/',
    label: 'Dashboard',
    activeWhen: (p: string) => p === '/',
    icon: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    href: '/sync-log',
    label: 'Log',
    activeWhen: (p: string) => p.startsWith('/sync-log'),
    icon: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
  },
  {
    href: '/settings',
    label: 'Settings',
    activeWhen: (p: string) => p.startsWith('/settings'),
    icon: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (pathname === '/login') return <>{children}</>

  return (
    <div className="flex flex-col sm:flex-row flex-1 w-full">
      {/* Mobile top header */}
      <header className="sticky top-0 z-40 flex h-12 items-center border-b border-edge bg-surface px-4 sm:hidden">
        <h1 className="text-sm font-semibold text-primary">Fee Sync</h1>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden sm:flex w-56 shrink-0 bg-surface border-r border-edge flex-col">
        <div className="px-6 py-5 border-b border-edge">
          <h1 className="text-sm font-semibold text-primary leading-tight">
            Shopify ↔ QBO
            <br />
            <span className="text-secondary font-normal">Fee Sync</span>
          </h1>
        </div>
        <SidebarNav />
        <div className="px-6 py-4 border-t border-edge">
          <p className="text-xs text-secondary">NCE Equipment</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 p-4 pb-16 bg-canvas sm:p-8 sm:pb-8">
        {children}
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 border-t border-edge bg-surface sm:hidden">
        {tabs.map((tab) => {
          const active = tab.activeWhen(pathname)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center justify-center gap-1 transition-colors ${
                active ? 'text-accent' : 'text-secondary hover:text-primary'
              }`}
            >
              {tab.icon}
              <span className="text-[10px]">{tab.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
