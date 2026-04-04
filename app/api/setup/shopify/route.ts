import { NextResponse } from 'next/server'
import { encrypt } from '@/lib/crypto'
import { createServiceClient } from '@/lib/supabase/client'

const SHOPIFY_CONNECTION_ID = '00000000-0000-0000-0000-000000000001'
const DEFAULT_SCOPES = 'read_orders,read_finances'

export async function POST() {
  try {
    const store_domain = process.env.SHOPIFY_STORE_DOMAIN
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN

    if (!store_domain || !accessToken) {
      throw new Error('Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_ACCESS_TOKEN')
    }

    const db = createServiceClient()

    const { data: existing, error: existingError } = await db
      .from('shopify_connections')
      .select('store_domain')
      .eq('id', SHOPIFY_CONNECTION_ID)
      .maybeSingle()

    if (existingError) {
      throw existingError
    }

    if (existing?.store_domain) {
      return NextResponse.json({
        message: 'Already seeded',
        store_domain: existing.store_domain,
      })
    }

    const { error } = await db.from('shopify_connections').upsert(
      {
        id: SHOPIFY_CONNECTION_ID,
        store_domain,
        access_token_encrypted: encrypt(accessToken),
        scopes: DEFAULT_SCOPES,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )

    if (error) {
      throw error
    }

    return NextResponse.json({ ok: true, store_domain })
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error }, { status: 500 })
  }
}
