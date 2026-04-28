import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { getStaffUser, isAdmin } from '@/lib/auth/staff'

/**
 * WP-7 nice-to-have — bulk-assign a warranty_term_code to all products that
 * match a vendor/condition/current-code filter. Admin-only. Capped at
 * 5,000 rows per operation.
 *
 * Body shape:
 *   {
 *     vendor?: string,                       // exact match, case-insensitive
 *     condition?: 'new' | 'used',            // omit for any
 *     currentCode?: 'ANY' | 'NULL' | string, // 'NULL' = no warranty, 'ANY' = any value, or a specific code
 *     applyCode: string                      // required — must be an active template code
 *   }
 *
 * Modes:
 *   ?preview=true → { count, samples: [...], capped, max }
 *   no preview    → { updated, warranty_term_code }
 */

const MAX_ROWS = 5000

interface Body {
  vendor?: string | null
  condition?: 'new' | 'used' | null
  currentCode?: string | null
  applyCode?: string
}

function applyFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  q: any,
  vendor: string | null,
  condition: 'new' | 'used' | null,
  currentCodeRaw: string
) {
  let qq = q
  if (vendor) {
    // ilike with no wildcards = case-insensitive equality, equivalent to
    // LOWER(vendor) = LOWER($1). Escape any literal % or _ first.
    const safe = vendor.replace(/[%_]/g, (c) => `\\${c}`)
    qq = qq.ilike('vendor', safe)
  }
  if (condition) qq = qq.eq('condition', condition)
  if (currentCodeRaw === 'NULL') {
    qq = qq.is('warranty_term_code', null)
  } else if (currentCodeRaw !== 'ANY') {
    qq = qq.eq('warranty_term_code', currentCodeRaw)
  }
  return qq
}

export async function POST(req: NextRequest) {
  const staff = await getStaffUser()
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(staff.role)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const url = new URL(req.url)
  const isPreview = url.searchParams.get('preview') === 'true'

  const body = (await req.json().catch(() => ({}))) as Body
  const applyCode = body.applyCode?.trim()
  if (!applyCode) {
    return NextResponse.json({ error: 'applyCode is required' }, { status: 400 })
  }

  const vendor = body.vendor?.trim() || null
  const condition = body.condition ?? null
  const currentCodeRaw = body.currentCode?.trim() || 'ANY'

  if (condition && condition !== 'new' && condition !== 'used') {
    return NextResponse.json({ error: 'condition must be new, used, or omitted' }, { status: 400 })
  }

  const db = createServiceClient()

  // Validate template
  const { data: tpl, error: tplErr } = await db
    .from('warranty_templates')
    .select('code, active')
    .eq('code', applyCode)
    .maybeSingle()
  if (tplErr) return NextResponse.json({ error: tplErr.message }, { status: 500 })
  if (!tpl) return NextResponse.json({ error: `applyCode '${applyCode}' not found` }, { status: 400 })
  if (!tpl.active) {
    return NextResponse.json({ error: `applyCode '${applyCode}' is inactive` }, { status: 400 })
  }

  if (isPreview) {
    const countBuilder = applyFilters(
      db.from('products').select('id', { count: 'exact', head: true }),
      vendor,
      condition,
      currentCodeRaw
    )
    const { count, error: countErr } = await countBuilder
    if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 })
    const total: number = count ?? 0

    const sampleBuilder = applyFilters(
      db
        .from('products')
        .select('id, sku, title, vendor, condition, warranty_term_code')
        .order('created_at', { ascending: false })
        .limit(5),
      vendor,
      condition,
      currentCodeRaw
    )
    const { data: samples, error: sampleErr } = await sampleBuilder
    if (sampleErr) return NextResponse.json({ error: sampleErr.message }, { status: 500 })

    return NextResponse.json({
      count: total,
      samples: samples ?? [],
      capped: total > MAX_ROWS,
      max: MAX_ROWS,
    })
  }

  // APPLY: collect ids (cap+1) so we can detect over-cap, then update by id.
  const idBuilder = applyFilters(
    db.from('products').select('id').limit(MAX_ROWS + 1),
    vendor,
    condition,
    currentCodeRaw
  )
  const { data: rows, error: rowsErr } = await idBuilder
  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 })
  const candidates = (rows ?? []) as { id: string }[]

  if (candidates.length > MAX_ROWS) {
    return NextResponse.json(
      {
        error: `Match exceeds ${MAX_ROWS} rows. Narrow the filter and try again.`,
        count: candidates.length,
      },
      { status: 400 }
    )
  }

  if (candidates.length === 0) {
    return NextResponse.json({ updated: 0, warranty_term_code: applyCode })
  }

  const ids = candidates.map((r) => r.id)
  const { error: updErr } = await db
    .from('products')
    .update({ warranty_term_code: applyCode })
    .in('id', ids)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  await db.from('sync_log').insert({
    action: 'warranty_bulk_assign',
    status: 'success',
    details: {
      apply_code: applyCode,
      filter: { vendor, condition, currentCode: currentCodeRaw },
      updated_count: ids.length,
      staff_id: staff.id,
    },
  })

  return NextResponse.json({ updated: ids.length, warranty_term_code: applyCode })
}
