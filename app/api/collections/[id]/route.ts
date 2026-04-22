import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { getStaffUserFromRequest } from '@/lib/auth/staff'

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// PATCH /api/collections/[id] — update collection (title/description/handle/image/display_order)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const staff = await getStaffUserFromRequest(req)
    if (!staff || staff.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const { id } = await params
    const body = await req.json()
    const db = createServiceClient()

    const updates: Record<string, unknown> = {}
    if (typeof body.title === 'string') updates.title = body.title.trim()
    if ('description' in body) updates.description = body.description?.trim?.() || null
    if ('image_url' in body) updates.image_url = body.image_url || null
    if (typeof body.display_order === 'number') updates.display_order = body.display_order

    if (typeof body.handle === 'string' && body.handle.trim()) {
      const handle = slugify(body.handle.trim())
      if (!handle) {
        return NextResponse.json({ error: 'Invalid handle' }, { status: 400 })
      }
      // Ensure uniqueness
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
      updates.handle = slugify(body.title)
    }

    const { data, error } = await db
      .from('collections')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE /api/collections/[id]
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
    const db = createServiceClient()

    const { error } = await db.from('collections').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
