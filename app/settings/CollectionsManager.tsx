'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'

interface Collection {
  id: string
  shopify_id: number | null
  handle: string
  title: string
  description: string | null
  collection_type: string
  sort_order: string | null
  display_order: number
  image_url: string | null
}

export default function CollectionsManager() {
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [creating, setCreating] = useState(false)

  const [editId, setEditId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editHandle, setEditHandle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  const fetchCollections = useCallback(async () => {
    try {
      const res = await fetch('/api/collections?all=1')
      if (!res.ok) throw new Error('Failed to load collections')
      const data = await res.json()
      setCollections(data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchCollections() }, [fetchCollections])

  async function handleCreate() {
    if (!newTitle.trim()) return
    setCreating(true); setError(null)
    try {
      const res = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, description: newDescription }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Create failed')
      setNewTitle(''); setNewDescription('')
      await fetchCollections()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setCreating(false) }
  }

  function startEdit(c: Collection) {
    setEditId(c.id)
    setEditTitle(c.title)
    setEditHandle(c.handle)
    setEditDescription(c.description || '')
  }

  async function handleSave() {
    if (!editId || !editTitle.trim()) return
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/collections/${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, handle: editHandle, description: editDescription }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed')
      setEditId(null)
      await fetchCollections()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this collection? Products stay but lose their assignment.')) return
    setDeletingId(id); setError(null)
    try {
      const res = await fetch(`/api/collections/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error || 'Delete failed')
      await fetchCollections()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setDeletingId(null) }
  }

  async function handleImageUpload(id: string, file: File) {
    setUploadingId(id); setError(null)
    try {
      const fd = new FormData()
      fd.append('image', file)
      const res = await fetch(`/api/collections/${id}/image`, { method: 'POST', body: fd })
      if (!res.ok) throw new Error((await res.json()).error || 'Upload failed')
      await fetchCollections()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setUploadingId(null) }
  }

  async function moveCollection(c: Collection, dir: -1 | 1) {
    const custom = collections.filter(x => x.collection_type === 'custom')
    const idx = custom.findIndex(x => x.id === c.id)
    const swapWith = custom[idx + dir]
    if (!swapWith) return
    const a = c.display_order ?? 0
    const b = swapWith.display_order ?? 0
    try {
      await Promise.all([
        fetch(`/api/collections/${c.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ display_order: b }),
        }),
        fetch(`/api/collections/${swapWith.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ display_order: a }),
        }),
      ])
      await fetchCollections()
    } catch (e) {
      setError(String(e))
    }
  }

  const inputCls = 'w-full bg-surface border border-edge rounded-md px-3 py-2 text-sm text-primary placeholder:text-secondary/50 focus:outline-none focus:border-accent'

  if (loading) return <p className="text-sm text-secondary">Loading collections...</p>

  const customCollections = collections.filter(c => c.collection_type === 'custom')
  const smartCollections = collections.filter(c => c.collection_type === 'smart')

  return (
    <div className="space-y-6 max-w-3xl">
      {error && (
        <div className="bg-fail/10 border border-fail/25 text-fail rounded-md px-4 py-3 text-sm">{error}</div>
      )}

      <div className="bg-surface border border-edge rounded-lg p-5 space-y-3">
        <h3 className="text-xs font-semibold text-accent uppercase tracking-wide">New Collection</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input className={inputCls} placeholder="Collection title" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
          <input className={inputCls} placeholder="Description (optional)" value={newDescription} onChange={e => setNewDescription(e.target.value)} />
        </div>
        <button
          onClick={handleCreate}
          disabled={creating || !newTitle.trim()}
          className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent-hi disabled:opacity-50 transition-colors"
        >
          {creating ? 'Creating...' : 'Create Collection'}
        </button>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-accent uppercase tracking-wide">
          Custom Collections ({customCollections.length})
        </h3>
        <div className="bg-surface border border-edge rounded-lg divide-y divide-edge">
          {customCollections.map((c, idx) => (
            <div key={c.id} className="px-4 py-3">
              {editId === c.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input className={inputCls} placeholder="Title" value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                    <input className={inputCls} placeholder="Handle (url slug)" value={editHandle} onChange={e => setEditHandle(e.target.value)} />
                  </div>
                  <textarea className={inputCls} placeholder="Description" rows={2} value={editDescription} onChange={e => setEditDescription(e.target.value)} />
                  <div className="flex gap-2">
                    <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 bg-accent text-white text-xs rounded-md hover:bg-accent-hi disabled:opacity-50">
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button onClick={() => setEditId(null)} className="px-3 py-1.5 text-secondary text-xs hover:text-primary">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {c.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.image_url} alt="" className="w-12 h-12 object-cover rounded border border-edge flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded border border-edge bg-overlay flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm text-primary font-medium truncate">{c.title}</p>
                      {c.description && <p className="text-xs text-secondary mt-0.5 truncate">{c.description}</p>}
                      <p className="text-xs text-secondary/60 mt-0.5 font-mono truncate">{c.handle}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => moveCollection(c, -1)}
                      disabled={idx === 0}
                      className="text-xs text-secondary hover:text-primary disabled:opacity-30"
                      aria-label="Move up"
                    >↑</button>
                    <button
                      onClick={() => moveCollection(c, 1)}
                      disabled={idx === customCollections.length - 1}
                      className="text-xs text-secondary hover:text-primary disabled:opacity-30"
                      aria-label="Move down"
                    >↓</button>
                    <input
                      ref={el => { fileInputs.current[c.id] = el }}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0]
                        if (f) handleImageUpload(c.id, f)
                        e.target.value = ''
                      }}
                    />
                    <button
                      onClick={() => fileInputs.current[c.id]?.click()}
                      disabled={uploadingId === c.id}
                      className="text-xs text-accent hover:text-accent-hi disabled:opacity-50"
                    >
                      {uploadingId === c.id ? 'Uploading...' : 'Image'}
                    </button>
                    <Link href={`/settings/collections/${c.id}`} className="text-xs text-accent hover:text-accent-hi">Products</Link>
                    <button onClick={() => startEdit(c)} className="text-xs text-accent hover:text-accent-hi">Edit</button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      disabled={deletingId === c.id}
                      className="text-xs text-fail/70 hover:text-fail disabled:opacity-50"
                    >
                      {deletingId === c.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {customCollections.length === 0 && (
            <p className="px-4 py-3 text-sm text-secondary">No custom collections</p>
          )}
        </div>
      </div>

      {smartCollections.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-accent uppercase tracking-wide">
            Smart Collections ({smartCollections.length})
          </h3>
          <p className="text-xs text-secondary">
            Smart collections auto-populate based on product rules. Managed via product type assignments.
          </p>
          <div className="bg-surface border border-edge rounded-lg divide-y divide-edge">
            {smartCollections.map(c => (
              <div key={c.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-primary font-medium">{c.title}</p>
                  {c.description && <p className="text-xs text-secondary mt-0.5">{c.description}</p>}
                  <p className="text-xs text-secondary/60 mt-0.5 font-mono">{c.handle}</p>
                </div>
                <span className="text-xs text-secondary bg-overlay px-2 py-0.5 rounded">Auto</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
