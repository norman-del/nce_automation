export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/client'
import SyncPayoutsButton from './SyncPayoutsButton'

async function getPayouts(search?: string) {
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

    const { data } = await db
      .from('payouts')
      .select('*')
      .order('payout_date', { ascending: false })
      .limit(50)
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
  searchParams: Promise<{ search?: string }>
}) {
  const { search } = await searchParams
  const payouts = await getPayouts(search)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-primary">Payouts</h2>
          <p className="mt-1 text-sm text-secondary">Shopify payouts pulled from the API</p>
        </div>
        <SyncPayoutsButton />
      </div>

      {/* Search */}
      <form method="GET" className="mb-5 flex gap-2">
        <input
          type="text"
          name="search"
          defaultValue={search ?? ''}
          placeholder="Search by order number e.g. NCE1580"
          className="flex-1 max-w-xs px-3 py-2 bg-overlay border border-edge rounded-md text-sm text-primary placeholder:text-secondary focus:outline-none focus:border-accent transition-colors"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-overlay border border-edge text-secondary text-sm rounded-md hover:border-secondary hover:text-primary transition-colors"
        >
          Search
        </button>
        {search && (
          <a
            href="/payouts"
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
            : 'No payouts yet. Click "Sync Payouts" to pull from Shopify.'}
        </div>
      ) : (
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
                        href={`/payouts/${payout.id}`}
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
      )}
    </div>
  )
}
