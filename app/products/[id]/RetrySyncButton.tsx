'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  productId: string
  sku: string
  hasShopify: boolean
  hasQbo: boolean
}

export default function RetrySyncButton({ productId, sku, hasShopify, hasQbo }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  async function call(endpoint: string, body?: object) {
    setLoading(endpoint)
    setResult(null)
    try {
      const res = await fetch(`/api/products/${productId}/${endpoint}`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json()
      if (data.errors?.length > 0) {
        setResult(`Partial: ${data.errors.join('; ')}`)
      } else if (data.error) {
        setResult(`Error: ${data.error}`)
      } else {
        setResult('Done')
        router.refresh()
      }
    } catch (err) {
      setResult(`Failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(null)
    }
  }

  async function handleRetry() {
    await call('retry-sync')
  }

  async function handleRepushShopify() {
    await call('repush-shopify')
  }

  async function handleRecreateConfirmed() {
    setConfirmOpen(false)
    setConfirmText('')
    await call('repush', { confirmedSku: sku })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {(!hasShopify || !hasQbo) && (
          <button
            onClick={handleRetry}
            disabled={loading !== null}
            className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-md hover:bg-accent-hi transition-colors disabled:opacity-50"
          >
            {loading === 'retry-sync' ? 'Retrying...' : 'Retry Sync'}
          </button>
        )}
        {hasShopify && (
          <button
            onClick={handleRepushShopify}
            disabled={loading !== null}
            className="px-3 py-1.5 text-xs font-medium border border-accent text-accent rounded-md hover:bg-accent/10 transition-colors disabled:opacity-50"
          >
            {loading === 'repush-shopify' ? 'Re-pushing...' : 'Re-push to Shopify'}
          </button>
        )}
        {hasQbo && (
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={loading !== null}
            className="px-3 py-1.5 text-xs font-medium border border-fail/60 text-fail rounded-md hover:bg-fail/10 transition-colors disabled:opacity-50"
          >
            Recreate QuickBooks item…
          </button>
        )}
      </div>
      {result && (
        <p className={`text-xs ${result === 'Done' ? 'text-ok' : 'text-fail'}`}>{result}</p>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-w-md w-full bg-bg border border-fail/60 rounded-lg p-5 space-y-4">
            <h3 className="text-base font-semibold text-fail">Recreate QuickBooks item?</h3>
            <div className="text-sm space-y-2 text-fg">
              <p>
                This deactivates the current QuickBooks item for SKU <strong>{sku}</strong> and
                creates a brand new one.
              </p>
              <p className="text-fail">
                Consequences you cannot undo without manual QBO work:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs">
                <li>Stock on the old item is written off to <em>Inventory Shrinkage</em> by QBO.</li>
                <li>
                  Any bills, invoices, or sales receipts that reference the old item will show
                  &quot;(deleted)&quot; against it.
                </li>
                <li>The new item starts with QtyOnHand 0 and no transaction history.</li>
              </ul>
              <p className="text-xs">
                Use this only if the QuickBooks item is broken and has{' '}
                <strong>no bills, invoices, or sales</strong> against it. Otherwise, fix the item
                via the <em>Edit</em> page.
              </p>
              <p className="text-xs pt-2">
                Type the SKU <code className="px-1 rounded bg-fg/10">{sku}</code> to confirm:
              </p>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="w-full px-2 py-1 border border-fg/30 rounded bg-bg text-sm font-mono"
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setConfirmOpen(false)
                  setConfirmText('')
                }}
                className="px-3 py-1.5 text-xs border border-fg/30 rounded-md hover:bg-fg/10"
              >
                Cancel
              </button>
              <button
                onClick={handleRecreateConfirmed}
                disabled={confirmText !== sku || loading !== null}
                className="px-3 py-1.5 text-xs font-medium bg-fail text-white rounded-md hover:bg-fail/90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading === 'repush' ? 'Recreating...' : 'Recreate item'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
