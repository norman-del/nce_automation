'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SyncResult } from '@/lib/sync/orchestrator'

interface Props {
  payoutId: string
  alreadyPosted: boolean
}

export default function SyncButton({ payoutId, alreadyPosted }: Props) {
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
      if (!res.ok) throw new Error(data.error ?? 'Post failed')
      setResult(data)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Desktop: inline in page header */}
      <div className="hidden sm:flex flex-col items-end gap-2">
        <button
          onClick={handleSync}
          disabled={loading}
          className={`px-4 py-2 text-sm rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            alreadyPosted
              ? 'bg-warn/15 text-warn border border-warn/30 hover:bg-warn/25'
              : 'bg-accent text-white hover:bg-accent-hi'
          }`}
        >
          {loading ? 'Posting…' : alreadyPosted ? 'Re-post to QuickBooks' : 'Post to QuickBooks'}
        </button>
        {alreadyPosted && !result && !error && (
          <p className="text-xs text-secondary max-w-56 text-right leading-relaxed">
            Already posted. Re-running is safe — items already in QBO will be skipped.
          </p>
        )}
        {error && (
          <div className="w-80 rounded-lg border border-fail/30 bg-fail/10 p-4 text-sm text-fail">
            <p className="font-semibold mb-1">Post failed</p>
            <p>{error}</p>
          </div>
        )}
        {result && (
          <div className={`w-80 rounded-lg border p-4 text-sm ${result.success ? 'border-ok/30 bg-ok/10' : 'border-warn/30 bg-warn/10'}`}>
            <p className={`font-semibold mb-3 ${result.success ? 'text-ok' : 'text-warn'}`}>
              {result.success ? 'Posted to QuickBooks' : 'Posted with issues'}
            </p>
            <div className="mb-3 pb-3 border-b border-edge">
              <p className="text-secondary text-xs uppercase tracking-wide mb-1">Fees journal entry</p>
              {result.journalCreated ? (
                <p className="text-ok text-xs">Created — £{result.totalFees.toFixed(2)} booked to Shopify Charges</p>
              ) : (
                <p className="text-secondary text-xs">Already existed (#{result.journalEntryId})</p>
              )}
            </div>
            <div>
              <p className="text-secondary text-xs uppercase tracking-wide mb-2">Orders</p>
              <ul className="space-y-1.5">
                {result.payments.map((p, i) => (
                  <li key={i} className="flex items-start justify-between gap-2 text-xs">
                    <span className="font-mono text-primary">{p.orderNumber}</span>
                    <span className="text-right">
                      {p.status === 'paid' && <span className="text-ok">Paid £{p.amount.toFixed(2)}</span>}
                      {p.status === 'already_paid' && <span className="text-secondary">Already paid</span>}
                      {p.status === 'no_invoice' && <span className="text-warn">No invoice in QBO</span>}
                      {p.status === 'error' && <span className="text-fail">Error</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {result.errors.length > 0 && (
              <div className="mt-3 pt-3 border-t border-edge">
                <p className="text-fail text-xs font-semibold mb-1">Errors</p>
                {result.errors.map((e, i) => (
                  <p key={i} className="text-fail text-xs">{e}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile: sticky bottom bar — sits above the bottom tab nav (bottom-16 = 64px tab height) */}
      <div className="sm:hidden fixed bottom-16 left-0 right-0 z-40 bg-canvas border-t border-edge px-4 pt-3 pb-4">
        {error && (
          <div className="mb-3 rounded-lg border border-fail/30 bg-fail/10 p-3 text-sm text-fail">
            <p className="font-semibold text-sm mb-0.5">Post failed</p>
            <p className="text-xs">{error}</p>
          </div>
        )}
        {result && (
          <div className={`mb-3 rounded-lg border p-3 ${result.success ? 'border-ok/30 bg-ok/10' : 'border-warn/30 bg-warn/10'}`}>
            <p className={`font-semibold text-sm mb-1.5 ${result.success ? 'text-ok' : 'text-warn'}`}>
              {result.success ? '✓ Posted to QuickBooks' : 'Posted with issues'}
            </p>
            <p className="text-xs text-secondary">
              {result.journalCreated
                ? `Journal created · £${result.totalFees.toFixed(2)} fees booked`
                : `Journal already existed`}
            </p>
            <p className="text-xs text-secondary mt-0.5">
              {result.payments.filter((p) => p.status === 'paid').length} paid
              {result.payments.filter((p) => p.status === 'already_paid').length > 0 &&
                ` · ${result.payments.filter((p) => p.status === 'already_paid').length} already paid`}
              {result.payments.filter((p) => p.status === 'no_invoice').length > 0 &&
                ` · ${result.payments.filter((p) => p.status === 'no_invoice').length} no invoice`}
              {result.errors.length > 0 &&
                ` · ${result.errors.length} error${result.errors.length > 1 ? 's' : ''}`}
            </p>
          </div>
        )}
        {alreadyPosted && !result && !error && (
          <p className="text-xs text-secondary mb-2.5 text-center">
            Already posted — re-running is safe, duplicates are skipped.
          </p>
        )}
        <button
          onClick={handleSync}
          disabled={loading}
          className={`w-full py-4 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            alreadyPosted
              ? 'bg-warn/15 text-warn border border-warn/30 active:bg-warn/25'
              : 'bg-accent text-white active:bg-accent-hi'
          }`}
        >
          {loading ? 'Posting…' : alreadyPosted ? 'Re-post to QuickBooks' : 'Post to QuickBooks'}
        </button>
      </div>
    </>
  )
}
