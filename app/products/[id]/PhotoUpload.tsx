'use client'

import { useState, useRef } from 'react'

interface Props {
  productId: string
  hasShopifyId: boolean
  onActivated: () => void
}

// Vercel serverless functions cap request bodies at ~4.5 MB. We downscale and
// upload one file per request so each POST stays well under that ceiling.
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

export default function PhotoUpload({ productId, hasShopifyId, onActivated }: Props) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<{ uploaded: number; errors: string[]; activated: boolean } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function uploadOne(file: File): Promise<{ uploaded: number; errors: string[]; activated: boolean }> {
    const blob = await downscaleToJpeg(file)
    const baseName = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    const formData = new FormData()
    formData.append('images', new File([blob], baseName, { type: 'image/jpeg' }))

    const res = await fetch(`/api/products/${productId}/images`, {
      method: 'POST',
      body: formData,
    })

    const text = await res.text()
    if (!res.ok) {
      // Vercel 413 returns plaintext "Request Entity Too Large"; surface it cleanly.
      throw new Error(`${res.status}: ${text.slice(0, 200) || res.statusText}`)
    }
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(`Unexpected response: ${text.slice(0, 200)}`)
    }
  }

  async function handleUpload() {
    const files = fileRef.current?.files
    if (!files || files.length === 0) return

    setUploading(true)
    setResult(null)

    const totals = { uploaded: 0, errors: [] as string[], activated: false }
    setProgress({ done: 0, total: files.length })

    for (let i = 0; i < files.length; i++) {
      try {
        const r = await uploadOne(files[i])
        totals.uploaded += r.uploaded
        totals.errors.push(...r.errors)
        if (r.activated) totals.activated = true
      } catch (e) {
        totals.errors.push(`${files[i].name}: ${String(e instanceof Error ? e.message : e)}`)
      }
      setProgress({ done: i + 1, total: files.length })
    }

    setResult(totals)
    if (totals.activated) onActivated()
    setUploading(false)
    setProgress(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  if (!hasShopifyId) {
    return (
      <div className="bg-warn/10 border border-warn/25 rounded-md px-4 py-3 text-sm text-warn">
        Product must be synced to Shopify before uploading photos.
      </div>
    )
  }

  return (
    <div className="space-y-3">
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
            : 'Upload & Activate'}
        </button>
      </div>

      {result && (
        <div className={`rounded-md px-4 py-3 text-sm ${result.activated ? 'bg-ok/10 border border-ok/25 text-ok' : 'bg-warn/10 border border-warn/25 text-warn'}`}>
          {result.uploaded > 0 && <p>{result.uploaded} image{result.uploaded > 1 ? 's' : ''} uploaded.</p>}
          {result.activated && <p>Product activated in Shopify.</p>}
          {result.errors.map((e, i) => <p key={i} className="text-fail">{e}</p>)}
        </div>
      )}
    </div>
  )
}
