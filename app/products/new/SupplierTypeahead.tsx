'use client'

import { useState, useEffect, useRef } from 'react'

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
        <div className="absolute z-10 mt-1 w-full bg-surface border border-edge rounded-md shadow-lg max-h-48 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-2 text-sm text-secondary">Searching...</div>
          ) : error ? (
            <div className="px-3 py-2 text-sm text-fail">{error}</div>
          ) : results.length === 0 ? (
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
        </div>
      )}
    </div>
  )
}
