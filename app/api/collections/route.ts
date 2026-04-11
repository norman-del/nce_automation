import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'

// GET /api/collections?q=search&all=1 — typeahead search or full list
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  const all = req.nextUrl.searchParams.get('all') === '1'
  const db = createServiceClient()

  if (all) {
    // Full list for management UI
    const { data, error } = await db
      .from('collections')
      .select('id, shopify_id, handle, title, description, collection_type, sort_order')
      .order('title')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data ?? [])
  }

  // Typeahead search (existing behaviour)
  let query = db
    .from('collections')
    .select('shopify_id, title')
    .order('title')

  if (q) {
    query = query.ilike('title', `%${q}%`)
  }

  const { data, error } = await query.limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Return as { id, title } where id is the Shopify collection ID (string)
  const results = (data ?? []).map((c: { shopify_id: number; title: string }) => ({
    id: String(c.shopify_id),
    title: c.title,
  }))

  return NextResponse.json(results)
}

// POST /api/collections — create a new collection
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const title = body.title?.trim()
    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    const description = body.description?.trim() || null
    const collectionType = body.collection_type || 'custom'

    const db = createServiceClient()
    const { data, error } = await db
      .from('collections')
      .insert({
        title,
        handle,
        description,
        collection_type: collectionType,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
