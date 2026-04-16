import { NextRequest, NextResponse } from 'next/server'
import { getStaffUserFromRequest, isAdmin } from '@/lib/auth/staff'
import { syncOrderToQbo } from '@/lib/sync/order-to-qbo'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const staff = await getStaffUserFromRequest(req)
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(staff.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { orderId } = await params
  const result = await syncOrderToQbo(orderId)
  const httpStatus = result.status === 'error' ? 500 : 200
  return NextResponse.json(result, { status: httpStatus })
}
