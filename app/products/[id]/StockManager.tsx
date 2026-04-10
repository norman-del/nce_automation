'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const REASONS = [
  { value: 'manual', label: 'Manual adjustment' },
  { value: 'return', label: 'Customer return' },
  { value: 'damaged', label: 'Damaged / write-off' },
  { value: 'recount', label: 'Stock recount' },
  { value: 'import', label: 'New stock received' },
]

export default function StockManager({
  productId,
  stockQuantity,
  lowStockThreshold,
}: {
  productId: string
  stockQuantity: number
  lowStockThreshold: number
}) {
  const router = useRouter()
  const [change, setChange] = useState('')
  const [reason, setReason] = useState('manual')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isLowStock = stockQuantity <= lowStockThreshold && stockQuantity > 0
  const isOutOfStock = stockQuantity === 0

  async function handleAdjust(e: React.FormEvent) {
    e.preventDefault()
    const qty = parseInt(change, 10)
    if (isNaN(qty) || qty === 0) return

    setLoading(true)
    setError(null)

    const res = await fetch(`/api/products/${productId}/stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity_change: qty, reason, notes: notes || null }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Failed to adjust stock')
      setLoading(false)
      return
    }

    setChange('')
    setNotes('')
    setLoading(false)
    router.refresh()
  }

  const inputCls = 'w-full bg-overlay border border-edge rounded-md px-3 py-2 text-sm text-primary placeholder:text-secondary focus:outline-none focus:border-accent transition-colors'

  return (
    <div className="bg-surface border border-edge rounded-lg p-5 space-y-3">
      <h3 className="text-xs font-semibold text-accent uppercase tracking-wide">Inventory</h3>

      <div className="flex items-center gap-3">
        <span className="text-2xl font-semibold text-primary">{stockQuantity}</span>
        <span className="text-sm text-secondary">in stock</span>
        {isOutOfStock && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-fail/10 text-fail border border-fail/25">
            Out of stock
          </span>
        )}
        {isLowStock && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-warn/10 text-warn border border-warn/25">
            Low stock
          </span>
        )}
      </div>

      <form onSubmit={handleAdjust} className="space-y-2">
        <div className="flex gap-2">
          <input
            type="number"
            value={change}
            onChange={e => setChange(e.target.value)}
            placeholder="+5 or -2"
            className={`${inputCls} w-24`}
          />
          <select
            value={reason}
            onChange={e => setReason(e.target.value)}
            className={inputCls}
          >
            {REASONS.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <input
          type="text"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className={inputCls}
        />
        <button
          type="submit"
          disabled={loading || !change || parseInt(change, 10) === 0}
          className="px-4 py-2 text-sm font-medium border border-accent/25 text-accent rounded-md hover:bg-accent/10 transition-colors disabled:opacity-50"
        >
          {loading ? 'Updating...' : 'Adjust stock'}
        </button>
      </form>

      {error && <p className="text-sm text-fail">{error}</p>}
    </div>
  )
}
