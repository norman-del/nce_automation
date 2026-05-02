// Strategic product create — Supabase + QBO only.
// Gated by STRATEGIC_INGESTION_ENABLED env var (default false).

import { NextRequest, NextResponse } from 'next/server'
import { createStrategicProduct, type StrategicProductInput } from '@/lib/strategic/products/create'

export async function POST(req: NextRequest) {
  const t0 = Date.now()
  try {
    const body = await req.json()
    const inputs: StrategicProductInput[] = Array.isArray(body) ? body : [body]
    if (inputs.length === 0) {
      return NextResponse.json({ error: 'No products provided' }, { status: 400 })
    }

    const results = []
    for (const input of inputs) {
      try {
        const r = await createStrategicProduct(input)
        results.push(r)
      } catch (e) {
        results.push({ sku: '', id: '', error: e instanceof Error ? e.message : String(e) })
      }
    }
    const hasErrors = results.some((r) => r.error)
    console.log('[products-strategic/POST] done', { total: results.length, errors: results.filter(r => r.error).length, ms: Date.now() - t0 })
    return NextResponse.json({ products: results }, { status: hasErrors ? 207 : 201 })
  } catch (e) {
    console.error('[products-strategic/POST] failed:', String(e))
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
