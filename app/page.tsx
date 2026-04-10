export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/client'
import DashboardChart from '@/app/components/DashboardChart'

interface Payout {
  id: string
  payout_date: string
  gross_amount: number | null
  total_fees: number | null
  amount: number
  sync_status: string
}

async function getDashboardData() {
  try {
    const db = createServiceClient()
    const now = new Date()
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0]
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]

    const [monthRes, attentionRes, chartRes, recentRes] = await Promise.all([
      db.from('payouts').select('id, total_fees, sync_status').gte('payout_date', firstOfMonth),
      db.from('payouts').select('id', { count: 'exact' }).in('sync_status', ['pending', 'error']),
      db.from('payouts').select('payout_date, total_fees').gte('payout_date', thirtyDaysAgo).order('payout_date', { ascending: true }),
      db.from('payouts').select('id, payout_date, gross_amount, total_fees, amount, sync_status').order('payout_date', { ascending: false }).limit(5),
    ])

    const monthPayouts = (monthRes.data ?? []) as Array<{ id: string; total_fees: number | null; sync_status: string }>
    const monthPayoutIds = monthPayouts.map((p) => p.id)

    let paymentsApplied = 0
    if (monthPayoutIds.length > 0) {
      const { data: txns } = await db
        .from('payout_transactions')
        .select('amount')
        .eq('payment_status', 'payment_created')
        .in('payout_id', monthPayoutIds)
      paymentsApplied = (txns ?? []).reduce((s: number, t: { amount: number }) => s + Number(t.amount), 0)
    }

    const feesThisMonth = monthPayouts.reduce((s, p) => s + Number(p.total_fees ?? 0), 0)

    const chartData = (chartRes.data ?? []).map((p: { payout_date: string; total_fees: number | null }) => ({
      date: p.payout_date.slice(5),
      fees: Number(p.total_fees ?? 0),
    }))

    return {
      payoutsThisMonth: monthPayouts.length,
      feesThisMonth,
      paymentsApplied,
      needsAttention: attentionRes.count ?? 0,
      chartData,
      recentPayouts: (recentRes.data ?? []) as Payout[],
    }
  } catch {
    return { payoutsThisMonth: 0, feesThisMonth: 0, paymentsApplied: 0, needsAttention: 0, chartData: [], recentPayouts: [] }
  }
}

const statusStyles: Record<string, { pill: string; label: string }> = {
  synced:  { pill: 'bg-ok/10 text-ok border border-ok/25',         label: 'Synced'  },
  pending: { pill: 'bg-warn/10 text-warn border border-warn/25',   label: 'Pending' },
  error:   { pill: 'bg-fail/10 text-fail border border-fail/25',   label: 'Error'   },
  skipped: { pill: 'bg-overlay text-secondary border border-edge', label: 'Skipped' },
}

export default async function DashboardPage() {
  const { payoutsThisMonth, feesThisMonth, paymentsApplied, needsAttention, chartData, recentPayouts } =
    await getDashboardData()

  const stats = [
    { label: 'Payouts this month', value: payoutsThisMonth.toString(),      color: 'text-accent', glow: 'drop-shadow-[0_0_8px_rgba(56,139,253,0.45)]',  href: '/finance',                 hint: 'View all payouts this month'    },
    { label: 'Fees recorded',      value: `£${feesThisMonth.toFixed(2)}`,   color: 'text-fail',   glow: 'drop-shadow-[0_0_8px_rgba(248,81,73,0.35)]',   href: '/finance',                 hint: 'Shopify processing fees'        },
    { label: 'Payments applied',   value: `£${paymentsApplied.toFixed(2)}`, color: 'text-ok',     glow: 'drop-shadow-[0_0_8px_rgba(63,185,80,0.35)]',   href: '/finance',                 hint: 'Gross amounts posted to QBO'    },
    {
      label: 'Needs attention',
      value: needsAttention.toString(),
      color: needsAttention > 0 ? 'text-warn' : 'text-secondary',
      glow:  needsAttention > 0 ? 'drop-shadow-[0_0_8px_rgba(210,153,34,0.45)]' : '',
      href:  '/finance?filter=attention',
      hint:  needsAttention > 0 ? 'Pending + error payouts — click to view' : 'All payouts synced',
    },
  ]

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-primary">Dashboard</h2>
        <p className="mt-1 text-sm text-secondary">Operations overview — this month</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-8">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="bg-surface rounded-lg border border-edge p-4 hover:border-secondary transition-colors group block"
          >
            <p className="text-[11px] text-secondary uppercase tracking-wide mb-2 leading-tight">{s.label}</p>
            <p className={`text-2xl font-semibold font-mono truncate ${s.color} ${s.glow}`}>{s.value}</p>
            <p className="text-xs text-secondary mt-2 opacity-0 group-hover:opacity-100 transition-opacity leading-tight">{s.hint}</p>
          </Link>
        ))}
      </div>

      {/* Bar chart */}
      <div className="bg-surface border border-edge rounded-lg p-5 mb-6">
        <p className="text-sm font-medium text-primary mb-0.5">Fees per payout — last 30 days</p>
        <p className="text-xs text-secondary mb-4">Spot unusually high fee days at a glance</p>
        <DashboardChart data={chartData} />
      </div>

      {/* Recent payouts */}
      <div className="bg-surface border border-edge rounded-lg">
        <div className="px-5 py-4 border-b border-edge flex items-center justify-between">
          <p className="text-sm font-medium text-primary">Recent payouts</p>
          <Link href="/finance" className="text-xs text-accent hover:text-accent-hi transition-colors">
            View all →
          </Link>
        </div>
        {recentPayouts.length === 0 ? (
          <div className="px-5 py-10 text-center text-secondary text-sm">
            No payouts yet.{' '}
            <Link href="/finance" className="text-accent hover:underline">
              Sync Payouts
            </Link>{' '}
            to get started.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-overlay border-b border-edge">
                    <th className="px-5 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wide">Date</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-secondary uppercase tracking-wide">Gross</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-secondary uppercase tracking-wide">Fees</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-secondary uppercase tracking-wide">Net</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wide">Status</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {recentPayouts.map((p) => {
                    const s = statusStyles[p.sync_status] ?? statusStyles.skipped
                    return (
                      <tr key={p.id} className="hover:bg-overlay transition-colors">
                        <td className="px-5 py-3 text-primary font-mono text-xs">{p.payout_date}</td>
                        <td className="px-5 py-3 text-right text-secondary">
                          {p.gross_amount != null ? `£${Number(p.gross_amount).toFixed(2)}` : '—'}
                        </td>
                        <td className="px-5 py-3 text-right text-fail">
                          {p.total_fees != null ? `£${Number(p.total_fees).toFixed(2)}` : '—'}
                        </td>
                        <td className="px-5 py-3 text-right font-medium text-primary">
                          £{Number(p.amount).toFixed(2)}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${s.pill}`}>
                            {s.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Link href={`/finance/${p.id}`} className="text-accent hover:text-accent-hi text-xs transition-colors">
                            View →
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* Tablet/mobile cards */}
            <div className="lg:hidden divide-y divide-edge">
              {recentPayouts.map((p) => {
                const s = statusStyles[p.sync_status] ?? statusStyles.skipped
                return (
                  <Link
                    key={p.id}
                    href={`/finance/${p.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-overlay active:bg-overlay transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-primary text-sm">{p.payout_date}</p>
                      <div className="flex gap-4 mt-1 text-xs">
                        <span className="text-primary font-medium">£{Number(p.amount).toFixed(2)}</span>
                        <span className="text-fail">{p.total_fees != null ? `−£${Number(p.total_fees).toFixed(2)}` : ''}</span>
                      </div>
                    </div>
                    <span className={`shrink-0 inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${s.pill}`}>
                      {s.label}
                    </span>
                    <span className="text-secondary text-sm">›</span>
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
