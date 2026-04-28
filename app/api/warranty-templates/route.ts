import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { getStaffUser, isAdmin } from '@/lib/auth/staff'

/**
 * Warranty templates CRUD. Admin-only — staff shouldn't be rewriting
 * warranty terms. The ingestion + edit forms read this list to populate
 * a dropdown, but the source of truth lives here.
 */

export async function GET() {
  const staff = await getStaffUser()
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // GET is allowed for staff too — they need it for the product form dropdown.

  const db = createServiceClient()
  const { data, error } = await db
    .from('warranty_templates')
    .select('*')
    .order('display_order', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

interface UpsertBody {
  code: string
  label: string
  body_html: string
  applies_to_condition: 'new' | 'used' | null
  default_for_vendor: string | null
  display_order: number
  active: boolean
}

export async function POST(req: NextRequest) {
  const staff = await getStaffUser()
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(staff.role)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const body = (await req.json()) as Partial<UpsertBody>
  if (!body.code?.trim()) return NextResponse.json({ error: 'code is required' }, { status: 400 })
  if (!body.label?.trim()) return NextResponse.json({ error: 'label is required' }, { status: 400 })
  if (!body.body_html?.trim()) return NextResponse.json({ error: 'body_html is required' }, { status: 400 })

  const db = createServiceClient()
  const { data, error } = await db
    .from('warranty_templates')
    .insert({
      code: body.code.trim(),
      label: body.label.trim(),
      body_html: body.body_html,
      applies_to_condition: body.applies_to_condition ?? null,
      default_for_vendor: body.default_for_vendor?.trim() || null,
      display_order: body.display_order ?? 0,
      active: body.active ?? true,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data, { status: 201 })
}
