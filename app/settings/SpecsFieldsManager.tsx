'use client'

import { useState, useEffect, useCallback } from 'react'

type FieldType = 'text' | 'number' | 'boolean' | 'dimension' | 'select'

interface Definition {
  id: string
  key: string
  label: string
  field_type: FieldType
  unit: string | null
  options: string[] | null
  display_group: string | null
  sort_order: number
  required: boolean
}

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'dimension', label: 'Dimension (number)' },
  { value: 'boolean', label: 'Yes / No' },
  { value: 'select', label: 'Select (dropdown)' },
]

export default function SpecsFieldsManager() {
  const [defs, setDefs] = useState<Definition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newLabel, setNewLabel] = useState('')
  const [newType, setNewType] = useState<FieldType>('text')
  const [newUnit, setNewUnit] = useState('')
  const [newGroup, setNewGroup] = useState('')
  const [newOptions, setNewOptions] = useState('')
  const [creating, setCreating] = useState(false)

  const [editId, setEditId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Partial<Definition>>({})

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/metafield-definitions')
      if (!res.ok) throw new Error('Failed to load')
      setDefs(await res.json())
    } catch (e) {
      setError(String(e))
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate() {
    if (!newLabel.trim()) return
    setCreating(true); setError(null)
    try {
      const body: Record<string, unknown> = {
        label: newLabel,
        field_type: newType,
        unit: newUnit || null,
        display_group: newGroup || null,
      }
      if (newType === 'select') {
        body.options = newOptions.split(',').map(s => s.trim()).filter(Boolean)
      }
      const res = await fetch('/api/metafield-definitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Create failed')
      setNewLabel(''); setNewUnit(''); setNewGroup(''); setNewOptions(''); setNewType('text')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setCreating(false) }
  }

  async function handleSave(id: string) {
    setError(null)
    try {
      const res = await fetch(`/api/metafield-definitions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editDraft),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed')
      setEditId(null); setEditDraft({})
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this field? All product values using it will be removed.')) return
    setError(null)
    try {
      const res = await fetch(`/api/metafield-definitions/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error || 'Delete failed')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const inputCls = 'w-full bg-surface border border-edge rounded-md px-3 py-2 text-sm text-primary placeholder:text-secondary/50 focus:outline-none focus:border-accent'

  if (loading) return <p className="text-sm text-secondary">Loading...</p>

  const grouped = new Map<string, Definition[]>()
  for (const d of defs) {
    const key = d.display_group || '(Ungrouped)'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(d)
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {error && <div className="bg-fail/10 border border-fail/25 text-fail rounded-md px-4 py-3 text-sm">{error}</div>}

      <div className="bg-surface border border-edge rounded-lg p-5 space-y-3">
        <h3 className="text-xs font-semibold text-accent uppercase tracking-wide">New Spec Field</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input className={inputCls} placeholder="Label (e.g. Power Rating)" value={newLabel} onChange={e => setNewLabel(e.target.value)} />
          <select className={inputCls} value={newType} onChange={e => setNewType(e.target.value as FieldType)}>
            {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input className={inputCls} placeholder="Unit (e.g. kW, L, °C)" value={newUnit} onChange={e => setNewUnit(e.target.value)} />
          <input className={inputCls} placeholder="Display group (e.g. Electrical)" value={newGroup} onChange={e => setNewGroup(e.target.value)} />
          {newType === 'select' && (
            <input className={`${inputCls} sm:col-span-2`} placeholder="Options (comma separated)" value={newOptions} onChange={e => setNewOptions(e.target.value)} />
          )}
        </div>
        <button
          onClick={handleCreate}
          disabled={creating || !newLabel.trim()}
          className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent-hi disabled:opacity-50"
        >
          {creating ? 'Creating...' : 'Create Field'}
        </button>
      </div>

      {Array.from(grouped.entries()).map(([group, items]) => (
        <div key={group} className="space-y-2">
          <h3 className="text-xs font-semibold text-accent uppercase tracking-wide">{group} ({items.length})</h3>
          <div className="bg-surface border border-edge rounded-lg divide-y divide-edge">
            {items.map(d => (
              <div key={d.id} className="px-4 py-3">
                {editId === d.id ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input className={inputCls} placeholder="Label" value={editDraft.label ?? d.label} onChange={e => setEditDraft({ ...editDraft, label: e.target.value })} />
                      <input className={inputCls} placeholder="Unit" value={editDraft.unit ?? d.unit ?? ''} onChange={e => setEditDraft({ ...editDraft, unit: e.target.value })} />
                      <input className={inputCls} placeholder="Display group" value={editDraft.display_group ?? d.display_group ?? ''} onChange={e => setEditDraft({ ...editDraft, display_group: e.target.value })} />
                      <input className={inputCls} type="number" placeholder="Sort order" value={editDraft.sort_order ?? d.sort_order} onChange={e => setEditDraft({ ...editDraft, sort_order: Number(e.target.value) })} />
                    </div>
                    <label className="flex items-center gap-2 text-xs text-secondary">
                      <input type="checkbox" checked={editDraft.required ?? d.required} onChange={e => setEditDraft({ ...editDraft, required: e.target.checked })} />
                      Required
                    </label>
                    <div className="flex gap-2">
                      <button onClick={() => handleSave(d.id)} className="px-3 py-1.5 bg-accent text-white text-xs rounded-md hover:bg-accent-hi">Save</button>
                      <button onClick={() => { setEditId(null); setEditDraft({}) }} className="px-3 py-1.5 text-secondary text-xs hover:text-primary">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-primary font-medium">{d.label}{d.required && <span className="text-fail ml-1">*</span>}</p>
                      <p className="text-xs text-secondary font-mono">{d.key} · {d.field_type}{d.unit && ` · ${d.unit}`}</p>
                      {d.field_type === 'select' && d.options && (
                        <p className="text-xs text-secondary/60 truncate">Options: {d.options.join(', ')}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => { setEditId(d.id); setEditDraft({}) }} className="text-xs text-accent hover:text-accent-hi">Edit</button>
                      <button onClick={() => handleDelete(d.id)} className="text-xs text-fail/70 hover:text-fail">Delete</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {defs.length === 0 && (
        <p className="text-sm text-secondary">No spec fields defined yet. Create your first above.</p>
      )}
    </div>
  )
}
