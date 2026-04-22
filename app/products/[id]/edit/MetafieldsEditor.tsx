'use client'

import { useState, useEffect, useCallback } from 'react'

type FieldType = 'text' | 'number' | 'boolean' | 'dimension' | 'select'

interface MetafieldRow {
  id: string
  key: string
  label: string
  field_type: FieldType
  unit: string | null
  options: string[] | null
  display_group: string | null
  sort_order: number
  required: boolean
  value_text: string | null
  value_number: number | null
  value_boolean: boolean | null
}

export default function MetafieldsEditor({ productId }: { productId: string }) {
  const [rows, setRows] = useState<MetafieldRow[]>([])
  const [loading, setLoading] = useState(true)
  const [values, setValues] = useState<Record<string, string | boolean>>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/products/${productId}/metafields`)
      if (!res.ok) throw new Error('Failed to load')
      const data: MetafieldRow[] = await res.json()
      setRows(data)
      const v: Record<string, string | boolean> = {}
      for (const r of data) {
        if (r.field_type === 'boolean') v[r.id] = r.value_boolean ?? false
        else if (r.field_type === 'number' || r.field_type === 'dimension') {
          v[r.id] = r.value_number !== null ? String(r.value_number) : ''
        } else {
          v[r.id] = r.value_text ?? ''
        }
      }
      setValues(v)
    } catch (e) {
      setError(String(e))
    } finally { setLoading(false) }
  }, [productId])

  useEffect(() => { load() }, [load])

  async function handleSave() {
    setSaving(true); setMessage(null); setError(null)
    try {
      const payload = rows.map(r => ({
        definition_id: r.id,
        value: values[r.id] ?? null,
      }))
      const res = await fetch(`/api/products/${productId}/metafields`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: payload }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed')
      const json = await res.json()
      setMessage(`Saved ${json.saved} field${json.saved === 1 ? '' : 's'}`)
      setTimeout(() => setMessage(null), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }

  if (loading) return <p className="text-sm text-secondary">Loading specs...</p>
  if (rows.length === 0) {
    return (
      <p className="text-sm text-secondary">
        No spec fields defined. Admins can add fields in Settings → Specs Fields.
      </p>
    )
  }

  const groups = new Map<string, MetafieldRow[]>()
  for (const r of rows) {
    const g = r.display_group || 'General'
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g)!.push(r)
  }

  const inputCls = 'w-full bg-surface border border-edge rounded-md px-3 py-2 text-sm text-primary placeholder:text-secondary/50 focus:outline-none focus:border-accent'

  return (
    <div className="space-y-5">
      {error && <div className="bg-fail/10 border border-fail/25 text-fail rounded-md px-3 py-2 text-sm">{error}</div>}
      {message && <div className="bg-ok/10 border border-ok/25 text-ok rounded-md px-3 py-2 text-sm">{message}</div>}

      {Array.from(groups.entries()).map(([group, items]) => (
        <div key={group} className="space-y-2">
          <h4 className="text-xs font-semibold text-secondary uppercase tracking-wide">{group}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {items.map(r => (
              <div key={r.id} className="space-y-1">
                <label className="text-xs text-secondary">
                  {r.label}{r.required && <span className="text-fail ml-0.5">*</span>}
                  {r.unit && <span className="text-secondary/60 ml-1">({r.unit})</span>}
                </label>
                {r.field_type === 'boolean' ? (
                  <label className="flex items-center gap-2 text-sm text-primary">
                    <input
                      type="checkbox"
                      checked={Boolean(values[r.id])}
                      onChange={e => setValues({ ...values, [r.id]: e.target.checked })}
                    />
                    Yes
                  </label>
                ) : r.field_type === 'select' ? (
                  <select
                    className={inputCls}
                    value={String(values[r.id] ?? '')}
                    onChange={e => setValues({ ...values, [r.id]: e.target.value })}
                  >
                    <option value="">—</option>
                    {(r.options ?? []).map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={r.field_type === 'number' || r.field_type === 'dimension' ? 'number' : 'text'}
                    step={r.field_type === 'dimension' ? '0.01' : undefined}
                    className={inputCls}
                    value={String(values[r.id] ?? '')}
                    onChange={e => setValues({ ...values, [r.id]: e.target.value })}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent-hi disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Specs'}
      </button>
    </div>
  )
}
