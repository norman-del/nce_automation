import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { getStaffUserFromRequest } from '@/lib/auth/staff'

// Collection ↔ product membership.
// Products have a `collections` TEXT[] column storing collection titles.
// GET /api/collections/[id]/products?q=search — list products in this collection + a search pool.
// POST /api/collections/[id]/products { product_id, action: 'add' | 'remove' }

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
    const db = createServiceClient()

    const { data: collection, error: cErr } = await db
      .from('collections')
      .select('id, title')
      .eq('id', id)
      .single()
    if (cErr || !collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    const { data: members } = await db
      .from('products')
      .select('id, sku, title')
      .contains('collections', [collection.title])
      .order('title')
      .limit(500)

    let searchResults: { id: string; sku: string; title: string; in: boolean }[] = []
    if (q.length >= 2) {
      const { data: matches } = await db
        .from('products')
        .select('id, sku, title, collections')
        .or(`title.ilike.%${q}%,sku.ilike.%${q}%`)
        .limit(30)
      searchResults = (matches ?? []).map(p => ({
        id: p.id,
        sku: p.sku,
        title: p.title,
        in: Array.isArray(p.collections) && p.collections.includes(collection.title),
      }))
    }

    return NextResponse.json({
      collection,
      members: members ?? [],
      searchResults,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const staff = await getStaffUserFromRequest(req)
    if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await req.json() as { product_id?: string; action?: 'add' | 'remove' }
    if (!body.product_id || (body.action !== 'add' && body.action !== 'remove')) {
      return NextResponse.json({ error: 'product_id and action required' }, { status: 400 })
    }

    const db = createServiceClient()
    const { data: collection, error: cErr } = await db
      .from('collections')
      .select('title')
      .eq('id', id)
      .single()
    if (cErr || !collection) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: product, error: pErr } = await db
      .from('products')
      .select('id, collections')
      .eq('id', body.product_id)
      .single()
    if (pErr || !product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    const current: string[] = Array.isArray(product.collections) ? product.collections : []
    let next: string[]
    if (body.action === 'add') {
      next = current.includes(collection.title) ? current : [...current, collection.title]
    } else {
      next = current.filter(c => c !== collection.title)
    }

    const { error: uErr } = await db
      .from('products')
      .update({ collections: next, updated_at: new Date().toISOString() })
      .eq('id', body.product_id)
    if (uErr) throw uErr

    return NextResponse.json({ ok: true, collections: next })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
