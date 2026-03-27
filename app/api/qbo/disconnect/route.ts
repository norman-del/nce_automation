import { createServiceClient } from '@/lib/supabase/client'
import { NextResponse } from 'next/server'

export async function POST() {
  const db = createServiceClient()
  const { error } = await db.from('qbo_connections').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
