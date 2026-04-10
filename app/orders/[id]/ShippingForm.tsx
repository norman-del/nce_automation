'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function ShippingForm({
  orderId,
  currentStatus,
  trackingNumber,
}: {
  orderId: string
  currentStatus: string
  trackingNumber: string | null
}) {
  const router = useRouter()
  const [tracking, setTracking] = useState(trackingNumber ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canShip = currentStatus === 'processing'
  const isShipped = currentStatus === 'shipped' || currentStatus === 'delivered'

  async function handleShip(e: React.FormEvent) {
    e.preventDefault()
    if (!tracking.trim()) return
    setLoading(true)
    setError(null)

    const res = await fetch(`/api/orders/${orderId}/ship`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracking_number: tracking.trim() }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Failed to mark as shipped')
      setLoading(false)
      return
    }

    setLoading(false)
    router.refresh()
  }

  return (
    <div className="bg-surface border border-edge rounded-lg p-5">
      <h3 className="text-sm font-medium text-primary mb-3">Shipping</h3>

      {isShipped && trackingNumber && (
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-ok/10 text-ok border border-ok/25">
            Shipped
          </span>
          <span className="text-sm text-secondary">
            Tracking: <span className="font-mono text-primary">{trackingNumber}</span>
          </span>
        </div>
      )}

      {canShip && (
        <form onSubmit={handleShip} className="flex gap-2">
          <input
            type="text"
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            placeholder="Enter tracking number"
            className="flex-1 min-w-0 px-3 py-2 bg-overlay border border-edge rounded-md text-sm text-primary placeholder:text-secondary focus:outline-none focus:border-accent transition-colors"
          />
          <button
            type="submit"
            disabled={loading || !tracking.trim()}
            className="px-4 py-2 rounded-md text-sm font-medium border bg-ok/15 text-ok border-ok/30 hover:bg-ok/25 transition-colors disabled:opacity-50"
          >
            {loading ? 'Shipping...' : 'Mark shipped'}
          </button>
        </form>
      )}

      {!canShip && !isShipped && (
        <p className="text-sm text-secondary">
          {currentStatus === 'paid'
            ? 'Set status to processing before shipping.'
            : 'Order cannot be shipped in its current state.'}
        </p>
      )}

      {error && <p className="text-sm text-fail mt-2">{error}</p>}
    </div>
  )
}
