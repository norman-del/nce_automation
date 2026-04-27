import { NextResponse } from 'next/server'
import { fetchDeliveryProfiles } from '@/lib/shopify/products'
import { isShopifySyncEnabled } from '@/lib/shopify/config'

export const dynamic = 'force-dynamic'

// GET /api/shopify/delivery-profiles — list shipping profiles for the dropdown
export async function GET() {
  if (!isShopifySyncEnabled()) {
    return NextResponse.json({ profiles: [] })
  }
  try {
    const profiles = await fetchDeliveryProfiles()
    return NextResponse.json({ profiles })
  } catch (e) {
    console.error('[delivery-profiles/GET] failed:', String(e))
    return NextResponse.json({ error: String(e), profiles: [] }, { status: 500 })
  }
}
