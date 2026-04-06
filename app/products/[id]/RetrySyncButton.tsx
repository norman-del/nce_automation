'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RetrySyncButton({ productId, hasShopify, hasQbo }: {
  productId: string
  hasShopify: boolean
  hasQbo: boolean
}) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  async function handleAction(action: 'retry' | 'repush') {
    setLoading(action)
    setResult(null)
    const endpoint = action === 'retry' ? 'retry-sync' : 'repush'
    try {
      const res = await fetch(`/api/products/${productId}/${endpoint}`, { method: 'POST' })
      const data = await res.json()
      if (data.errors?.length > 0) {
        setResult(`Partial: ${data.errors.join('; ')}`)
      } else if (data.error) {
        setResult(`Error: ${data.error}`)
      } else {
        setResult(action === 'retry' ? 'Sync complete' : 'Re-pushed to Shopify & QBO')
        router.refresh()
      }
    } catch (err) {
      setResult(`Failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {(!hasShopify || !hasQbo) && (
          <button
            onClick={() => handleAction('retry')}
            disabled={loading !== null}
            className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-md hover:bg-accent-hi transition-colors disabled:opacity-50"
          >
            {loading === 'retry' ? 'Retrying...' : 'Retry Sync'}
          </button>
        )}
        <button
          onClick={() => handleAction('repush')}
          disabled={loading !== null}
          className="px-3 py-1.5 text-xs font-medium border border-accent text-accent rounded-md hover:bg-accent/10 transition-colors disabled:opacity-50"
        >
          {loading === 'repush' ? 'Re-pushing...' : 'Re-push to Shopify & QBO'}
        </button>
      </div>
      {result && (
        <p className={`text-xs ${result.startsWith('Sync complete') || result.startsWith('Re-pushed') ? 'text-ok' : 'text-fail'}`}>
          {result}
        </p>
      )}
    </div>
  )
}
