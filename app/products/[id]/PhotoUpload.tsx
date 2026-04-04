'use client'

import { useState, useRef } from 'react'

interface Props {
  productId: string
  hasShopifyId: boolean
  onActivated: () => void
}

export default function PhotoUpload({ productId, hasShopifyId, onActivated }: Props) {
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ uploaded: number; errors: string[]; activated: boolean } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleUpload() {
    const files = fileRef.current?.files
    if (!files || files.length === 0) return

    setUploading(true)
    setResult(null)

    const formData = new FormData()
    for (let i = 0; i < files.length; i++) {
      formData.append('images', files[i])
    }

    try {
      const res = await fetch(`/api/products/${productId}/images`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      setResult(data)
      if (data.activated) onActivated()
    } catch (e) {
      setResult({ uploaded: 0, errors: [String(e)], activated: false })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
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
          {uploading ? 'Uploading...' : 'Upload & Activate'}
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
