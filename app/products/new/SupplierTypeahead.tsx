'use client'

import { useState, useEffect, useRef, FormEvent } from 'react'

export interface QboVendor {
  id: string
  name: string
}

interface Props {
  value: QboVendor | null
  onChange: (vendor: QboVendor | null) => void
}

export default function SupplierTypeahead({ value, onChange }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<QboVendor[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetch(`/api/qbo/vendors?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`QBO vendor search failed (${r.status})`)
        return r.json()
      })
      .then((data) => {
        setResults(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch((e) => {
        if (e.name !== 'AbortError') {
          setError(e.message)
          setLoading(false)
        }
      })
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

  function handleCreated(vendor: QboVendor, warning: string | null) {
    onChange(vendor)
    setQuery('')
    setOpen(false)
    setShowAddModal(false)
    if (warning) setError(warning)
  }

  if (value) {
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
        placeholder="Search QBO suppliers..."
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => query.trim() && setOpen(true)}
        className="w-full bg-surface border border-edge rounded-md px-3 py-2 text-primary placeholder:text-secondary/50 focus:outline-none focus:border-accent"
      />

      {open && (query.trim()) && (
        <div className="absolute z-10 mt-1 w-full bg-surface border border-edge rounded-md shadow-lg max-h-64 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-2 text-sm text-secondary">Searching...</div>
          ) : error ? (
            <div className="px-3 py-2 text-sm text-fail">{error}</div>
          ) : (
            <>
              {results.length === 0 ? (
                <div className="px-3 py-2 text-sm text-secondary">No suppliers found</div>
              ) : (
                results.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => { onChange(v); setQuery(''); setOpen(false) }}
                    className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-overlay transition-colors"
                  >
                    <span className="font-medium">{v.name}</span>
                  </button>
                ))
              )}
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="w-full text-left px-3 py-2 text-sm text-accent hover:bg-overlay border-t border-edge transition-colors"
              >
                + Add new supplier &ldquo;{query.trim()}&rdquo;
              </button>
            </>
          )}
        </div>
      )}

      {showAddModal && (
        <AddSupplierModal
          initialName={query.trim()}
          onClose={() => setShowAddModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Inline new-supplier modal                                          */
/* ------------------------------------------------------------------ */

interface ModalProps {
  initialName: string
  onClose: () => void
  onCreated: (vendor: QboVendor, warning: string | null) => void
}

function AddSupplierModal({ initialName, onClose, onCreated }: ModalProps) {
  // Heuristic: if the typed query has a space and looks like a person's name
  // we still seed Company so the user can switch — keep it simple and seed
  // Company by default (most NCE suppliers are companies).
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [companyName, setCompanyName] = useState(initialName)
  const [displayNameOverride, setDisplayNameOverride] = useState('')
  const [phone, setPhone] = useState('')
  const [streetAddress, setStreetAddress] = useState('')
  const [city, setCity] = useState('')
  const [postcode, setPostcode] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Display name defaults: company if available, else "First Last"
  const computedDisplayName = (
    displayNameOverride.trim()
    || companyName.trim()
    || [firstName.trim(), lastName.trim()].filter(Boolean).join(' ')
  )

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!computedDisplayName) {
      setError('Provide a company name or first/last name.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          company_name: companyName,
          display_name: displayNameOverride || computedDisplayName,
          phone,
          address_line1: streetAddress,
          city,
          postcode,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`)

      const warning = data.sync_error
        ? `Supplier saved, but QBO push failed — product can still be saved without a QBO vendor link. (${data.sync_error})`
        : null

      onCreated(
        { id: data.qbo_vendor_id || '', name: data.name },
        warning
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  const inputCls = 'w-full bg-surface border border-edge rounded-md px-3 py-2 text-sm text-primary placeholder:text-secondary/50 focus:outline-none focus:border-accent'
  const labelCls = 'block text-xs font-medium text-secondary mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-bg border border-edge rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-primary">Add new supplier</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-secondary hover:text-primary text-sm"
            >
              ✕
            </button>
          </div>

          {error && (
            <div className="bg-fail/10 border border-fail/25 text-fail rounded-md px-3 py-2 text-sm">
              {error}
            </div>
          )}

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold text-accent uppercase tracking-wide">Name and contact</legend>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>First name</label>
                <input className={inputCls} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Last name</label>
                <input className={inputCls} value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Company name</label>
                <input className={inputCls} value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Supplier display name *</label>
                <input
                  className={inputCls}
                  placeholder={computedDisplayName || 'Auto'}
                  value={displayNameOverride}
                  onChange={(e) => setDisplayNameOverride(e.target.value)}
                />
                <p className="text-[11px] text-secondary/70 mt-1">
                  Defaults to company; falls back to first + last name.
                </p>
              </div>
            </div>

            <div>
              <label className={labelCls}>Phone number</label>
              <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold text-accent uppercase tracking-wide">Address</legend>
            <div>
              <label className={labelCls}>Street address</label>
              <textarea
                className={`${inputCls} resize-none`}
                rows={3}
                value={streetAddress}
                onChange={(e) => setStreetAddress(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>City</label>
                <input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Postcode</label>
                <input className={inputCls} value={postcode} onChange={(e) => setPostcode(e.target.value)} />
              </div>
            </div>
          </fieldset>

          <div className="flex items-center gap-3 border-t border-edge pt-4">
            <button
              type="submit"
              disabled={saving || !computedDisplayName}
              className="px-5 py-2.5 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent-hi disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save supplier'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-5 py-2.5 text-secondary text-sm rounded-md hover:text-primary hover:bg-overlay disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
