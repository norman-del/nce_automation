import { NextRequest, NextResponse } from 'next/server'
import { getStaffUserFromRequest } from '@/lib/auth/staff'
import { runMerchantFeed } from '@/lib/merchant-feed/run'

// Admin-only manual trigger.
export async function POST(req: NextRequest) {
  const staff = await getStaffUserFromRequest(req)
  if (!staff || staff.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }
  const result = await runMerchantFeed('manual')
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }
  return NextResponse.json(result)
}
