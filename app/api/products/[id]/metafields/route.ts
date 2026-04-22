import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { getStaffUserFromRequest } from '@/lib/auth/staff'

interface MetafieldDef {
  id: string
  key: string
  label: string
  field_type: 'text' | 'number' | 'boolean' | 'dimension' | 'select'
  unit: string | null
  options: string[] | null
  display_group: string | null
  sort_order: number
  required: boolean
}

interface MetafieldValue {
  definition_id: string
  value_text: string | null
  value_number: number | null
  value_boolean: boolean | null
}

// GET /api/products/[id]/metafields
// Returns all definitions merged with this product's values.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const db = createServiceClient()

    const [defsRes, valsRes] = await Promise.all([
      db.from('metafield_definitions').select('*').order('display_group').order('sort_order').order('label'),
      db.from('product_metafields').select('*').eq('product_id', id),
    ])

    if (defsRes.error) throw defsRes.error
    if (valsRes.error) throw valsRes.error

    const defs = (defsRes.data ?? []) as MetafieldDef[]
    const vals = (valsRes.data ?? []) as MetafieldValue[]
    const valByDef = new Map(vals.map(v => [v.definition_id, v]))

    const merged = defs.map(def => {
      const v = valByDef.get(def.id)
      return {
        ...def,
        value_text: v?.value_text ?? null,
        value_number: v?.value_number ?? null,
        value_boolean: v?.value_boolean ?? null,
      }
    })

    return NextResponse.json(merged)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PUT /api/products/[id]/metafields
// Body: { values: [{ definition_id, value }] }
// `value` is coerced based on the definition's field_type.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const staff = await getStaffUserFromRequest(req)
    if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await req.json() as { values?: { definition_id: string; value: unknown }[] }
    if (!Array.isArray(body.values)) {
      return NextResponse.json({ error: 'values array required' }, { status: 400 })
    }

    const db = createServiceClient()

    const { data: defs, error: dErr } = await db
      .from('metafield_definitions')
      .select('id, field_type')
    if (dErr) throw dErr

    const defMap = new Map((defs ?? []).map(d => [d.id, d.field_type as MetafieldDef['field_type']]))

    const now = new Date().toISOString()
    const rows: Record<string, unknown>[] = []
    const toDelete: string[] = []

    for (const entry of body.values) {
      const fieldType = defMap.get(entry.definition_id)
      if (!fieldType) continue

      const isEmpty = entry.value === null || entry.value === undefined || entry.value === ''
      if (isEmpty) {
        toDelete.push(entry.definition_id)
        continue
      }

      const row: Record<string, unknown> = {
        product_id: id,
        definition_id: entry.definition_id,
        value_text: null,
        value_number: null,
        value_boolean: null,
        updated_at: now,
      }

      if (fieldType === 'number' || fieldType === 'dimension') {
        const n = Number(entry.value)
        if (!Number.isFinite(n)) continue
        row.value_number = n
      } else if (fieldType === 'boolean') {
        row.value_boolean = Boolean(entry.value)
      } else {
        row.value_text = String(entry.value)
      }

      rows.push(row)
    }

    // Delete cleared values
    if (toDelete.length > 0) {
      await db
        .from('product_metafields')
        .delete()
        .eq('product_id', id)
        .in('definition_id', toDelete)
    }

    // Upsert the rest
    if (rows.length > 0) {
      const { error: upErr } = await db
        .from('product_metafields')
        .upsert(rows, { onConflict: 'product_id,definition_id' })
      if (upErr) throw upErr
    }

    return NextResponse.json({ ok: true, saved: rows.length, cleared: toDelete.length })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
