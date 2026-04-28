'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface GalleryImage {
  shopifyImageId: number
  src: string
  fileName: string
  altText: string | null
  position: number
}

interface Props {
  productId: string
  initial: GalleryImage[]
}

export default function PhotoGallery({ productId, initial }: Props) {
  const router = useRouter()
  const [images, setImages] = useState<GalleryImage[]>(initial)
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (images.length === 0) return null

  async function persistOrder(next: GalleryImage[]) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/products/${productId}/images/order`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: next.map((i) => i.shopifyImageId) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Reorder failed (${res.status})`)
      if (data.errors?.length) {
        setError(`Some images failed to reorder on Shopify: ${data.errors.join(', ')}`)
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  function onDragStart(idx: number) {
    setDraggingIdx(idx)
  }
  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    setOverIdx(idx)
  }
  function onDrop(idx: number) {
    if (draggingIdx === null) return
    const reordered = [...images]
    const [item] = reordered.splice(draggingIdx, 1)
    reordered.splice(idx, 0, item)
    setImages(reordered)
    setDraggingIdx(null)
    setOverIdx(null)
    void persistOrder(reordered)
  }
  function onDragEnd() {
    setDraggingIdx(null)
    setOverIdx(null)
  }

  async function persistAltText(idx: number, value: string) {
    const img = images[idx]
    const trimmed = value.trim()
    const next = trimmed === '' ? null : trimmed
    // Don't fire a request if nothing changed.
    if ((img.altText ?? null) === next) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/products/${productId}/images/${img.shopifyImageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alt_text: next }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Save failed (${res.status})`)
      }
      setImages((prev) => prev.map((p, i) => (i === idx ? { ...p, altText: next } : p)))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(idx: number) {
    const img = images[idx]
    if (!confirm(`Delete "${img.fileName}"? This removes it from Shopify too.`)) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/products/${productId}/images/${img.shopifyImageId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Delete failed (${res.status})`)
      }
      setImages((prev) => prev.filter((_, i) => i !== idx))
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-secondary">
          Drag to reorder. The first image is the storefront cover.
        </p>
        {saving && <span className="text-xs text-secondary">Saving…</span>}
      </div>

      {error && (
        <div className="bg-fail/10 border border-fail/25 text-fail rounded-md px-3 py-2 text-xs">{error}</div>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {images.map((img, idx) => {
          const isCover = idx === 0
          const isDragging = draggingIdx === idx
          const isOver = overIdx === idx && draggingIdx !== idx
          return (
            <div
              key={img.shopifyImageId}
              draggable
              onDragStart={() => onDragStart(idx)}
              onDragOver={(e) => onDragOver(e, idx)}
              onDrop={() => onDrop(idx)}
              onDragEnd={onDragEnd}
              className={`relative group bg-overlay border rounded-md overflow-hidden cursor-move transition-all ${
                isDragging ? 'opacity-40' : ''
              } ${isOver ? 'border-accent ring-2 ring-accent/40' : 'border-edge'}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.src}
                alt={img.altText || img.fileName}
                className="w-full aspect-square object-cover"
                draggable={false}
              />
              <div className="absolute top-1 left-1 flex items-center gap-1">
                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-black/70 text-white rounded">
                  {idx + 1}
                </span>
                {isCover && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium bg-accent text-white rounded">
                    Cover
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleDelete(idx)}
                disabled={saving}
                className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center bg-black/70 text-white text-xs rounded opacity-0 group-hover:opacity-100 hover:bg-fail transition-opacity disabled:opacity-30"
                aria-label="Delete image"
              >
                ×
              </button>
              <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-gradient-to-t from-black/70 to-transparent">
                <p className="text-[10px] text-white truncate">{img.fileName}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Alt text editor — one row per image. Saves on blur. */}
      <div className="space-y-2">
        <p className="text-xs text-secondary">
          Alt text (per image) — used for SEO and screen readers. Leave blank to fall back to the product title.
        </p>
        {images.map((img, idx) => (
          <div key={`alt-${img.shopifyImageId}`} className="flex items-start gap-2">
            <span className="mt-1 px-1.5 py-0.5 text-[10px] font-medium bg-overlay border border-edge rounded text-secondary shrink-0">
              {idx + 1}
            </span>
            <input
              type="text"
              defaultValue={img.altText ?? ''}
              placeholder="e.g. Stainless steel commercial fryer, front view"
              maxLength={250}
              disabled={saving}
              onBlur={(e) => void persistAltText(idx, e.currentTarget.value)}
              className="flex-1 px-2 py-1 text-xs bg-overlay border border-edge rounded text-primary placeholder:text-secondary/60 focus:outline-none focus:border-accent disabled:opacity-50"
            />
          </div>
        ))}
      </div>

      {/* Mobile fallback: up/down arrows for non-touch-drag environments */}
      <div className="sm:hidden text-[11px] text-secondary">
        Tip: long-press on a photo and drag, or use the arrows below if drag-and-drop is unavailable.
      </div>
      <div className="sm:hidden grid grid-cols-3 gap-2">
        {images.map((img, idx) => (
          <div key={`m-${img.shopifyImageId}`} className="flex items-center justify-between text-xs px-2">
            <span className="truncate">{idx + 1}. {img.fileName}</span>
            <span className="flex gap-1">
              <button
                type="button"
                disabled={idx === 0 || saving}
                onClick={() => { const next = [...images]; const [it] = next.splice(idx, 1); next.splice(idx - 1, 0, it); setImages(next); void persistOrder(next) }}
                className="px-1 disabled:opacity-30"
              >↑</button>
              <button
                type="button"
                disabled={idx === images.length - 1 || saving}
                onClick={() => { const next = [...images]; const [it] = next.splice(idx, 1); next.splice(idx + 1, 0, it); setImages(next); void persistOrder(next) }}
                className="px-1 disabled:opacity-30"
              >↓</button>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
