'use client'

import { useState } from 'react'

export default function RetrySyncButton({ productId }: { productId: string }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function handleRetry() {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/products/${productId}/retry-sync`, { method: 'POST' })
      const data = await res.json()
      if (data.errors?.length > 0) {
        setResult(`Partial: ${data.errors.join('; ')}`)
      } else if (data.error) {
        setResult(`Error: ${data.error}`)
      } else {
        setResult('Sync complete — reload to see updated status')
      }
    } catch (err) {
      setResult(`Failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleRetry}
        disabled={loading}
        className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-md hover:bg-accent-hi transition-colors disabled:opacity-50"
      >
        {loading ? 'Retrying...' : 'Retry Sync'}
      </button>
      {result && (
        <p className={`text-xs ${result.startsWith('Sync complete') ? 'text-ok' : 'text-fail'}`}>
          {result}
        </p>
      )}
    </div>
  )
}
