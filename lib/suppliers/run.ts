import { createServiceClient } from '@/lib/supabase/client'
import { parseProdisFeed } from './prodis'
import { parseCombisteelFeed } from './combisteel'
import type { FeedRow, FeedRunResult } from './types'

const PARSERS: Record<string, (url: string) => Promise<FeedRow[]>> = {
  prodis: parseProdisFeed,
  combisteel: parseCombisteelFeed,
}

const ROW_COUNT_FLOOR_RATIO = 0.5

interface SupplierRow {
  id: string
  name: string
  stock_feed_url: string | null
  stock_feed_parser: string | null
  stock_feed_enabled: boolean
  stock_feed_last_row_count: number | null
}

async function writeSupplierStatus(
  supplierId: string,
  patch: Record<string, unknown>
) {
  const db = createServiceClient()
  await db
    .from('suppliers')
    .update({ ...patch, stock_feed_last_run_at: new Date().toISOString() })
    .eq('id', supplierId)
}

async function logRun(
  status: 'success' | 'aborted' | 'error',
  details: Record<string, unknown>
) {
  const db = createServiceClient()
  await db.from('sync_log').insert({
    action: 'supplier_feed',
    status,
    details,
  })
}

export async function runSupplierFeed(
  supplierId: string,
  opts: { manual?: boolean } = {}
): Promise<FeedRunResult> {
  const db = createServiceClient()
  const manual = opts.manual === true

  const { data: supplier, error: supErr } = await db
    .from('suppliers')
    .select('id, name, stock_feed_url, stock_feed_parser, stock_feed_enabled, stock_feed_last_row_count')
    .eq('id', supplierId)
    .single<SupplierRow>()

  if (supErr || !supplier) {
    return {
      supplierId,
      supplierName: 'unknown',
      status: 'error',
      rowCount: 0,
      matchedCount: 0,
      updatedCount: 0,
      error: supErr?.message || 'Supplier not found',
    }
  }

  const base = {
    supplierId: supplier.id,
    supplierName: supplier.name,
    rowCount: 0,
    matchedCount: 0,
    updatedCount: 0,
  }

  if (!supplier.stock_feed_enabled && !manual) {
    return { ...base, status: 'aborted', abortReason: 'disabled' }
  }

  if (!supplier.stock_feed_url || !supplier.stock_feed_parser) {
    const msg = 'Missing feed URL or parser'
    await writeSupplierStatus(supplierId, {
      stock_feed_last_status: 'error',
      stock_feed_last_error: msg,
    })
    await logRun('error', { supplier: supplier.name, error: msg })
    return { ...base, status: 'error', error: msg }
  }

  const parser = PARSERS[supplier.stock_feed_parser]
  if (!parser) {
    const msg = `Unknown parser: ${supplier.stock_feed_parser}`
    await writeSupplierStatus(supplierId, {
      stock_feed_last_status: 'error',
      stock_feed_last_error: msg,
    })
    await logRun('error', { supplier: supplier.name, error: msg })
    return { ...base, status: 'error', error: msg }
  }

  console.log(`[supplier-feeds] Running ${supplier.name} (${manual ? 'manual' : 'scheduled'})`)

  let feedRows: FeedRow[]
  try {
    feedRows = await parser(supplier.stock_feed_url)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[supplier-feeds] ${supplier.name} fetch/parse error:`, msg)
    await writeSupplierStatus(supplierId, {
      stock_feed_last_status: 'error',
      stock_feed_last_error: msg,
    })
    await logRun('error', { supplier: supplier.name, error: msg, phase: 'parse' })
    return { ...base, status: 'error', error: msg }
  }

  const rowCount = feedRows.length
  const prevRowCount = supplier.stock_feed_last_row_count

  // FAIL-SAFE: abort if row count dropped >50% vs last successful run
  if (
    prevRowCount != null &&
    prevRowCount > 0 &&
    rowCount < prevRowCount * ROW_COUNT_FLOOR_RATIO
  ) {
    const reason = `Row count ${rowCount} is <${Math.round(ROW_COUNT_FLOOR_RATIO * 100)}% of previous ${prevRowCount}`
    console.warn(`[supplier-feeds] ${supplier.name} ABORTED: ${reason}`)
    await writeSupplierStatus(supplierId, {
      stock_feed_last_status: 'aborted',
      stock_feed_last_row_count: rowCount,
      stock_feed_last_error: reason,
    })
    await logRun('aborted', {
      supplier: supplier.name,
      reason: 'row_count_drop',
      rowCount,
      prevRowCount,
    })
    return { ...base, rowCount, status: 'aborted', abortReason: 'row_count_drop' }
  }

  // Match to products by SKU (case-insensitive). Normalise to upper for comparison.
  const skuMap = new Map<string, number>()
  for (const r of feedRows) {
    if (!r.sku) continue
    skuMap.set(r.sku.trim().toUpperCase(), r.quantity)
  }
  const skuList = feedRows.map(r => r.sku.trim()).filter(Boolean)

  const { data: products, error: prodErr } = await db
    .from('products')
    .select('id, sku, stock_quantity')
    .in('sku', skuList)

  if (prodErr) {
    const msg = prodErr.message
    await writeSupplierStatus(supplierId, {
      stock_feed_last_status: 'error',
      stock_feed_last_error: msg,
      stock_feed_last_row_count: rowCount,
    })
    await logRun('error', { supplier: supplier.name, error: msg, phase: 'match' })
    return { ...base, rowCount, status: 'error', error: msg }
  }

  const matched = products ?? []
  const matchedCount = matched.length
  let updatedCount = 0
  const zeroingRows: string[] = []
  const updateErrors: string[] = []

  const nowIso = new Date().toISOString()
  const notes = `${supplier.name} feed (${manual ? 'manual' : 'scheduled'})`

  for (const p of matched) {
    const feedQty = skuMap.get(p.sku.trim().toUpperCase())
    if (feedQty == null) continue
    if (feedQty === p.stock_quantity) continue

    if (p.stock_quantity > 0 && feedQty === 0) {
      zeroingRows.push(p.sku)
    }

    const { error: updErr } = await db
      .from('products')
      .update({ stock_quantity: feedQty, updated_at: nowIso })
      .eq('id', p.id)

    if (updErr) {
      updateErrors.push(`${p.sku}: ${updErr.message}`)
      continue
    }

    await db.from('stock_adjustments').insert({
      product_id: p.id,
      quantity_change: feedQty - p.stock_quantity,
      reason: 'supplier_feed',
      notes,
      previous_quantity: p.stock_quantity,
      new_quantity: feedQty,
    })

    updatedCount++
  }

  const status: 'success' | 'error' = updateErrors.length > 0 && updatedCount === 0 ? 'error' : 'success'

  await writeSupplierStatus(supplierId, {
    stock_feed_last_status: status,
    stock_feed_last_row_count: rowCount,
    stock_feed_last_matched_count: matchedCount,
    stock_feed_last_error: updateErrors.length ? updateErrors.slice(0, 5).join('; ') : null,
  })

  await logRun(status, {
    supplier: supplier.name,
    rowCount,
    matchedCount,
    updatedCount,
    zeroingRows: zeroingRows.length ? zeroingRows : undefined,
    updateErrors: updateErrors.length ? updateErrors : undefined,
    manual,
  })

  console.log(
    `[supplier-feeds] ${supplier.name}: rows=${rowCount} matched=${matchedCount} updated=${updatedCount} zeroing=${zeroingRows.length}`
  )

  return {
    ...base,
    rowCount,
    matchedCount,
    updatedCount,
    status,
    zeroingRows: zeroingRows.length ? zeroingRows : undefined,
    error: updateErrors.length ? updateErrors.slice(0, 5).join('; ') : undefined,
  }
}
