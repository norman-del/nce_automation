import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { getStaffUserFromRequest, isAdmin } from '@/lib/auth/staff'

const UPDATABLE_FIELDS = [
  'name', 'contact_name', 'phone', 'email',
  'address_line1', 'address_line2', 'city', 'county', 'postcode',
  'stock_feed_url', 'stock_feed_format', 'stock_feed_parser',
  'stock_feed_schedule', 'stock_feed_enabled',
] as const

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = createServiceClient()
  const { data, error } = await db.from('suppliers').select('*').eq('id', id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await getStaffUserFromRequest(req)
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(staff.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()

  const patch: Record<string, unknown> = {}
  for (const field of UPDATABLE_FIELDS) {
    if (field in body) patch[field] = body[field]
  }

  if (patch.stock_feed_format && !['csv', 'xml'].includes(patch.stock_feed_format as string)) {
    return NextResponse.json({ error: 'stock_feed_format must be csv or xml' }, { status: 400 })
  }

  patch.updated_at = new Date().toISOString()

  const db = createServiceClient()
  const { data, error } = await db
    .from('suppliers')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
