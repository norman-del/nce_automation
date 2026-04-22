import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { getStaffUserFromRequest } from '@/lib/auth/staff'

const VALID_TYPES = ['text', 'number', 'boolean', 'dimension', 'select'] as const
type FieldType = (typeof VALID_TYPES)[number]

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '')
}

export async function GET() {
  const db = createServiceClient()
  const { data, error } = await db
    .from('metafield_definitions')
    .select('*')
    .order('display_group', { nullsFirst: true })
    .order('sort_order')
    .order('label')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  try {
    const staff = await getStaffUserFromRequest(req)
    if (!staff || staff.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const body = await req.json()
    const label = body.label?.trim()
    if (!label) return NextResponse.json({ error: 'Label required' }, { status: 400 })

    const field_type = body.field_type as FieldType
    if (!VALID_TYPES.includes(field_type)) {
      return NextResponse.json({ error: 'Invalid field_type' }, { status: 400 })
    }

    const key = body.key ? slugify(body.key) : slugify(label)
    if (!key) return NextResponse.json({ error: 'Invalid key' }, { status: 400 })

    const db = createServiceClient()
    const { data, error } = await db
      .from('metafield_definitions')
      .insert({
        key,
        label,
        field_type,
        unit: body.unit?.trim() || null,
        options: field_type === 'select' ? (body.options ?? null) : null,
        display_group: body.display_group?.trim() || null,
        sort_order: typeof body.sort_order === 'number' ? body.sort_order : 0,
        required: Boolean(body.required),
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
