import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * WP-4 Step 1 — Auto-hide-on-OOS rule.
 *
 * Once a day (06:30 UTC, after supplier feeds at 06:00) we archive any
 * active product that has been out of stock for at least 30 days with no
 * recent sale. Archived = `status='archived'`, which removes it from the
 * storefront's collection pages and search.
 *
 * Safety cap: if a single run would archive more than 5% of the active
 * catalogue, abort and log an error to `sync_log`. That's a strong signal
 * that something is wrong upstream (e.g. a supplier feed wiped stock to
 * zero across the board) and we don't want to silently nuke the storefront.
 *
 * Note: there is no Resend client wired into this repo yet, so the safety
 * cap only logs to sync_log — Norman will see it on the Activity tab the
 * next time he opens settings. If we add Resend later, plug an email send
 * into the abort branch.
 *
 * Not yet enabled — Norman flips the schedule on after reviewing the first
 * dry-run output.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const startedAt = Date.now()

  try {
    // Total active catalogue size — denominator for the safety cap.
    const { count: activeTotal, error: countErr } = await db
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
    if (countErr) throw countErr
    const total = activeTotal ?? 0

    // Cutoff: 30 days ago. last_sold_at IS NULL means "never sold" which
    // we treat as eligible — combined with stock=0, it's clearly stale.
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    const cutoffIso = cutoff.toISOString()

    // Candidate selection
    const { data: candidates, error: selErr } = await db
      .from('products')
      .select('id, sku, last_sold_at')
      .eq('status', 'active')
      .eq('stock_quantity', 0)
      .or(`last_sold_at.is.null,last_sold_at.lt.${cutoffIso}`)
    if (selErr) throw selErr

    const candidateCount = candidates?.length ?? 0
    const cap = total > 0 ? candidateCount / total : 0

    if (total > 0 && cap > 0.05) {
      // Abort — too many. Log to sync_log so the next settings-page load
      // surfaces it, and bail without touching anything.
      await db.from('sync_log').insert({
        action: 'archive_stale_stock_aborted',
        status: 'error',
        details: {
          reason: 'safety_cap_exceeded',
          candidate_count: candidateCount,
          active_total: total,
          fraction: cap,
          threshold: 0.05,
          cutoff: cutoffIso,
          ms: Date.now() - startedAt,
        },
      })
      console.error(
        `[archive-stale-stock] aborted: ${candidateCount}/${total} (${(cap * 100).toFixed(2)}%) exceeds 5% cap`
      )
      return NextResponse.json(
        {
          aborted: true,
          reason: 'safety_cap_exceeded',
          candidate_count: candidateCount,
          active_total: total,
          fraction: cap,
        },
        { status: 200 }
      )
    }

    if (candidateCount === 0) {
      await db.from('sync_log').insert({
        action: 'archive_stale_stock',
        status: 'success',
        details: {
          archived_count: 0,
          active_total: total,
          cutoff: cutoffIso,
          ms: Date.now() - startedAt,
        },
      })
      console.log(`[archive-stale-stock] no candidates (active=${total})`)
      return NextResponse.json({ archived: 0, active_total: total })
    }

    const ids = (candidates ?? []).map((c) => c.id)
    const nowIso = new Date().toISOString()

    const { error: updErr } = await db
      .from('products')
      .update({ status: 'archived', auto_archived_at: nowIso })
      .in('id', ids)
    if (updErr) throw updErr

    await db.from('sync_log').insert({
      action: 'archive_stale_stock',
      status: 'success',
      details: {
        archived_count: ids.length,
        active_total: total,
        cutoff: cutoffIso,
        sample_skus: (candidates ?? []).slice(0, 10).map((c) => c.sku),
        ms: Date.now() - startedAt,
      },
    })

    console.log(`[archive-stale-stock] archived ${ids.length} of ${total} active products`)
    return NextResponse.json({
      archived: ids.length,
      active_total: total,
      cutoff: cutoffIso,
    })
  } catch (e) {
    console.error('[archive-stale-stock] failed:', e)
    try {
      await db.from('sync_log').insert({
        action: 'archive_stale_stock',
        status: 'error',
        details: { error: String(e), ms: Date.now() - startedAt },
      })
    } catch {
      // ignore — log is best-effort
    }
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
