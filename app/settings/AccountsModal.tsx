'use client'

import { useState } from 'react'

interface Account {
  id: string
  name: string
  type: string
  subtype: string
  active: boolean
}

export default function AccountsModal() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function openModal() {
    setOpen(true)
    if (accounts.length > 0) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/qbo/accounts')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load accounts')
      setAccounts(data.accounts)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const filtered = accounts.filter(
    (a) =>
      !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.id.includes(search) ||
      a.type.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <button
        onClick={openModal}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-overlay text-secondary text-xs rounded-md border border-edge hover:border-secondary hover:text-primary transition-colors"
      >
        View QBO accounts list
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Modal */}
          <div className="relative w-full max-w-2xl bg-surface border border-edge rounded-xl shadow-2xl flex flex-col max-h-[80vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-edge">
              <div>
                <h3 className="font-semibold text-primary">QBO Chart of Accounts</h3>
                {accounts.length > 0 && (
                  <p className="text-xs text-secondary mt-0.5">{accounts.length} accounts</p>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-secondary hover:text-primary text-xl leading-none w-8 h-8 flex items-center justify-center rounded-md hover:bg-overlay transition-colors"
              >
                ×
              </button>
            </div>

            {/* Search */}
            <div className="px-5 py-3 border-b border-edge">
              <input
                type="text"
                placeholder="Search by name, ID, or type…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-2 bg-overlay border border-edge rounded-md text-sm text-primary placeholder:text-secondary focus:outline-none focus:border-accent transition-colors"
                autoFocus
              />
            </div>

            {/* Table */}
            <div className="overflow-auto flex-1">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-secondary text-sm">
                  Loading accounts…
                </div>
              ) : error ? (
                <div className="px-5 py-4 text-sm text-fail">{error}</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-overlay border-b border-edge">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-secondary uppercase tracking-wide w-20">
                        ID
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-secondary uppercase tracking-wide">
                        Name
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-secondary uppercase tracking-wide w-36">
                        Type
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge">
                    {filtered.map((a) => (
                      <tr key={a.id} className="hover:bg-overlay transition-colors">
                        <td className="px-4 py-2.5 font-mono text-secondary text-xs">{a.id}</td>
                        <td className="px-4 py-2.5 text-primary">{a.name}</td>
                        <td className="px-4 py-2.5 text-secondary text-xs">{a.type}</td>
                      </tr>
                    ))}
                    {filtered.length === 0 && !loading && (
                      <tr>
                        <td colSpan={3} className="px-4 py-10 text-center text-secondary text-sm">
                          No accounts match your search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            {accounts.length > 0 && (
              <div className="px-5 py-2.5 border-t border-edge text-xs text-secondary">
                Showing {filtered.length} of {accounts.length} accounts
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
