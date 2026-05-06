'use client'

// Admin: vendor logo bank — upload / replace / clear logos per brand.
// Edit the display name and aliases inline. Strategic-only feature.

import { useEffect, useRef, useState } from 'react'

interface Brand {
  handle: string
  name: string
  aliases: string[]
  logo_url: string | null
  content_type: string | null
  updated_at: string
}

export default function BrandLogosManager() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null) // handle currently uploading

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/vendor-logos')
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Load failed')
      setBrands(data.brands)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  async function uploadLogo(handle: string, file: File) {
    setBusy(handle)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/vendor-logos/${handle}`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Upload failed')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function clearLogo(handle: string) {
    if (!confirm('Remove this logo? Products using this brand will lose the logo until a new one is uploaded.')) return
    setBusy(handle)
    setError(null)
    try {
      const res = await fetch(`/api/vendor-logos/${handle}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Delete failed')
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function saveAliases(handle: string, name: string, aliases: string[]) {
    setBusy(handle)
    setError(null)
    try {
      const res = await fetch(`/api/vendor-logos/${handle}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, aliases }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Save failed')
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <p className="text-sm text-secondary">Loading brands…</p>

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-primary">Brand logos</h3>
        <p className="text-sm text-secondary mt-1">
          Upload a logo per brand. When staff create or edit a product, the matching logo is auto-attached based on the vendor name.
          Aliases let you match the same brand under different spellings (e.g. <code>blue seal</code> + <code>blueseal</code>).
        </p>
      </div>
      {error && (
        <div className="bg-fail/10 border border-fail/25 text-fail rounded-md px-3 py-2 text-sm">{error}</div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {brands.map((b) => (
          <BrandRow
            key={b.handle}
            brand={b}
            busy={busy === b.handle}
            onUpload={(file) => uploadLogo(b.handle, file)}
            onClear={() => clearLogo(b.handle)}
            onSave={(name, aliases) => saveAliases(b.handle, name, aliases)}
          />
        ))}
      </div>
    </div>
  )
}

function BrandRow({
  brand,
  busy,
  onUpload,
  onClear,
  onSave,
}: {
  brand: Brand
  busy: boolean
  onUpload: (file: File) => void
  onClear: () => void
  onSave: (name: string, aliases: string[]) => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(brand.name)
  const [aliasesText, setAliasesText] = useState(brand.aliases.join(', '))

  return (
    <div className="bg-surface border border-edge rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-20 h-12 flex-shrink-0 bg-overlay rounded border border-edge flex items-center justify-center overflow-hidden">
          {brand.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL, not a Next-optimised asset
            <img src={brand.logo_url} alt={`${brand.name} logo`} className="max-h-10 max-w-[72px] object-contain" />
          ) : (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-secondary">No logo</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-primary truncate">{brand.name}</p>
          <p className="text-xs text-secondary truncate" title={brand.aliases.join(', ')}>
            {brand.aliases.length} alias{brand.aliases.length === 1 ? '' : 'es'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          ref={fileInput}
          type="file"
          accept="image/svg+xml,image/png,image/webp,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onUpload(f)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-md hover:bg-accent-hi disabled:opacity-50"
        >
          {busy ? 'Working…' : brand.logo_url ? 'Replace' : 'Upload'}
        </button>
        {brand.logo_url && (
          <button
            type="button"
            onClick={onClear}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-medium border border-edge text-secondary rounded-md hover:text-primary hover:border-primary/40 disabled:opacity-50"
          >
            Clear
          </button>
        )}
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          disabled={busy}
          className="px-3 py-1.5 text-xs font-medium border border-edge text-secondary rounded-md hover:text-primary hover:border-primary/40 disabled:opacity-50"
        >
          {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {editing && (
        <div className="space-y-2 border-t border-edge pt-3">
          <div>
            <label className="block text-xs font-medium text-secondary mb-1">Display name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-canvas border border-edge rounded-md px-3 py-2 text-sm text-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-secondary mb-1">Aliases (comma-separated, lowercase)</label>
            <input
              value={aliasesText}
              onChange={(e) => setAliasesText(e.target.value)}
              placeholder="e.g. blue seal, blueseal"
              className="w-full bg-canvas border border-edge rounded-md px-3 py-2 text-sm text-primary"
            />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const aliases = aliasesText
                .split(',')
                .map((s) => s.toLowerCase().trim())
                .filter(Boolean)
              onSave(name.trim() || brand.name, aliases)
              setEditing(false)
            }}
            className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-md hover:bg-accent-hi disabled:opacity-50"
          >
            Save
          </button>
        </div>
      )}
    </div>
  )
}

