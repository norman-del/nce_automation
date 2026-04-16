'use client'

import { useEffect, useState } from 'react'

interface Supplier {
  id: string
  name: string
  stock_feed_url: string | null
  stock_feed_format: 'csv' | 'xml' | null
  stock_feed_parser: string | null
  stock_feed_schedule: string | null
  stock_feed_enabled: boolean
  stock_feed_last_run_at: string | null
  stock_feed_last_status: string | null
  stock_feed_last_row_count: number | null
  stock_feed_last_matched_count: number | null
  stock_feed_last_error: string | null
}

function statusPill(status: string | null) {
  if (!status) return <span className="text-xs text-secondary">Never run</span>
  const cls =
    status === 'success' ? 'bg-ok/10 text-ok border-ok/25'
    : status === 'aborted' ? 'bg-warn/10 text-warn border-warn/25'
    : 'bg-danger/10 text-danger border-danger/25'
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {status}
    </span>
  )
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const mins = Math.floor((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function SupplierFeedsManager() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/suppliers')
    const data = await res.json()
    setSuppliers(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function patchSupplier(id: string, patch: Partial<Supplier>) {
    setBusyId(id)
    setMsg(null)
    const res = await fetch(`/api/suppliers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setMsg(`Save failed: ${err.error || res.statusText}`)
    } else {
      const updated = await res.json()
      setSuppliers(prev => prev.map(s => (s.id === id ? { ...s, ...updated } : s)))
    }
    setBusyId(null)
  }

  async function runNow(id: string) {
    setBusyId(id)
    setMsg(null)
    const res = await fetch(`/api/suppliers/${id}/run-feed`, { method: 'POST' })
    const result = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMsg(`Run failed: ${result.error || res.statusText}`)
    } else {
      setMsg(
        `${result.supplierName}: ${result.status} — ${result.rowCount} rows, ${result.matchedCount} matched, ${result.updatedCount} updated` +
        (result.zeroingRows?.length ? ` (${result.zeroingRows.length} zeroed)` : '')
      )
      await load()
    }
    setBusyId(null)
  }

  if (loading) return <p className="text-sm text-secondary">Loading suppliers…</p>

  const withFeed = suppliers.filter(s => s.stock_feed_parser)
  const withoutFeed = suppliers.filter(s => !s.stock_feed_parser)

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="bg-surface border border-edge rounded-lg p-5">
        <h3 className="font-semibold text-primary mb-2">Supplier stock feeds</h3>
        <p className="text-sm text-secondary">
          Pulls supplier CSV/XML feeds and updates <span className="font-mono text-primary">products.stock_quantity</span> in
          Supabase. Does not touch Shopify or QBO. Safe to run alongside Stockeo; the storefront only reads Supabase after migration.
        </p>
        <p className="text-xs text-secondary mt-2">
          Fail-safes: products missing from the feed are never zeroed. Runs abort if row count drops below 50% of the previous run.
        </p>
      </div>

      {msg && (
        <div className="bg-overlay border border-edge rounded-lg p-3 text-sm text-primary">
          {msg}
        </div>
      )}

      {withFeed.map(s => (
        <div key={s.id} className="bg-surface border border-edge rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-primary">{s.name}</h4>
            <div className="flex items-center gap-2">
              {statusPill(s.stock_feed_last_status)}
              <label className="flex items-center gap-1.5 text-xs text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={s.stock_feed_enabled}
                  disabled={busyId === s.id}
                  onChange={e => patchSupplier(s.id, { stock_feed_enabled: e.target.checked })}
                />
                Enabled
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-secondary">Feed URL</div>
              <div className="font-mono text-primary break-all">{s.stock_feed_url}</div>
            </div>
            <div>
              <div className="text-secondary">Format / parser</div>
              <div className="text-primary">{s.stock_feed_format} · {s.stock_feed_parser}</div>
            </div>
            <div>
              <div className="text-secondary">Schedule</div>
              <div className="text-primary">{s.stock_feed_schedule || '—'}</div>
            </div>
            <div>
              <div className="text-secondary">Last run</div>
              <div className="text-primary">{formatRelative(s.stock_feed_last_run_at)}</div>
            </div>
            <div>
              <div className="text-secondary">Last row count</div>
              <div className="text-primary">{s.stock_feed_last_row_count ?? '—'}</div>
            </div>
            <div>
              <div className="text-secondary">Last matched</div>
              <div className="text-primary">{s.stock_feed_last_matched_count ?? '—'}</div>
            </div>
          </div>

          {s.stock_feed_last_error && (
            <div className="text-xs text-danger bg-danger/10 border border-danger/25 rounded p-2">
              {s.stock_feed_last_error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => runNow(s.id)}
              disabled={busyId === s.id}
              className="px-3 py-1.5 text-sm rounded-md bg-accent text-white hover:bg-accent-hi disabled:opacity-50"
            >
              {busyId === s.id ? 'Running…' : 'Run now'}
            </button>
          </div>
        </div>
      ))}

      {withoutFeed.length > 0 && (
        <div className="bg-surface border border-edge rounded-lg p-5">
          <h4 className="font-semibold text-primary mb-2">Suppliers without a feed</h4>
          <p className="text-xs text-secondary mb-2">
            These suppliers are in the directory but have no stock feed configured. Feed config is added via migration.
          </p>
          <ul className="text-sm text-secondary space-y-1">
            {withoutFeed.map(s => <li key={s.id}>{s.name}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
