'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface SyncResult {
  synced: number
  skipped: number
  total: number
}

export default function SyncPayoutsButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSync() {
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const res = await fetch('/api/shopify/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Sync failed')
      setResult(data)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={handleSync}
        disabled={loading}
        className="px-4 py-2 bg-accent text-white text-sm rounded-md hover:bg-accent-hi transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Syncing…' : 'Sync Payouts'}
      </button>

      {error && (
        <div className="rounded-lg border border-fail/30 bg-fail/10 px-4 py-2.5 text-sm text-fail w-full sm:max-w-xs">
          {error}
        </div>
      )}

      {result && (
        <div
          className={`rounded-lg border px-4 py-2.5 text-sm w-full sm:max-w-xs ${
            result.synced > 0
              ? 'border-ok/30 bg-ok/10 text-ok'
              : 'border-edge bg-overlay text-secondary'
          }`}
        >
          {result.synced > 0
            ? `${result.synced} new payout${result.synced !== 1 ? 's' : ''} pulled`
            : 'Already up to date'}
          {result.skipped > 0 && ` · ${result.skipped} skipped`}
        </div>
      )}
    </div>
  )
}
