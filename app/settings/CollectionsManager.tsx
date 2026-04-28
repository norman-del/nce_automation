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
  intro_html: string | null
  featured_image_url: string | null
  parent_handle: string | null
  meta_title: string | null
  meta_description: string | null
  archived_at: string | null
}

type EditState = {
  title: string
  handle: string
  description: string
  intro_html: string
  parent_handle: string
  meta_title: string
  meta_description: string
}

const emptyEdit: EditState = {
  title: '',
  handle: '',
  description: '',
  intro_html: '',
  parent_handle: '',
  meta_title: '',
  meta_description: '',
}

export default function CollectionsManager() {
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState<EditState>(emptyEdit)
  const [showCreate, setShowCreate] = useState(false)

  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditState>(emptyEdit)
  const [saving, setSaving] = useState(false)

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})
  const featuredInputs = useRef<Record<string, HTMLInputElement | null>>({})

  const fetchCollections = useCallback(async () => {
    try {
      const url = showArchived ? '/api/collections?all=1&include_archived=1' : '/api/collections?all=1'
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to load collections')
      const data = await res.json()
      setCollections(data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [showArchived])

  useEffect(() => { fetchCollections() }, [fetchCollections])

  async function handleCreate() {
    if (!createForm.title.trim()) return
    setCreating(true); setError(null)
    try {
      const res = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: createForm.title,
          handle: createForm.handle || undefined,
          description: createForm.description,
          intro_html: createForm.intro_html,
          parent_handle: createForm.parent_handle || null,
          meta_title: createForm.meta_title,
          meta_description: createForm.meta_description,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Create failed')
      setCreateForm(emptyEdit)
      setShowCreate(false)
      await fetchCollections()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setCreating(false) }
  }

  function startEdit(c: Collection) {
    setEditId(c.id)
    setEditForm({
      title: c.title,
      handle: c.handle,
      description: c.description || '',
      intro_html: c.intro_html || '',
      parent_handle: c.parent_handle || '',
      meta_title: c.meta_title || '',
      meta_description: c.meta_description || '',
    })
  }

  async function handleSave() {
    if (!editId || !editForm.title.trim()) return
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/collections/${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editForm.title,
          handle: editForm.handle,
          description: editForm.description,
          intro_html: editForm.intro_html,
          parent_handle: editForm.parent_handle || null,
          meta_title: editForm.meta_title,
          meta_description: editForm.meta_description,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed')
      setEditId(null)
      await fetchCollections()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }

  async function handleDelete(c: Collection) {
    const verb = c.archived_at ? 'restore' : 'archive'
    const msg = c.archived_at
      ? 'Restore this collection? It will reappear on the storefront.'
      : 'Archive this collection? It is hidden from the storefront but data is preserved.'
    if (!confirm(msg)) return
    setDeletingId(c.id); setError(null)
    try {
      if (c.archived_at) {
        const res = await fetch(`/api/collections/${c.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived_at: null }),
        })
        if (!res.ok) throw new Error((await res.json()).error || `${verb} failed`)
      } else {
        const res = await fetch(`/api/collections/${c.id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error((await res.json()).error || `${verb} failed`)
      }
      await fetchCollections()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setDeletingId(null) }
  }

  async function handleImageUpload(id: string, file: File, slot: 'cover' | 'featured') {
    setUploadingId(`${id}:${slot}`); setError(null)
    try {
      const fd = new FormData()
      fd.append('image', file)
      const res = await fetch(`/api/collections/${id}/image?slot=${slot}`, { method: 'POST', body: fd })
      if (!res.ok) throw new Error((await res.json()).error || 'Upload failed')
      await fetchCollections()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setUploadingId(null) }
  }

  async function moveCollection(c: Collection, dir: -1 | 1) {
    const custom = collections.filter(x => x.collection_type === 'custom' && !x.archived_at)
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

  const liveCollections = collections.filter(c => !c.archived_at)
  const archivedCollections = collections.filter(c => c.archived_at)
  const customCollections = liveCollections.filter(c => c.collection_type === 'custom')
  const smartCollections = liveCollections.filter(c => c.collection_type === 'smart')
  const parentOptions = liveCollections.map(c => c.handle).filter(h => !!h)

  function renderEditPanel(formState: EditState, setForm: (s: EditState) => void) {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input className={inputCls} placeholder="Title" value={formState.title} onChange={e => setForm({ ...formState, title: e.target.value })} />
          <input className={inputCls} placeholder="Handle (url slug)" value={formState.handle} onChange={e => setForm({ ...formState, handle: e.target.value })} />
        </div>
        <textarea className={inputCls} placeholder="Short description (sidebar / cards)" rows={2} value={formState.description} onChange={e => setForm({ ...formState, description: e.target.value })} />
        <textarea className={inputCls} placeholder="Intro HTML — rendered above the product grid (markdown allowed)" rows={4} value={formState.intro_html} onChange={e => setForm({ ...formState, intro_html: e.target.value })} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select className={inputCls} value={formState.parent_handle} onChange={e => setForm({ ...formState, parent_handle: e.target.value })}>
            <option value="">No parent collection (top level)</option>
            {parentOptions.filter(h => h !== formState.handle).map(h => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
          <input className={inputCls} placeholder="SEO title (defaults to title)" value={formState.meta_title} onChange={e => setForm({ ...formState, meta_title: e.target.value })} />
        </div>
        <textarea className={inputCls} placeholder="SEO meta description" rows={2} value={formState.meta_description} onChange={e => setForm({ ...formState, meta_description: e.target.value })} />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {error && (
        <div className="bg-fail/10 border border-fail/25 text-fail rounded-md px-4 py-3 text-sm">{error}</div>
      )}

      {/* New collection */}
      {!showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent-hi transition-colors"
        >
          + New collection
        </button>
      ) : (
        <div className="bg-surface border border-edge rounded-lg p-5 space-y-3">
          <h3 className="text-xs font-semibold text-accent uppercase tracking-wide">New Collection</h3>
          {renderEditPanel(createForm, setCreateForm)}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleCreate}
              disabled={creating || !createForm.title.trim()}
              className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent-hi disabled:opacity-50 transition-colors"
            >
              {creating ? 'Creating...' : 'Create Collection'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setCreateForm(emptyEdit) }}
              className="px-3 py-2 text-secondary text-sm hover:text-primary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-accent uppercase tracking-wide">
            Custom Collections ({customCollections.length})
          </h3>
          <label className="text-xs text-secondary flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
            Show archived ({archivedCollections.length})
          </label>
        </div>
        <div className="bg-surface border border-edge rounded-lg divide-y divide-edge">
          {customCollections.map((c, idx) => (
            <div key={c.id} className="px-4 py-3">
              {editId === c.id ? (
                <div className="space-y-3">
                  {renderEditPanel(editForm, setEditForm)}
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
                      <p className="text-xs text-secondary/60 mt-0.5 font-mono truncate">
                        {c.handle}{c.parent_handle ? ` ← ${c.parent_handle}` : ''}
                      </p>
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
                        if (f) handleImageUpload(c.id, f, 'cover')
                        e.target.value = ''
                      }}
                    />
                    <button
                      onClick={() => fileInputs.current[c.id]?.click()}
                      disabled={uploadingId === `${c.id}:cover`}
                      className="text-xs text-accent hover:text-accent-hi disabled:opacity-50"
                    >
                      {uploadingId === `${c.id}:cover` ? '…' : 'Cover'}
                    </button>
                    <input
                      ref={el => { featuredInputs.current[c.id] = el }}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0]
                        if (f) handleImageUpload(c.id, f, 'featured')
                        e.target.value = ''
                      }}
                    />
                    <button
                      onClick={() => featuredInputs.current[c.id]?.click()}
                      disabled={uploadingId === `${c.id}:featured`}
                      className="text-xs text-accent hover:text-accent-hi disabled:opacity-50"
                      title="Hero image used on homepage tile + collection page header"
                    >
                      {uploadingId === `${c.id}:featured` ? '…' : 'Hero'}
                    </button>
                    <Link href={`/settings/collections/${c.id}`} className="text-xs text-accent hover:text-accent-hi">Products</Link>
                    <button onClick={() => startEdit(c)} className="text-xs text-accent hover:text-accent-hi">Edit</button>
                    <button
                      onClick={() => handleDelete(c)}
                      disabled={deletingId === c.id}
                      className="text-xs text-fail/70 hover:text-fail disabled:opacity-50"
                    >
                      {deletingId === c.id ? '…' : 'Archive'}
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

      {showArchived && archivedCollections.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-secondary uppercase tracking-wide">
            Archived ({archivedCollections.length})
          </h3>
          <div className="bg-surface/60 border border-edge rounded-lg divide-y divide-edge">
            {archivedCollections.map(c => (
              <div key={c.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-primary font-medium truncate">{c.title}</p>
                  <p className="text-xs text-secondary/60 mt-0.5 font-mono truncate">{c.handle}</p>
                </div>
                <button
                  onClick={() => handleDelete(c)}
                  disabled={deletingId === c.id}
                  className="text-xs text-accent hover:text-accent-hi disabled:opacity-50"
                >
                  {deletingId === c.id ? '…' : 'Restore'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
