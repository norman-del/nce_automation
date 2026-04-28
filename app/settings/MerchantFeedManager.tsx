'use client'

import { useCallback, useEffect, useState } from 'react'

interface LastRun {
  id: string
  status: string
  created_at: string
  details: {
    source?: string
    row_count?: number
    skipped?: number
    public_url?: string
    duration_ms?: number
    error?: string
  } | null
}

interface StatusResponse {
  public_url: string
  last_run: LastRun | null
}

function relativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export default function MerchantFeedManager() {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/merchant-feed/status')
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load status')
      setStatus(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function runNow() {
    setRunning(true); setError(null)
    try {
      const res = await fetch('/api/merchant-feed/run', { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).error || 'Run failed')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  if (loading) return <p className="text-sm text-secondary">Loading…</p>

  const last = status?.last_run
  const successDetails = last?.status === 'success' ? last.details : null

  return (
    <div className="space-y-6 max-w-2xl">
      {error && (
        <div className="bg-fail/10 border border-fail/25 text-fail rounded-md px-4 py-3 text-sm">{error}</div>
      )}

      <div className="bg-surface border border-edge rounded-lg p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-primary">Google Merchant Feed</h3>
            <p className="text-xs text-secondary mt-1">
              Daily CSV of all active stocked products, ready to submit to Google Merchant Center
              (free Shopping listings) and Bing Merchant Center (Bing Shopping + ChatGPT/Copilot grounded search).
            </p>
          </div>
          <button
            onClick={runNow}
            disabled={running}
            className="px-3 py-1.5 bg-accent text-white text-xs rounded-md hover:bg-accent-hi disabled:opacity-50 whitespace-nowrap"
          >
            {running ? 'Running…' : 'Run now'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-secondary uppercase tracking-wide mb-1">Last run</p>
            {last ? (
              <p className={last.status === 'success' ? 'text-ok' : 'text-fail'}>
                {last.status === 'success' ? '✓ ' : '✗ '}
                {relativeTime(last.created_at)}{' '}
                <span className="text-secondary text-xs">({last.details?.source ?? 'unknown'})</span>
              </p>
            ) : (
              <p className="text-secondary">Never run</p>
            )}
            {last?.status === 'error' && last.details?.error && (
              <p className="text-xs text-fail mt-1 break-words">{last.details.error}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-secondary uppercase tracking-wide mb-1">Rows in feed</p>
            <p className="text-primary">
              {successDetails?.row_count ?? '—'}
              {successDetails?.skipped != null && successDetails.skipped > 0 && (
                <span className="text-secondary text-xs ml-2">({successDetails.skipped} skipped)</span>
              )}
            </p>
          </div>
        </div>

        {status?.public_url && (
          <div>
            <p className="text-xs text-secondary uppercase tracking-wide mb-1">Public feed URL</p>
            <a
              href={status.public_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-accent hover:text-accent-hi font-mono break-all"
            >
              {status.public_url}
            </a>
          </div>
        )}
      </div>

      <div className="bg-surface border border-edge rounded-lg p-5 space-y-3 text-sm">
        <h3 className="font-semibold text-primary">Setup</h3>
        <ol className="list-decimal list-inside text-secondary space-y-1.5">
          <li>
            Run the feed manually at least once and download the CSV via the public URL to spot-check.
          </li>
          <li>
            Create a Google Merchant Center account at{' '}
            <a
              className="text-accent hover:text-accent-hi"
              href="https://merchants.google.com"
              target="_blank"
              rel="noopener noreferrer"
            >merchants.google.com</a>
            {' '}and add the public feed URL as a scheduled feed source (daily).
          </li>
          <li>
            Mirror the same setup in{' '}
            <a
              className="text-accent hover:text-accent-hi"
              href="https://www.bingmerchantcenter.com"
              target="_blank"
              rel="noopener noreferrer"
            >Bing Merchant Center</a>
            {' '}— Bing Shopping data also feeds ChatGPT and Microsoft Copilot grounded search.
          </li>
          <li>
            The Vercel cron regenerates the feed daily at 04:00 UTC. Toggle it off in <code className="font-mono bg-overlay px-1.5 py-0.5 rounded">vercel.json</code> if you need to pause.
          </li>
        </ol>
      </div>
    </div>
  )
}
