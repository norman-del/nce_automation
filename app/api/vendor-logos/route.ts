// Admin: list all vendor_logos rows.
// Staff (any role): used by product forms to render the brand list.
// Strategic-only — no Shopify, no QBO.

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { getStaffUserFromRequest } from '@/lib/auth/staff'

export async function GET(req: Request) {
  const staff = await getStaffUserFromRequest(req)
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServiceClient()
  const { data, error } = await db
    .from('vendor_logos')
    .select('handle, name, aliases, logo_url, content_type, updated_at')
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ brands: data ?? [] })
}
