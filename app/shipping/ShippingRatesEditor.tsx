'use client'

import { useState, useEffect, useCallback } from 'react'

interface Rate {
  id: string
  tier: number
  label: string
  rate_pence: number
  free_threshold_pence: number | null
  estimated_days: string
  active: boolean
}

export default function ShippingRatesEditor() {
  const [rates, setRates] = useState<Rate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const fetchRates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/shipping-rates')
      if (!res.ok) throw new Error('Failed to load')
      setRates(await res.json())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRates() }, [fetchRates])

  function updateRate(id: string, field: keyof Rate, value: unknown) {
    setRates(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)

    const res = await fetch('/api/shipping-rates', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rates: rates.map(r => ({
          id: r.id,
          label: r.label,
          rate_pence: r.rate_pence,
          free_threshold_pence: r.free_threshold_pence,
          estimated_days: r.estimated_days,
        })),
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Failed to save')
    } else {
      setSaved(true)
    }

    setSaving(false)
  }

  const inputCls = 'w-full bg-overlay border border-edge rounded-md px-3 py-2 text-sm text-primary focus:outline-none focus:border-accent transition-colors'

  if (loading) {
    return <div className="text-center py-16 text-secondary text-sm">Loading...</div>
  }

  return (
    <div className="space-y-6">
      {rates.map(rate => (
        <div key={rate.id} className="bg-surface border border-edge rounded-lg p-5">
          <div className="flex items-center gap-3 mb-4">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${
              rate.tier === 0 ? 'bg-ok/10 text-ok border-ok/25' :
              rate.tier === 1 ? 'bg-warn/10 text-warn border-warn/25' :
              'bg-fail/10 text-fail border-fail/25'
            }`}>
              Tier {rate.tier}
            </span>
            <span className="text-sm font-medium text-primary">{rate.label}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">Label</label>
              <input
                className={inputCls}
                value={rate.label}
                onChange={e => updateRate(rate.id, 'label', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">Rate (£)</label>
              <input
                className={inputCls}
                type="number"
                step="0.01"
                min="0"
                value={(rate.rate_pence / 100).toFixed(2)}
                onChange={e => updateRate(rate.id, 'rate_pence', Math.round(Number(e.target.value) * 100))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">Free above (£)</label>
              <input
                className={inputCls}
                type="number"
                step="1"
                min="0"
                value={rate.free_threshold_pence != null ? (rate.free_threshold_pence / 100).toFixed(0) : ''}
                onChange={e => {
                  const val = e.target.value
                  updateRate(rate.id, 'free_threshold_pence', val ? Math.round(Number(val) * 100) : null)
                }}
                placeholder="Never"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">Estimated delivery</label>
              <input
                className={inputCls}
                value={rate.estimated_days}
                onChange={e => updateRate(rate.id, 'estimated_days', e.target.value)}
              />
            </div>
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent-hi disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save rates'}
        </button>
        {saved && <span className="text-sm text-ok">Saved</span>}
        {error && <span className="text-sm text-fail">{error}</span>}
      </div>
    </div>
  )
}
