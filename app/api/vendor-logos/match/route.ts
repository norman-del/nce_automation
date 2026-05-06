// GET /api/vendor-logos/match?vendor=Foster
// Used by the strategic product forms to preview the auto-assigned logo.

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { getStaffUserFromRequest } from '@/lib/auth/staff'
import { resolveVendorLogo } from '@/lib/strategic/brand-logos'

export async function GET(req: Request) {
  const staff = await getStaffUserFromRequest(req)
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const vendor = url.searchParams.get('vendor')
  const db = createServiceClient()
  const match = await resolveVendorLogo(db, vendor)
  return NextResponse.json({ match })
}
