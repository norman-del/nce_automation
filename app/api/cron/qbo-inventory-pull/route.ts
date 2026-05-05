// Phase 0 inventory shadow-read cron.
// Runs every 10 min (vercel.json). Pulls QtyOnHand from QBO for every
// Inventory item, writes to products.qbo_qty_on_hand. NOTHING reads
// the column yet — the storefront still uses products.stock_quantity.
//
// Purpose: surface drift between QBO and Supabase before Phase 1 cuts
// the storefront over. After ≥1 week of clean drift data we promote
// to Phase 1 (PRD §3.11, plan §12.2).

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { pullQboInventory } from '@/lib/qbo/inventory'

export const runtime = 'nodejs'
export const maxDuration = 60

interface ProductRow {
  id: string
  qbo_item_id: string | null
  stock_quantity: number | null
  qbo_qty_on_hand: number | null
}

export async function GET(req: NextRequest) {
  // Cron auth — same pattern as other crons.
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const startedAt = Date.now()

  try {
    const { itemQty, totalScanned, inventoryItems } = await pullQboInventory()

    // Pull every product with a qbo_item_id so we can spot products that
    // are linked but absent from the QBO snapshot (deactivated upstream).
    const { data: products, error } = await db
      .from('products')
      .select('id, qbo_item_id, stock_quantity, qbo_qty_on_hand')
      .not('qbo_item_id', 'is', null)
      .neq('status', 'archived')

    if (error) throw error
    const rows = (products ?? []) as ProductRow[]

    const now = new Date().toISOString()
    let updated = 0
    let unchanged = 0
    let missingFromQbo = 0
    let driftCount = 0

    // Update sequentially in batches to avoid hammering the row count.
    // ~2,400 products × one update each is fine, but we group by qty
    // value to dedupe identical writes.
    for (const row of rows) {
      const qboQty = row.qbo_item_id ? itemQty.get(row.qbo_item_id) : undefined
      if (qboQty === undefined) {
        missingFromQbo++
        continue
      }
      if (qboQty !== row.qbo_qty_on_hand) {
        const { error: updErr } = await db
          .from('products')
          .update({ qbo_qty_on_hand: qboQty, qbo_qty_pulled_at: now })
          .eq('id', row.id)
        if (updErr) {
          console.warn('[qbo-inventory-pull] update failed for', row.id, updErr.message)
          continue
        }
        updated++
      } else {
        // Same value — just bump the pulled_at timestamp so we know the
        // row was checked this cycle. Single batch update at the end
        // would be nicer, but keeping this row-by-row is simpler and
        // still well within QBO's catalog size.
        await db
          .from('products')
          .update({ qbo_qty_pulled_at: now })
          .eq('id', row.id)
        unchanged++
      }
      // Drift = QBO disagrees with our authoritative storefront column.
      // Tracked so we can decide when Phase 1 is safe to promote.
      if (row.stock_quantity !== qboQty) driftCount++
    }

    const durationMs = Date.now() - startedAt
    const summary = {
      durationMs,
      qboTotalScanned: totalScanned,
      qboInventoryItems: inventoryItems,
      productsLinked: rows.length,
      updated,
      unchanged,
      missingFromQbo,
      driftCount,
    }

    await db.from('sync_log').insert({
      action: 'qbo_inventory_pull',
      status: 'success',
      details: summary,
    })

    console.log('[qbo-inventory-pull] done', summary)
    return NextResponse.json({ ok: true, ...summary })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await db.from('sync_log').insert({
      action: 'qbo_inventory_pull',
      status: 'error',
      details: { error: message, durationMs: Date.now() - startedAt },
    })
    console.error('[qbo-inventory-pull] FAILED:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
