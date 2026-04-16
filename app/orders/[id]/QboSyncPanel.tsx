'use client'

import { useState } from 'react'

interface SyncRow {
  status: string
  qbo_customer_id: string | null
  qbo_invoice_id: string | null
  qbo_payment_id: string | null
  payload: unknown
  error_message: string | null
  synced_at: string | null
}

interface Props {
  orderId: string
  initial: SyncRow | null
  syncEnabled: boolean
}

function statusPill(status: string | null | undefined) {
  if (!status) return <span className="text-xs text-secondary">Not synced yet</span>
  const cls =
    status === 'success' ? 'bg-ok/10 text-ok border-ok/25'
    : status === 'dry_run' ? 'bg-accent/10 text-accent border-accent/25'
    : status === 'skipped' ? 'bg-overlay text-secondary border-edge'
    : 'bg-danger/10 text-danger border-danger/25'
  const label = status === 'dry_run' ? 'Dry run' : status
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${cls} capitalize`}>
      {label}
    </span>
  )
}

export default function QboSyncPanel({ orderId, initial, syncEnabled }: Props) {
  const [sync, setSync] = useState<SyncRow | null>(initial)
  const [running, setRunning] = useState(false)
  const [showPayload, setShowPayload] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setRunning(true)
    setError(null)
    const res = await fetch(`/api/sync/order-to-qbo/${orderId}`, { method: 'POST' })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      setError(body?.error || res.statusText)
    } else {
      setSync({
        status: body.status,
        qbo_customer_id: body.qboCustomerId,
        qbo_invoice_id: body.qboInvoiceId,
        qbo_payment_id: body.qboPaymentId,
        payload: body.payload ?? null,
        error_message: body.error ?? null,
        synced_at: new Date().toISOString(),
      })
    }
    setRunning(false)
  }

  return (
    <div className="bg-surface border border-edge rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-primary">QBO Sales Sync</h3>
        {statusPill(sync?.status)}
      </div>

      {!syncEnabled && (
        <div className="text-xs text-secondary bg-overlay border border-edge rounded p-2 mb-3">
          Dry-run mode. Set <span className="font-mono">QBO_SALES_SYNC_ENABLED=true</span> post-cutover to write live invoices.
        </div>
      )}

      <div className="space-y-1.5 text-sm mb-3">
        <div className="flex justify-between">
          <span className="text-secondary">QBO customer</span>
          <span className="font-mono text-xs text-primary">{sync?.qbo_customer_id ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-secondary">QBO invoice</span>
          <span className="font-mono text-xs text-primary">{sync?.qbo_invoice_id ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-secondary">QBO payment</span>
          <span className="font-mono text-xs text-primary">{sync?.qbo_payment_id ?? '—'}</span>
        </div>
        {sync?.synced_at && (
          <div className="flex justify-between">
            <span className="text-secondary">Last run</span>
            <span className="text-xs text-secondary">
              {new Date(sync.synced_at).toLocaleString('en-GB')}
            </span>
          </div>
        )}
      </div>

      {sync?.error_message && (
        <div className="text-xs text-danger bg-danger/10 border border-danger/25 rounded p-2 mb-3">
          {sync.error_message}
        </div>
      )}

      {error && (
        <div className="text-xs text-danger bg-danger/10 border border-danger/25 rounded p-2 mb-3">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={run}
          disabled={running}
          className="px-3 py-1.5 text-sm rounded-md bg-accent text-white hover:bg-accent-hi disabled:opacity-50"
        >
          {running ? 'Running…' : syncEnabled ? 'Sync to QBO' : 'Generate dry-run'}
        </button>
        {sync?.payload != null && (
          <button
            onClick={() => setShowPayload(v => !v)}
            className="px-3 py-1.5 text-sm rounded-md border border-edge text-secondary hover:text-primary"
          >
            {showPayload ? 'Hide payload' : 'View payload'}
          </button>
        )}
      </div>

      {showPayload && sync?.payload != null && (
        <pre className="mt-3 p-3 text-xs bg-overlay border border-edge rounded max-h-96 overflow-auto whitespace-pre-wrap break-all">
          {JSON.stringify(sync.payload, null, 2)}
        </pre>
      )}
    </div>
  )
}
