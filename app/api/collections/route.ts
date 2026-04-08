import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'

// GET /api/collections?q=search — typeahead search for collections
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  const db = createServiceClient()

  let query = db
    .from('collections')
    .select('shopify_id, title')
    .order('title')

  if (q) {
    query = query.ilike('title', `%${q}%`)
  }

  const { data, error } = await query.limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Return as { id, title } where id is the Shopify collection ID (string)
  const results = (data ?? []).map((c: { shopify_id: number; title: string }) => ({
    id: String(c.shopify_id),
    title: c.title,
  }))

  return NextResponse.json(results)
}
