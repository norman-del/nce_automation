import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { getStaffUser, isAdmin } from '@/lib/auth/staff'

interface PatchBody {
  label?: string
  body_html?: string
  applies_to_condition?: 'new' | 'used' | null
  default_for_vendor?: string | null
  display_order?: number
  active?: boolean
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const staff = await getStaffUser()
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(staff.role)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { code } = await params
  const body = (await req.json()) as PatchBody

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.label !== undefined) updates.label = body.label
  if (body.body_html !== undefined) updates.body_html = body.body_html
  if (body.applies_to_condition !== undefined) updates.applies_to_condition = body.applies_to_condition
  if (body.default_for_vendor !== undefined) {
    updates.default_for_vendor = body.default_for_vendor?.trim() || null
  }
  if (body.display_order !== undefined) updates.display_order = body.display_order
  if (body.active !== undefined) updates.active = body.active

  const db = createServiceClient()
  const { data, error } = await db
    .from('warranty_templates')
    .update(updates)
    .eq('code', code)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

// Soft-delete via active=false. Hard delete is intentionally not exposed —
// products may reference the row, and ON DELETE SET NULL would silently
// strip the link. Deactivate instead, which the form filters out.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const staff = await getStaffUser()
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(staff.role)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { code } = await params
  const db = createServiceClient()
  const { error } = await db
    .from('warranty_templates')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('code', code)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
