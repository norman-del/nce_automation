'use client'

import { useState, useEffect, useCallback } from 'react'

interface Promotion {
  id: string
  code: string
  active: boolean
  timesRedeemed: number
  maxRedemptions: number | null
  expiresAt: string | null
  coupon: {
    percentOff: number | null
    amountOff: number | null
    currency: string | null
    duration: string | null
  } | null
  created: string
}

export default function PromotionsList() {
  const [promos, setPromos] = useState<Promotion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create form
  const [showForm, setShowForm] = useState(false)
  const [code, setCode] = useState('')
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent')
  const [percentOff, setPercentOff] = useState('')
  const [amountOff, setAmountOff] = useState('')
  const [maxRedemptions, setMaxRedemptions] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const fetchPromos = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/promotions')
      if (!res.ok) throw new Error('Failed to load')
      setPromos(await res.json())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPromos() }, [fetchPromos])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setCreateError(null)

    const body: Record<string, unknown> = { code }
    if (discountType === 'percent') {
      body.percent_off = parseFloat(percentOff)
    } else {
      body.amount_off = parseFloat(amountOff)
    }
    if (maxRedemptions) body.max_redemptions = parseInt(maxRedemptions, 10)
    if (expiresAt) body.expires_at = expiresAt

    const res = await fetch('/api/promotions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const data = await res.json()
      setCreateError(data.error ?? 'Failed to create')
      setCreating(false)
      return
    }

    setCode('')
    setPercentOff('')
    setAmountOff('')
    setMaxRedemptions('')
    setExpiresAt('')
    setShowForm(false)
    setCreating(false)
    fetchPromos()
  }

  function formatDiscount(p: Promotion): string {
    if (!p.coupon) return '—'
    if (p.coupon.percentOff) return `${p.coupon.percentOff}% off`
    if (p.coupon.amountOff) return `£${(p.coupon.amountOff / 100).toFixed(2)} off`
    return '—'
  }

  const inputCls = 'w-full bg-overlay border border-edge rounded-md px-3 py-2 text-sm text-primary placeholder:text-secondary focus:outline-none focus:border-accent transition-colors'

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-md hover:bg-accent-hi transition-colors"
        >
          {showForm ? 'Cancel' : 'New promo code'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="bg-surface border border-edge rounded-lg p-5 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">Code *</label>
              <input
                className={inputCls}
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="e.g. SUMMER20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">Discount type</label>
              <select className={inputCls} value={discountType} onChange={e => setDiscountType(e.target.value as 'percent' | 'amount')}>
                <option value="percent">Percentage</option>
                <option value="amount">Fixed amount</option>
              </select>
            </div>
            {discountType === 'percent' ? (
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Percent off *</label>
                <input className={inputCls} type="number" min="1" max="100" value={percentOff} onChange={e => setPercentOff(e.target.value)} placeholder="20" />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Amount off (£) *</label>
                <input className={inputCls} type="number" min="0.01" step="0.01" value={amountOff} onChange={e => setAmountOff(e.target.value)} placeholder="10.00" />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">Max uses</label>
              <input className={inputCls} type="number" min="1" value={maxRedemptions} onChange={e => setMaxRedemptions(e.target.value)} placeholder="Unlimited" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">Expires</label>
              <input className={inputCls} type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={creating || !code.trim()}
                className="px-5 py-2 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent-hi disabled:opacity-50 transition-colors"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
          {createError && <p className="text-sm text-fail">{createError}</p>}
        </form>
      )}

      {/* List */}
      {loading ? (
        <div className="text-center py-16 text-secondary text-sm">Loading...</div>
      ) : error ? (
        <div className="bg-fail/10 border border-fail/25 text-fail rounded-md px-4 py-3 text-sm">{error}</div>
      ) : promos.length === 0 ? (
        <div className="text-center py-16 text-secondary text-sm">
          No active promotion codes. Create one above.
        </div>
      ) : (
        <div className="bg-surface border border-edge rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-overlay border-b border-edge">
                <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wide">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wide">Discount</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-secondary uppercase tracking-wide">Used</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wide">Expires</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wide">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {promos.map(p => (
                <tr key={p.id} className="hover:bg-overlay transition-colors">
                  <td className="px-4 py-3 font-mono text-primary font-medium">{p.code}</td>
                  <td className="px-4 py-3 text-primary">{formatDiscount(p)}</td>
                  <td className="px-4 py-3 text-right text-secondary">
                    {p.timesRedeemed}{p.maxRedemptions ? ` / ${p.maxRedemptions}` : ''}
                  </td>
                  <td className="px-4 py-3 text-secondary text-xs">
                    {p.expiresAt
                      ? new Date(p.expiresAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                      : 'Never'}
                  </td>
                  <td className="px-4 py-3 text-secondary text-xs">
                    {new Date(p.created).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
