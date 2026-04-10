import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'

// GET /api/shipping-rates
export async function GET() {
  try {
    const db = createServiceClient()
    const { data, error } = await db
      .from('shipping_rates')
      .select('*')
      .order('tier', { ascending: true })

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PATCH /api/shipping-rates — update rates (accepts array of rate objects)
export async function PATCH(req: NextRequest) {
  try {
    const { rates } = await req.json() as {
      rates: { id: string; rate_pence: number; free_threshold_pence: number | null; estimated_days: string; label: string }[]
    }

    if (!Array.isArray(rates) || rates.length === 0) {
      return NextResponse.json({ error: 'rates array is required' }, { status: 400 })
    }

    const db = createServiceClient()

    for (const rate of rates) {
      const { error } = await db
        .from('shipping_rates')
        .update({
          rate_pence: rate.rate_pence,
          free_threshold_pence: rate.free_threshold_pence,
          estimated_days: rate.estimated_days,
          label: rate.label,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rate.id)

      if (error) throw error
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[shipping-rates/PATCH] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
