'use client'

// Strategic photo manager: upload (Supabase Storage), gallery with drag-reorder
// and per-image delete. No Shopify involvement.

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

export interface StrategicPhoto {
  id: string
  src: string
  fileName: string
  altText: string | null
  position: number
}

interface Props {
  productId: string
  sku: string
  initial: StrategicPhoto[]
}

const MAX_DIMENSION = 2000
const JPEG_QUALITY = 0.85

async function downscaleToJpeg(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      'image/jpeg',
      JPEG_QUALITY
    )
  })
}

export default function PhotosManagerStrategic({ productId, initial }: Props) {
  const router = useRouter()
  const [images, setImages] = useState<StrategicPhoto[]>(initial)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleUpload() {
    const files = fileRef.current?.files
    if (!files || files.length === 0) return

    setUploading(true)
    setError(null)
    setProgress({ done: 0, total: files.length })

    const queue = Array.from(files)
    let done = 0
    for (const file of queue) {
      try {
        const blob = await downscaleToJpeg(file)
        const baseName = file.name.replace(/\.[^.]+$/, '') + '.jpg'
        const fd = new FormData()
        fd.append('images', new File([blob], baseName, { type: 'image/jpeg' }))

        const res = await fetch(`/api/products-strategic/${productId}/photos`, {
          method: 'POST',
          body: fd,
        })
        if (!res.ok && res.status !== 207) {
          const txt = await res.text()
          throw new Error(`${res.status}: ${txt.slice(0, 200) || res.statusText}`)
        }
      } catch (e) {
        setError((prev) => {
          const m = `${file.name}: ${e instanceof Error ? e.message : String(e)}`
          return prev ? `${prev}\n${m}` : m
        })
      }
      done += 1
      setProgress({ done, total: files.length })
    }

    setUploading(false)
    setProgress(null)
    if (fileRef.current) fileRef.current.value = ''
    // Reload from server so we get IDs and final positions
    router.refresh()
  }

  async function persistOrder(next: StrategicPhoto[]) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/products-strategic/${productId}/photos/order`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: next.map((i) => i.id) }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Reorder failed (${res.status})`)
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(idx: number) {
    const img = images[idx]
    if (!confirm(`Delete "${img.fileName}"?`)) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/products-strategic/${productId}/photos/${img.id}`, {
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
      setBusy(false)
    }
  }

  function onDragStart(idx: number) { setDraggingIdx(idx) }
  function onDragOver(e: React.DragEvent, idx: number) { e.preventDefault(); setOverIdx(idx) }
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
  function onDragEnd() { setDraggingIdx(null); setOverIdx(null) }

  return (
    <div className="space-y-4">
      {/* Uploader */}
      <div className="flex items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*"
          className="text-sm text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-edge file:text-sm file:bg-surface file:text-primary hover:file:bg-overlay file:cursor-pointer"
        />
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="px-4 py-1.5 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent-hi disabled:opacity-50 transition-colors"
        >
          {uploading
            ? progress
              ? `Uploading ${progress.done}/${progress.total}...`
              : 'Uploading...'
            : 'Upload photos'}
        </button>
      </div>

      {error && (
        <div className="bg-fail/10 border border-fail/25 text-fail rounded-md px-3 py-2 text-xs whitespace-pre-line">
          {error}
        </div>
      )}

      {images.length === 0 ? (
        <p className="text-xs text-secondary">No photos yet.</p>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-secondary">Drag to reorder. The first image is the storefront cover.</p>
            {busy && <span className="text-xs text-secondary">Saving…</span>}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {images.map((img, idx) => {
              const isCover = idx === 0
              const isDragging = draggingIdx === idx
              const isOver = overIdx === idx && draggingIdx !== idx
              return (
                <div
                  key={img.id}
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
                    disabled={busy}
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

          {/* Mobile fallback: up/down arrows */}
          <div className="sm:hidden grid grid-cols-1 gap-1 mt-2">
            {images.map((img, idx) => (
              <div key={`m-${img.id}`} className="flex items-center justify-between text-xs px-2">
                <span className="truncate">{idx + 1}. {img.fileName}</span>
                <span className="flex gap-1">
                  <button
                    type="button"
                    disabled={idx === 0 || busy}
                    onClick={() => { const next = [...images]; const [it] = next.splice(idx, 1); next.splice(idx - 1, 0, it); setImages(next); void persistOrder(next) }}
                    className="px-1 disabled:opacity-30"
                  >↑</button>
                  <button
                    type="button"
                    disabled={idx === images.length - 1 || busy}
                    onClick={() => { const next = [...images]; const [it] = next.splice(idx, 1); next.splice(idx + 1, 0, it); setImages(next); void persistOrder(next) }}
                    className="px-1 disabled:opacity-30"
                  >↓</button>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
