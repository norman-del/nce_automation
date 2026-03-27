'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SyncResult } from '@/lib/sync/orchestrator'

export default function SyncButton({ payoutId }: { payoutId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSync() {
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const res = await fetch(`/api/sync/${payoutId}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Sync failed')
      setResult(data)
      router.refresh() // reload transaction list on the page
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-3">
      <button
        onClick={handleSync}
        disabled={loading}
        className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Syncing…' : 'Run Full Sync'}
      </button>

      {error && (
        <div className="w-80 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold mb-1">Sync failed</p>
          <p>{error}</p>
        </div>
      )}

      {result && (
        <div className={`w-80 rounded-lg border p-4 text-sm ${result.success ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'}`}>
          <p className={`font-semibold mb-3 ${result.success ? 'text-green-800' : 'text-yellow-800'}`}>
            {result.success ? 'Sync complete' : 'Sync completed with issues'}
          </p>

          {/* Journal entry */}
          <div className="mb-3 pb-3 border-b border-black/10">
            <p className="text-gray-600 text-xs uppercase tracking-wide mb-1">Fees journal entry</p>
            {result.journalCreated ? (
              <p className="text-green-700">Created — £{result.totalFees.toFixed(2)} booked to Shopify Charges</p>
            ) : (
              <p className="text-gray-500">Already existed (#{result.journalEntryId})</p>
            )}
          </div>

          {/* Per-order results */}
          <div>
            <p className="text-gray-600 text-xs uppercase tracking-wide mb-2">Orders</p>
            <ul className="space-y-1.5">
              {result.payments.map((p, i) => (
                <li key={i} className="flex items-start justify-between gap-2">
                  <span className="font-mono text-gray-800">{p.orderNumber}</span>
                  <span className="text-right">
                    {p.status === 'paid' && <span className="text-green-700">Paid £{p.amount.toFixed(2)}</span>}
                    {p.status === 'already_paid' && <span className="text-gray-400">Already paid</span>}
                    {p.status === 'no_invoice' && <span className="text-yellow-700">No invoice found in QBO</span>}
                    {p.status === 'error' && <span className="text-red-700">Error</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {result.errors.length > 0 && (
            <div className="mt-3 pt-3 border-t border-black/10">
              <p className="text-red-700 text-xs font-semibold mb-1">Errors</p>
              {result.errors.map((e, i) => <p key={i} className="text-red-600 text-xs">{e}</p>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
