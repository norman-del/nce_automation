import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { getStaffUserFromRequest } from '@/lib/auth/staff'
import { fireCollectionReindex, logCollectionAction } from '@/lib/collections/triggers'

const FULL_FIELDS =
  'id, shopify_id, handle, title, description, collection_type, sort_order, display_order, image_url, intro_html, featured_image_url, parent_handle, meta_title, meta_description, archived_at, updated_at'

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// GET /api/collections?q=search&all=1&include_archived=1
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  const all = req.nextUrl.searchParams.get('all') === '1'
  const includeArchived = req.nextUrl.searchParams.get('include_archived') === '1'
  const db = createServiceClient()

  if (all) {
    let query = db
      .from('collections')
      .select(FULL_FIELDS)
      .order('display_order')
      .order('title')
    if (!includeArchived) {
      query = query.is('archived_at', null)
    }
    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data ?? [])
  }

  // Typeahead — only live (non-archived) collections.
  let query = db
    .from('collections')
    .select('shopify_id, title')
    .is('archived_at', null)
    .order('title')

  if (q) {
    query = query.ilike('title', `%${q}%`)
  }

  const { data, error } = await query.limit(50)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const results = (data ?? []).map((c: { shopify_id: number; title: string }) => ({
    id: String(c.shopify_id),
    title: c.title,
  }))
  return NextResponse.json(results)
}

// POST /api/collections — create
export async function POST(req: NextRequest) {
  try {
    const staff = await getStaffUserFromRequest(req)
    if (!staff || staff.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const body = await req.json()
    const title = body.title?.trim()
    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const handle = body.handle?.trim() ? slugify(body.handle.trim()) : slugify(title)
    if (!handle) {
      return NextResponse.json({ error: 'Invalid handle' }, { status: 400 })
    }

    const db = createServiceClient()

    const { data: clash } = await db
      .from('collections')
      .select('id')
      .eq('handle', handle)
      .maybeSingle()
    if (clash) {
      return NextResponse.json({ error: 'Handle already in use' }, { status: 409 })
    }

    if (body.parent_handle) {
      const { data: parent } = await db
        .from('collections')
        .select('id')
        .eq('handle', body.parent_handle)
        .is('archived_at', null)
        .maybeSingle()
      if (!parent) {
        return NextResponse.json({ error: 'parent_handle does not match an existing collection' }, { status: 400 })
      }
    }

    const insertRow: Record<string, unknown> = {
      title,
      handle,
      description: body.description?.trim?.() || null,
      collection_type: body.collection_type || 'custom',
      intro_html: body.intro_html?.trim?.() || null,
      featured_image_url: body.featured_image_url || null,
      parent_handle: body.parent_handle?.trim?.() || null,
      meta_title: body.meta_title?.trim?.() || null,
      meta_description: body.meta_description?.trim?.() || null,
    }
    if (typeof body.display_order === 'number') {
      insertRow.display_order = body.display_order
    }
    // shopify_id is NOT NULL but we don't push to Shopify any more — use a
    // negative timestamp-derived placeholder so admin-created rows don't
    // collide with imported Shopify IDs (always positive).
    insertRow.shopify_id = -Date.now()

    const { data, error } = await db
      .from('collections')
      .insert(insertRow)
      .select(FULL_FIELDS)
      .single()

    if (error) throw error

    await logCollectionAction('create', 'success', { id: data.id, handle: data.handle })
    fireCollectionReindex(data.handle)
    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    await logCollectionAction('create', 'error', { error: String(e) })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
