// Strategic photo upload — Supabase Storage instead of Shopify CDN.
// Bucket: 'product-images' (public-read, created in migration 20260502120000).

import { createServiceClient } from '@/lib/supabase/client'

export interface UploadResult {
  fileName: string
  src: string
  storagePath: string
  position: number
}

const BUCKET = 'product-images'

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
}

export async function uploadStrategicProductPhoto(args: {
  productId: string
  sku: string
  file: File
  position: number
}): Promise<UploadResult> {
  const { productId, sku, file, position } = args
  const db = createServiceClient()

  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg'
  const fileName = safeFileName(file.name) || `image-${Date.now()}.${ext}`
  // Path: <sku>/<position>-<filename>. Predictable and unique per slot.
  const storagePath = `${sku}/${position}-${Date.now()}-${fileName}`

  const buffer = await file.arrayBuffer()
  const { error: uploadErr } = await db.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    })
  if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`)

  const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(storagePath)
  const src = urlData.publicUrl

  const { error: insertErr } = await db.from('product_images').insert({
    product_id: productId,
    file_name: fileName,
    src,
    position,
    alt_text: null,
  })
  if (insertErr) {
    // Best-effort cleanup of the uploaded file if DB insert fails
    await db.storage.from(BUCKET).remove([storagePath]).catch(() => {})
    throw new Error(`Image record insert failed: ${insertErr.message}`)
  }

  return { fileName, src, storagePath, position }
}
