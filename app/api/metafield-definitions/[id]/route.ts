import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { getStaffUserFromRequest } from '@/lib/auth/staff'

const VALID_TYPES = ['text', 'number', 'boolean', 'dimension', 'select'] as const

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
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (typeof body.label === 'string') updates.label = body.label.trim()
    if (typeof body.field_type === 'string') {
      if (!VALID_TYPES.includes(body.field_type)) {
        return NextResponse.json({ error: 'Invalid field_type' }, { status: 400 })
      }
      updates.field_type = body.field_type
    }
    if ('unit' in body) updates.unit = body.unit?.trim() || null
    if ('options' in body) updates.options = body.options ?? null
    if ('display_group' in body) updates.display_group = body.display_group?.trim() || null
    if (typeof body.sort_order === 'number') updates.sort_order = body.sort_order
    if (typeof body.required === 'boolean') updates.required = body.required

    const db = createServiceClient()
    const { data, error } = await db
      .from('metafield_definitions')
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
    const { error } = await db.from('metafield_definitions').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
