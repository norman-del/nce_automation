'use client'

import { usePathname } from 'next/navigation'
import SidebarNav from './SidebarNav'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (pathname === '/login') {
    return <>{children}</>
  }

  return (
    <>
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-surface border-r border-edge flex flex-col">
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
      <main className="flex-1 min-w-0 p-8 bg-canvas">{children}</main>
    </>
  )
}
