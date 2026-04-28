import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { getStaffUserFromRequest } from '@/lib/auth/staff'

export async function GET(req: NextRequest) {
  const staff = await getStaffUserFromRequest(req)
  if (!staff || staff.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }
  const db = createServiceClient()
  const { data, error } = await db
    .from('sync_log')
    .select('id, status, details, created_at')
    .eq('action', 'merchant_feed_publish')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: urlData } = db.storage.from('merchant-feed').getPublicUrl('feed.csv')
  return NextResponse.json({
    public_url: urlData.publicUrl,
    last_run: data ?? null,
  })
}
