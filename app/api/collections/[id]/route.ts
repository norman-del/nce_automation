import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { getStaffUserFromRequest } from '@/lib/auth/staff'
import { fireCollectionReindex, logCollectionAction } from '@/lib/collections/triggers'

const FULL_FIELDS =
  'id, shopify_id, handle, title, description, collection_type, sort_order, display_order, image_url, intro_html, featured_image_url, parent_handle, meta_title, meta_description, archived_at, updated_at'

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// GET /api/collections/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const db = createServiceClient()
    const { data, error } = await db
      .from('collections')
      .select(FULL_FIELDS)
      .eq('id', id)
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PATCH /api/collections/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const staff = await getStaffUserFromRequest(req)
    if (!staff || staff.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }
    const body = await req.json()
    const db = createServiceClient()

    const updates: Record<string, unknown> = {}
    if (typeof body.title === 'string') updates.title = body.title.trim()
    if ('description' in body) updates.description = body.description?.trim?.() || null
    if ('image_url' in body) updates.image_url = body.image_url || null
    if ('featured_image_url' in body) updates.featured_image_url = body.featured_image_url || null
    if ('intro_html' in body) updates.intro_html = body.intro_html?.trim?.() || null
    if ('meta_title' in body) updates.meta_title = body.meta_title?.trim?.() || null
    if ('meta_description' in body) updates.meta_description = body.meta_description?.trim?.() || null
    if (typeof body.display_order === 'number') updates.display_order = body.display_order

    if ('parent_handle' in body) {
      const ph = body.parent_handle?.trim?.() || null
      if (ph) {
        const { data: parent } = await db
          .from('collections')
          .select('id, handle')
          .eq('handle', ph)
          .is('archived_at', null)
          .maybeSingle()
        if (!parent) {
          return NextResponse.json({ error: 'parent_handle does not match an existing collection' }, { status: 400 })
        }
        if (parent.id === id) {
          return NextResponse.json({ error: 'parent_handle cannot equal own handle' }, { status: 400 })
        }
      }
      updates.parent_handle = ph
    }

    if (typeof body.handle === 'string' && body.handle.trim()) {
      const handle = slugify(body.handle.trim())
      if (!handle) {
        return NextResponse.json({ error: 'Invalid handle' }, { status: 400 })
      }
      const { data: clash } = await db
        .from('collections')
        .select('id')
        .eq('handle', handle)
        .neq('id', id)
        .maybeSingle()
      if (clash) {
        return NextResponse.json({ error: 'Handle already in use' }, { status: 409 })
      }
      updates.handle = handle
    } else if (typeof body.title === 'string' && !('handle' in body)) {
      // Don't auto-rename handle on title change — handles are URL contracts.
    }

    if ('archived_at' in body) {
      updates.archived_at = body.archived_at ? new Date(body.archived_at).toISOString() : null
    }

    const { data, error } = await db
      .from('collections')
      .update(updates)
      .eq('id', id)
      .select(FULL_FIELDS)
      .single()

    if (error) throw error

    await logCollectionAction('update', 'success', { id: data.id, handle: data.handle, fields: Object.keys(updates) })
    fireCollectionReindex(data.handle)
    return NextResponse.json(data)
  } catch (e) {
    await logCollectionAction('update', 'error', { id, error: String(e) })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE /api/collections/[id] — soft-delete via archived_at; pass ?hard=1 to remove (kept for emergencies)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const staff = await getStaffUserFromRequest(req)
    if (!staff || staff.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const { id } = await params
    const hard = req.nextUrl.searchParams.get('hard') === '1'
    const db = createServiceClient()

    if (hard) {
      const { data: existing } = await db
        .from('collections')
        .select('handle')
        .eq('id', id)
        .single()
      const { error } = await db.from('collections').delete().eq('id', id)
      if (error) throw error
      await logCollectionAction('delete_hard', 'success', { id, handle: existing?.handle })
      if (existing?.handle) fireCollectionReindex(existing.handle)
      return NextResponse.json({ ok: true, hard: true })
    }

    const { data, error } = await db
      .from('collections')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, handle')
      .single()
    if (error) throw error

    await logCollectionAction('archive', 'success', { id: data.id, handle: data.handle })
    fireCollectionReindex(data.handle)
    return NextResponse.json({ ok: true, archived: true, collection: data })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
