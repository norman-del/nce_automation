// Strategic photo upload — Supabase Storage 'product-images' bucket.
// Gated by STRATEGIC_INGESTION_ENABLED.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { uploadStrategicProductPhoto } from '@/lib/strategic/products/photos'
import { isStrategicIngestionEnabled } from '@/lib/strategic/config'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t0 = Date.now()
  if (!isStrategicIngestionEnabled()) {
    return NextResponse.json({ error: 'Strategic ingestion is disabled.' }, { status: 503 })
  }

  try {
    const { id } = await params
    const db = createServiceClient()

    const { data: product, error: fetchErr } = await db
      .from('products')
      .select('id, sku')
      .eq('id', id)
      .single()
    if (fetchErr || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const formData = await req.formData()
    const files = formData.getAll('images') as File[]
    if (files.length === 0) {
      return NextResponse.json({ error: 'No images provided' }, { status: 400 })
    }

    // Find current max position so new photos append cleanly
    const { data: existing } = await db
      .from('product_images')
      .select('position')
      .eq('product_id', id)
      .order('position', { ascending: false })
      .limit(1)
    let position = ((existing?.[0]?.position as number | undefined) ?? 0) + 1

    const uploaded: { fileName: string; src: string; position: number }[] = []
    const errors: string[] = []

    for (const file of files) {
      try {
        const r = await uploadStrategicProductPhoto({
          productId: id,
          sku: product.sku,
          file,
          position,
        })
        uploaded.push({ fileName: r.fileName, src: r.src, position: r.position })
        position++
      } catch (e) {
        errors.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    console.log('[products-strategic/photos]', product.sku, { uploaded: uploaded.length, errors: errors.length, ms: Date.now() - t0 })
    return NextResponse.json(
      { uploaded, errors },
      { status: errors.length > 0 ? 207 : 201 }
    )
  } catch (e) {
    console.error('[products-strategic/photos] failed:', String(e))
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
