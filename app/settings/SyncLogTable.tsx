'use client'

import { useState, useMemo } from 'react'

interface LogEntry {
  id: string
  created_at: string
  action: string
  payouts: { payout_date: string } | null
  status: string
  details: Record<string, unknown> | null
}

const statusStyles: Record<string, { pill: string; label: string }> = {
  success: { pill: 'bg-ok/10 text-ok border border-ok/25',       label: 'Success' },
  error:   { pill: 'bg-fail/10 text-fail border border-fail/25', label: 'Error'   },
}

function summariseDetails(action: string, details: Record<string, unknown> | null): string {
  if (!details) return '—'
  if (action === 'sync_full' || action === 'full_sync') {
    const d = details as { payments?: unknown[]; journalCreated?: boolean; errors?: unknown[] }
    const parts: string[] = []
    if (d.journalCreated) parts.push('Journal ✓')
    if (Array.isArray(d.payments) && d.payments.length > 0) parts.push(`${d.payments.length} orders`)
    if (Array.isArray(d.errors) && d.errors.length > 0) parts.push(`${d.errors.length} errors`)
    if (parts.length > 0) return parts.join(' · ')
  }
  const str = JSON.stringify(details)
  return str.length > 100 ? str.slice(0, 97) + '…' : str
}

export default function SyncLogTable({ logs }: { logs: LogEntry[] }) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'error'>('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      if (statusFilter !== 'all' && log.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          log.action.toLowerCase().includes(q) ||
          (log.payouts?.payout_date ?? '').includes(q)
        )
      }
      return true
    })
  }, [logs, statusFilter, search])

  return (
    <div className="bg-surface border border-edge rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-edge flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <input
          type="text"
          placeholder="Filter by action or date…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 bg-overlay border border-edge rounded-md text-sm text-primary placeholder:text-secondary focus:outline-none focus:border-accent transition-colors w-full sm:w-56"
        />
        <div className="flex items-center gap-1">
          {(['all', 'success', 'error'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                statusFilter === s
                  ? s === 'all'
                    ? 'bg-overlay text-primary border border-secondary'
                    : s === 'success'
                    ? 'bg-ok/15 text-ok border border-ok/30'
                    : 'bg-fail/15 text-fail border border-fail/30'
                  : 'text-secondary border border-edge hover:bg-overlay hover:text-primary'
              }`}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
          <span className="ml-auto sm:ml-0 text-xs text-secondary pl-2">{filtered.length}</span>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-overlay border-b border-edge">
              <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wide whitespace-nowrap">Time</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wide">Action</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wide whitespace-nowrap">Payout Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wide">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-secondary text-sm">
                  No entries match your filter.
                </td>
              </tr>
            ) : (
              filtered.map((log) => {
                const s = statusStyles[log.status] ?? { pill: 'bg-overlay text-secondary border border-edge', label: log.status }
                return (
                  <tr key={log.id} className="hover:bg-overlay transition-colors">
                    <td className="px-4 py-3 text-secondary text-xs whitespace-nowrap font-mono">
                      {new Date(log.created_at).toLocaleString('en-GB')}
                    </td>
                    <td className="px-4 py-3 font-mono text-primary text-xs">{log.action}</td>
                    <td className="px-4 py-3 text-secondary font-mono text-xs">
                      {log.payouts?.payout_date ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${s.pill}`}>
                        {s.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-secondary max-w-xs truncate font-mono text-xs">
                      {summariseDetails(log.action, log.details)}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Tablet/mobile log entries */}
      <div className="lg:hidden divide-y divide-edge">
        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-secondary text-sm">No entries match your filter.</p>
        ) : (
          filtered.map((log) => {
            const s = statusStyles[log.status] ?? { pill: 'bg-overlay text-secondary border border-edge', label: log.status }
            return (
              <div key={log.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="font-mono text-primary text-xs font-medium">{log.action}</span>
                  <span className={`shrink-0 inline-block px-2 py-0.5 rounded-full text-xs font-medium ${s.pill}`}>
                    {s.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-secondary font-mono mb-1">
                  <span>{new Date(log.created_at).toLocaleString('en-GB')}</span>
                  {log.payouts?.payout_date && (
                    <><span className="text-edge">·</span><span>{log.payouts.payout_date}</span></>
                  )}
                </div>
                <p className="text-xs text-secondary/70 font-mono truncate">
                  {summariseDetails(log.action, log.details)}
                </p>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
