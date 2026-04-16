import { NextRequest, NextResponse } from 'next/server'
import { getStaffUserFromRequest, isAdmin } from '@/lib/auth/staff'
import { runSupplierFeed } from '@/lib/suppliers/run'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await getStaffUserFromRequest(req)
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(staff.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const result = await runSupplierFeed(id, { manual: true })
  const httpStatus = result.status === 'error' ? 500 : 200
  return NextResponse.json(result, { status: httpStatus })
}
