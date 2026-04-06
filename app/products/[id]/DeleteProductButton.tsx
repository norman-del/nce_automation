'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DeleteProductButton({ productId, sku }: { productId: string; sku: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/products/${productId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        alert(`Delete failed: ${data.error || res.statusText}`)
        return
      }
      router.push('/products')
    } catch (err) {
      alert(`Delete failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setDeleting(false)
      setConfirming(false)
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="px-3 py-1.5 text-xs font-medium text-fail border border-fail/25 rounded-md hover:bg-fail/10 transition-colors"
      >
        Delete Product
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-fail">Delete {sku}?</span>
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="px-3 py-1.5 text-xs font-medium bg-fail text-white rounded-md hover:bg-fail/80 disabled:opacity-50 transition-colors"
      >
        {deleting ? 'Deleting...' : 'Confirm'}
      </button>
      <button
        onClick={() => setConfirming(false)}
        className="px-3 py-1.5 text-xs text-secondary hover:text-primary"
      >
        Cancel
      </button>
    </div>
  )
}
