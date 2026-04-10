'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

const STATUS_FLOW: Record<string, string[]> = {
  paid:       ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped:    ['delivered'],
  delivered:  [],
  cancelled:  [],
  refunded:   [],
}

const buttonStyles: Record<string, string> = {
  processing: 'bg-warn/15 text-warn border-warn/30 hover:bg-warn/25',
  shipped:    'bg-ok/15 text-ok border-ok/30 hover:bg-ok/25',
  delivered:  'bg-ok/15 text-ok border-ok/30 hover:bg-ok/25',
  cancelled:  'bg-overlay text-secondary border-edge hover:text-primary',
  refunded:   'bg-fail/15 text-fail border-fail/30 hover:bg-fail/25',
}

export default function OrderStatusButtons({
  orderId,
  currentStatus,
}: {
  orderId: string
  currentStatus: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const nextStatuses = STATUS_FLOW[currentStatus] ?? []
  if (nextStatuses.length === 0) return null

  async function updateStatus(newStatus: string) {
    setLoading(newStatus)
    setError(null)

    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Failed to update status')
      setLoading(null)
      return
    }

    setLoading(null)
    router.refresh()
  }

  return (
    <div className="flex flex-wrap gap-2">
      {nextStatuses.map((s) => (
        <button
          key={s}
          onClick={() => updateStatus(s)}
          disabled={loading !== null}
          className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors disabled:opacity-50 ${buttonStyles[s] ?? buttonStyles.cancelled}`}
        >
          {loading === s ? 'Updating...' : `Mark ${s}`}
        </button>
      ))}
      {currentStatus === 'paid' && (
        <a
          href={`/api/orders/${orderId}/refund`}
          onClick={async (e) => {
            e.preventDefault()
            if (!confirm('Are you sure you want to refund this order?')) return
            setLoading('refunded')
            setError(null)
            const res = await fetch(`/api/orders/${orderId}/refund`, { method: 'POST' })
            if (!res.ok) {
              const data = await res.json()
              setError(data.error ?? 'Refund failed')
              setLoading(null)
              return
            }
            setLoading(null)
            router.refresh()
          }}
          className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors cursor-pointer ${buttonStyles.refunded} ${loading ? 'opacity-50 pointer-events-none' : ''}`}
        >
          {loading === 'refunded' ? 'Refunding...' : 'Refund'}
        </a>
      )}
      {error && <p className="w-full text-sm text-fail mt-1">{error}</p>}
    </div>
  )
}
