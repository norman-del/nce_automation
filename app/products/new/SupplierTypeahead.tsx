'use client'

import { useState, useEffect, useRef } from 'react'

export interface Supplier {
  id: string
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  county: string | null
  postcode: string | null
}

interface Props {
  value: Supplier | null
  onChange: (supplier: Supplier | null) => void
}

const emptyNew: Omit<Supplier, 'id'> = {
  name: '', contact_name: null, phone: null, email: null,
  address_line1: null, address_line2: null, city: null, county: null, postcode: null,
}

export default function SupplierTypeahead({ value, onChange }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Supplier[]>([])
  const [open, setOpen] = useState(false)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newSupplier, setNewSupplier] = useState(emptyNew)
  const [saving, setSaving] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const controller = new AbortController()
    fetch(`/api/suppliers?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => setResults(Array.isArray(data) ? data : []))
      .catch(() => {})
    return () => controller.abort()
  }, [query])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleCreateSupplier() {
    if (!newSupplier.name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSupplier),
      })
      if (!res.ok) throw new Error('Failed to create supplier')
      const created: Supplier = await res.json()
      onChange(created)
      setShowNewForm(false)
      setNewSupplier(emptyNew)
      setQuery('')
      setOpen(false)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  if (value && !showNewForm) {
    return (
      <div className="flex items-center gap-2 bg-surface border border-edge rounded-md px-3 py-2">
        <span className="text-primary flex-1">{value.name}</span>
        <button
          type="button"
          onClick={() => { onChange(null); setQuery('') }}
          className="text-xs text-secondary hover:text-fail"
        >
          Clear
        </button>
      </div>
    )
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        placeholder="Search suppliers..."
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => query.trim() && setOpen(true)}
        className="w-full bg-surface border border-edge rounded-md px-3 py-2 text-primary placeholder:text-secondary/50 focus:outline-none focus:border-accent"
      />

      {open && (results.length > 0 || query.trim()) && (
        <div className="absolute z-10 mt-1 w-full bg-surface border border-edge rounded-md shadow-lg max-h-48 overflow-y-auto">
          {results.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { onChange(s); setQuery(''); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-overlay transition-colors"
            >
              <span className="font-medium">{s.name}</span>
              {s.contact_name && (
                <span className="text-secondary ml-2">({s.contact_name})</span>
              )}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setNewSupplier({ ...emptyNew, name: query.trim() })
              setShowNewForm(true)
              setOpen(false)
            }}
            className="w-full text-left px-3 py-2 text-sm text-accent hover:bg-overlay transition-colors border-t border-edge"
          >
            + Add new supplier{query.trim() ? `: "${query.trim()}"` : ''}
          </button>
        </div>
      )}

      {showNewForm && (
        <div className="mt-3 bg-overlay border border-edge rounded-md p-4 space-y-3">
          <h4 className="text-sm font-medium text-primary">New Supplier</h4>
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Name *" value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} className="col-span-2 bg-surface border border-edge rounded-md px-3 py-2 text-sm text-primary placeholder:text-secondary/50 focus:outline-none focus:border-accent" />
            <input placeholder="Contact name" value={newSupplier.contact_name || ''} onChange={(e) => setNewSupplier({ ...newSupplier, contact_name: e.target.value })} className="bg-surface border border-edge rounded-md px-3 py-2 text-sm text-primary placeholder:text-secondary/50 focus:outline-none focus:border-accent" />
            <input placeholder="Phone" value={newSupplier.phone || ''} onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })} className="bg-surface border border-edge rounded-md px-3 py-2 text-sm text-primary placeholder:text-secondary/50 focus:outline-none focus:border-accent" />
            <input placeholder="Email" value={newSupplier.email || ''} onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })} className="col-span-2 bg-surface border border-edge rounded-md px-3 py-2 text-sm text-primary placeholder:text-secondary/50 focus:outline-none focus:border-accent" />
            <input placeholder="Address line 1" value={newSupplier.address_line1 || ''} onChange={(e) => setNewSupplier({ ...newSupplier, address_line1: e.target.value })} className="col-span-2 bg-surface border border-edge rounded-md px-3 py-2 text-sm text-primary placeholder:text-secondary/50 focus:outline-none focus:border-accent" />
            <input placeholder="Address line 2" value={newSupplier.address_line2 || ''} onChange={(e) => setNewSupplier({ ...newSupplier, address_line2: e.target.value })} className="col-span-2 bg-surface border border-edge rounded-md px-3 py-2 text-sm text-primary placeholder:text-secondary/50 focus:outline-none focus:border-accent" />
            <input placeholder="City" value={newSupplier.city || ''} onChange={(e) => setNewSupplier({ ...newSupplier, city: e.target.value })} className="bg-surface border border-edge rounded-md px-3 py-2 text-sm text-primary placeholder:text-secondary/50 focus:outline-none focus:border-accent" />
            <input placeholder="County" value={newSupplier.county || ''} onChange={(e) => setNewSupplier({ ...newSupplier, county: e.target.value })} className="bg-surface border border-edge rounded-md px-3 py-2 text-sm text-primary placeholder:text-secondary/50 focus:outline-none focus:border-accent" />
            <input placeholder="Postcode" value={newSupplier.postcode || ''} onChange={(e) => setNewSupplier({ ...newSupplier, postcode: e.target.value })} className="bg-surface border border-edge rounded-md px-3 py-2 text-sm text-primary placeholder:text-secondary/50 focus:outline-none focus:border-accent" />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => { setShowNewForm(false); setNewSupplier(emptyNew) }} className="px-3 py-1.5 text-sm text-secondary hover:text-primary">Cancel</button>
            <button type="button" onClick={handleCreateSupplier} disabled={saving || !newSupplier.name.trim()} className="px-3 py-1.5 text-sm bg-accent text-white rounded-md hover:bg-accent-hi disabled:opacity-50">
              {saving ? 'Saving...' : 'Create Supplier'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
