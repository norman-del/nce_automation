'use client'

import { useState, useEffect, useCallback } from 'react'

interface Member { id: string; sku: string; title: string }
interface SearchResult extends Member { in: boolean }

export default function CollectionProductsManager({ collectionId }: { collectionId: string }) {
  const [collection, setCollection] = useState<{ id: string; title: string } | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (query: string) => {
    const url = `/api/collections/${collectionId}/products${query ? `?q=${encodeURIComponent(query)}` : ''}`
    const res = await fetch(url)
    if (!res.ok) { setError('Failed to load'); return }
    const data = await res.json()
    setCollection(data.collection)
    setMembers(data.members)
    setSearchResults(data.searchResults)
    setLoading(false)
  }, [collectionId])

  useEffect(() => { load('') }, [load])

  useEffect(() => {
    const t = setTimeout(() => { if (q.length >= 2) load(q); else setSearchResults([]) }, 250)
    return () => clearTimeout(t)
  }, [q, load])

  async function toggle(productId: string, action: 'add' | 'remove') {
    setBusy(productId); setError(null)
    try {
      const res = await fetch(`/api/collections/${collectionId}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId, action }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed')
      await load(q)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(null) }
  }

  if (loading) return <p className="text-sm text-secondary">Loading...</p>
  if (!collection) return <p className="text-sm text-fail">Collection not found</p>

  const inputCls = 'w-full bg-surface border border-edge rounded-md px-3 py-2 text-sm text-primary placeholder:text-secondary/50 focus:outline-none focus:border-accent'

  return (
    <div className="space-y-6 max-w-3xl">
      {error && <div className="bg-fail/10 border border-fail/25 text-fail rounded-md px-4 py-3 text-sm">{error}</div>}

      <div className="bg-surface border border-edge rounded-lg p-5">
        <h3 className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">{collection.title}</h3>
        <p className="text-xs text-secondary">{members.length} products assigned</p>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-accent uppercase tracking-wide">Add Products</h3>
        <input
          className={inputCls}
          placeholder="Search products by SKU or title (min 2 chars)"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        {searchResults.length > 0 && (
          <div className="bg-surface border border-edge rounded-lg divide-y divide-edge">
            {searchResults.map(p => (
              <div key={p.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-primary truncate">{p.title}</p>
                  <p className="text-xs text-secondary font-mono">{p.sku}</p>
                </div>
                {p.in ? (
                  <button
                    onClick={() => toggle(p.id, 'remove')}
                    disabled={busy === p.id}
                    className="text-xs text-fail/70 hover:text-fail disabled:opacity-50 flex-shrink-0"
                  >Remove</button>
                ) : (
                  <button
                    onClick={() => toggle(p.id, 'add')}
                    disabled={busy === p.id}
                    className="px-3 py-1 bg-accent text-white text-xs rounded-md hover:bg-accent-hi disabled:opacity-50 flex-shrink-0"
                  >Add</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-accent uppercase tracking-wide">
          Assigned ({members.length})
        </h3>
        <div className="bg-surface border border-edge rounded-lg divide-y divide-edge max-h-[60vh] overflow-y-auto">
          {members.length === 0 ? (
            <p className="px-4 py-3 text-sm text-secondary">No products assigned yet.</p>
          ) : members.map(p => (
            <div key={p.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-primary truncate">{p.title}</p>
                <p className="text-xs text-secondary font-mono">{p.sku}</p>
              </div>
              <button
                onClick={() => toggle(p.id, 'remove')}
                disabled={busy === p.id}
                className="text-xs text-fail/70 hover:text-fail disabled:opacity-50 flex-shrink-0"
              >{busy === p.id ? '...' : 'Remove'}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
