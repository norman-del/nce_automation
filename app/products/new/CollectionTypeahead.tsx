'use client'

import { useState, useEffect, useRef } from 'react'

interface Collection {
  id: string
  title: string
}

interface Props {
  value: Collection[]
  onChange: (collections: Collection[]) => void
}

export default function CollectionTypeahead({ value, onChange }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Collection[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const controller = new AbortController()
    setLoading(true)
    fetch(`/api/collections?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`Collection search failed (${r.status})`)
        return r.json()
      })
      .then((data) => {
        // Filter out already-selected collections
        const selectedIds = new Set(value.map((c) => c.id))
        setResults((data as Collection[]).filter((c) => !selectedIds.has(c.id)))
        setLoading(false)
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setLoading(false)
      })
    return () => controller.abort()
  }, [query, value])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function addCollection(c: Collection) {
    onChange([...value, c])
    setQuery('')
    setOpen(false)
  }

  function removeCollection(id: string) {
    onChange(value.filter((c) => c.id !== id))
  }

  return (
    <div ref={wrapperRef} className="space-y-2">
      {/* Selected chips */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1 bg-accent/10 text-accent text-xs font-medium px-2 py-1 rounded"
            >
              {c.title}
              <button
                type="button"
                onClick={() => removeCollection(c.id)}
                className="hover:text-fail"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search collections..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => query.trim() && setOpen(true)}
          className="w-full bg-surface border border-edge rounded-md px-3 py-2 text-primary placeholder:text-secondary/50 focus:outline-none focus:border-accent"
        />

        {open && query.trim() && (
          <div className="absolute z-10 mt-1 w-full bg-surface border border-edge rounded-md shadow-lg max-h-48 overflow-y-auto">
            {loading ? (
              <div className="px-3 py-2 text-sm text-secondary">Searching...</div>
            ) : results.length === 0 ? (
              <div className="px-3 py-2 text-sm text-secondary">No collections found</div>
            ) : (
              results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => addCollection(c)}
                  className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-overlay transition-colors"
                >
                  {c.title}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
