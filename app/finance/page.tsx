export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/client'
import { getStaffUser } from '@/lib/auth/staff'
import { redirect } from 'next/navigation'
import SyncPayoutsButton from './SyncPayoutsButton'
import ScopeBanner from '@/app/components/ScopeBanner'

async function getPayouts(search?: string, filter?: string) {
  try {
    const db = createServiceClient()

    if (search) {
      const { data: txns } = await db
        .from('payout_transactions')
        .select('payout_id')
        .ilike('order_number', `%${search}%`)
      const payoutIds = (txns ?? []).map((t: { payout_id: string }) => t.payout_id)
      if (payoutIds.length === 0) return []
      const { data } = await db
        .from('payouts')
        .select('*')
        .in('id', payoutIds)
        .order('payout_date', { ascending: false })
      return data ?? []
    }

    let query = db.from('payouts').select('*').order('payout_date', { ascending: false })

    if (filter === 'attention') {
      query = query.in('sync_status', ['pending', 'error'])
    } else {
      query = query.limit(50)
    }

    const { data } = await query
    return data ?? []
  } catch {
    return []
  }
}

const statusStyles: Record<string, { pill: string; label: string }> = {
  synced:  { pill: 'bg-ok/10 text-ok border border-ok/25',         label: 'Synced'  },
  pending: { pill: 'bg-warn/10 text-warn border border-warn/25',   label: 'Pending' },
  error:   { pill: 'bg-fail/10 text-fail border border-fail/25',   label: 'Error'   },
  skipped: { pill: 'bg-overlay text-secondary border border-edge', label: 'Skipped' },
}

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; filter?: string }>
}) {
  const staff = await getStaffUser()
  if (!staff) {
    redirect('/login')
  }

  const { search, filter } = await searchParams
  const payouts = await getPayouts(search, filter)
  const isAttentionFilter = filter === 'attention'

  return (
    <div>
      <ScopeBanner mode="bridge" detail="Shopify payout fee reconciliation to QuickBooks. Retired at Shopify cutover — Stripe payouts will replace this." />
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-primary">Finance</h2>
          <p className="mt-1 text-sm text-secondary">Payout reconciliation and fee sync</p>
        </div>
        <SyncPayoutsButton />
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 mb-4">
        <Link
          href="/finance"
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            !isAttentionFilter
              ? 'bg-accent/15 text-accent border border-accent/30'
              : 'bg-overlay text-secondary border border-edge hover:text-primary'
          }`}
        >
          All
        </Link>
        <Link
          href="/finance?filter=attention"
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            isAttentionFilter
              ? 'bg-warn/15 text-warn border border-warn/30'
              : 'bg-overlay text-secondary border border-edge hover:text-primary'
          }`}
        >
          ⚠ Needs attention
        </Link>
      </div>

      {/* Search */}
      <form method="GET" className="mb-5 flex gap-2">
        <input
          type="text"
          name="search"
          defaultValue={search ?? ''}
          placeholder="Search by order number e.g. NCE1580"
          className="flex-1 min-w-0 px-3 py-2 bg-overlay border border-edge rounded-md text-sm text-primary placeholder:text-secondary focus:outline-none focus:border-accent transition-colors"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-overlay border border-edge text-secondary text-sm rounded-md hover:border-secondary hover:text-primary transition-colors"
        >
          Search
        </button>
        {search && (
          <a
            href="/finance"
            className="px-4 py-2 text-secondary text-sm rounded-md hover:bg-overlay transition-colors"
          >
            Clear
          </a>
        )}
      </form>

      {payouts.length === 0 ? (
        <div className="text-center py-16 text-secondary">
          {search
            ? `No payouts contain order "${search}".`
            : isAttentionFilter
            ? 'No payouts need attention — all synced.'
            : 'No payouts yet. Click "Sync Payouts" to pull from Shopify.'}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block">
            <div className="bg-surface border border-edge rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-overlay border-b border-edge">
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wide">Date</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-secondary uppercase tracking-wide">Gross</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-secondary uppercase tracking-wide">Fees</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-secondary uppercase tracking-wide">Net</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {payouts.map((payout: {
                    id: string
                    payout_date: string
                    gross_amount: number | null
                    total_fees: number | null
                    amount: number
                    currency: string
                    sync_status: string
                  }) => {
                    const s = statusStyles[payout.sync_status] ?? statusStyles.skipped
                    return (
                      <tr key={payout.id} className="hover:bg-overlay transition-colors">
                        <td className="px-4 py-3 text-primary font-mono text-xs">{payout.payout_date}</td>
                        <td className="px-4 py-3 text-right text-secondary">
                          {payout.gross_amount != null
                            ? `£${Number(payout.gross_amount).toFixed(2)}`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-fail">
                          {payout.total_fees != null
                            ? `£${Number(payout.total_fees).toFixed(2)}`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-primary">
                          £{Number(payout.amount).toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${s.pill}`}>
                            {s.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/finance/${payout.id}`}
                            className="text-accent hover:text-accent-hi text-xs transition-colors"
                          >
                            View →
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tablet/mobile cards */}
          <div className="lg:hidden space-y-2.5">
            {payouts.map((payout: { id: string; payout_date: string; gross_amount: number | null; total_fees: number | null; amount: number; currency: string; sync_status: string }) => {
              const s = statusStyles[payout.sync_status] ?? statusStyles.skipped
              return (
                <Link
                  key={payout.id}
                  href={`/finance/${payout.id}`}
                  className="block bg-surface border border-edge rounded-xl p-4 active:bg-overlay transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="font-mono text-primary text-sm">{payout.payout_date}</span>
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${s.pill}`}>
                      {s.label}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-5">
                    <div>
                      <p className="text-[10px] text-secondary uppercase tracking-wide mb-0.5">Net</p>
                      <p className="text-lg font-semibold text-primary leading-none">£{Number(payout.amount).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-secondary uppercase tracking-wide mb-0.5">Fees</p>
                      <p className="text-base font-medium text-fail leading-none">
                        {payout.total_fees != null ? `£${Number(payout.total_fees).toFixed(2)}` : '—'}
                      </p>
                    </div>
                    {payout.gross_amount != null && (
                      <div>
                        <p className="text-[10px] text-secondary uppercase tracking-wide mb-0.5">Gross</p>
                        <p className="text-sm text-secondary leading-none">£{Number(payout.gross_amount).toFixed(2)}</p>
                      </div>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
