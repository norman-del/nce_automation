export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/client'
import { notFound } from 'next/navigation'
import SyncButton from './SyncButton'

async function getPayout(id: string) {
  const db = createServiceClient()
  const { data } = await db
    .from('payouts')
    .select('*, payout_transactions(*)')
    .eq('id', id)
    .single()
  return data
}

const paymentStatusStyles: Record<string, { pill: string; label: string }> = {
  payment_created: { pill: 'bg-ok/10 text-ok border border-ok/25',           label: 'Paid'          },
  invoice_found:   { pill: 'bg-accent/10 text-accent border border-accent/25', label: 'Invoice found' },
  pending:         { pill: 'bg-warn/10 text-warn border border-warn/25',     label: 'Pending'       },
  no_invoice:      { pill: 'bg-overlay text-secondary border border-edge',   label: 'No invoice'    },
  error:           { pill: 'bg-fail/10 text-fail border border-fail/25',     label: 'Error'         },
}

export default async function PayoutDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const payout = await getPayout(id)
  if (!payout) notFound()

  const transactions = (payout.payout_transactions ?? []) as Array<{
    id: string
    order_number: string | null
    customer_name: string | null
    company_name: string | null
    amount: number
    fee: number
    net: number
    payment_status: string
    qbo_invoice_id: string | null
    qbo_payment_id: string | null
  }>

  const paidCount = transactions.filter((t) => t.payment_status === 'payment_created').length

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
        <div>
          <div className="mb-2">
            <Link href="/payouts" className="text-secondary hover:text-primary text-sm transition-colors">
              ← Payouts
            </Link>
          </div>
          <h2 className="text-2xl font-semibold text-primary">
            Payout — {payout.payout_date}
          </h2>
          <div className="mt-2 flex items-center gap-4 text-sm">
            <span className="text-secondary">
              Net: <span className="text-primary font-medium">£{Number(payout.amount).toFixed(2)}</span>
            </span>
            <span className="text-secondary">
              Fees: <span className="text-fail font-medium">£{Number(payout.total_fees ?? 0).toFixed(2)}</span>
            </span>
            <span className="text-secondary">
              Gross: <span className="text-primary font-medium">£{Number(payout.gross_amount ?? payout.amount).toFixed(2)}</span>
            </span>
          </div>
        </div>
        <SyncButton payoutId={id} alreadyPosted={payout.sync_status === 'synced'} />
      </div>

      {/* Journal status pill */}
      <div className="mb-5 flex items-center gap-2.5">
        <span className="text-xs text-secondary uppercase tracking-wide">Journal entry</span>
        {payout.journal_entry_id ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-ok/10 text-ok border border-ok/25">
            ✓ #{payout.journal_entry_id}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-overlay text-secondary border border-edge">
            Not created — run Full Sync
          </span>
        )}
      </div>

      {/* Transactions */}
      {transactions.length === 0 ? (
        <div className="bg-surface border border-edge rounded-lg px-6 py-16 text-center">
          <p className="text-secondary text-sm">No transactions yet.</p>
          <p className="text-secondary text-xs mt-1">Click "Post to QuickBooks" to fetch orders and post this payout.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block">
            <div className="bg-surface border border-edge rounded-lg overflow-hidden">
              <div className="px-5 py-3 border-b border-edge flex items-center justify-between">
                <p className="text-xs text-secondary">{transactions.length} orders in this payout</p>
                <p className="text-xs text-secondary">{paidCount} of {transactions.length} paid in QBO</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-overlay border-b border-edge">
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wide">Order</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wide">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wide">Company</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-secondary uppercase tracking-wide">Gross</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-secondary uppercase tracking-wide">Fee</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-secondary uppercase tracking-wide">Net</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wide">QBO Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {transactions.map((txn) => {
                    const s = paymentStatusStyles[txn.payment_status] ?? paymentStatusStyles.no_invoice
                    return (
                      <tr key={txn.id} className="hover:bg-overlay transition-colors">
                        <td className="px-4 py-3 font-mono text-primary text-xs">
                          {txn.order_number ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-secondary">{txn.customer_name ?? '—'}</td>
                        <td className="px-4 py-3 text-secondary">{txn.company_name ?? '—'}</td>
                        <td className="px-4 py-3 text-right text-secondary">
                          £{Number(txn.amount).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-fail">
                          £{Number(txn.fee).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-primary">
                          £{Number(txn.net).toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${s.pill}`}>
                            {s.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile transaction cards */}
          <div className="sm:hidden space-y-2.5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-secondary">{transactions.length} orders in this payout</p>
              <p className="text-xs text-secondary">{paidCount} of {transactions.length} paid in QBO</p>
            </div>
            {transactions.map((txn) => {
              const s = paymentStatusStyles[txn.payment_status] ?? paymentStatusStyles.no_invoice
              return (
                <div key={txn.id} className="bg-surface border border-edge rounded-xl p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-mono text-primary text-sm font-medium">{txn.order_number ?? '—'}</span>
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${s.pill}`}>{s.label}</span>
                  </div>
                  <p className="text-sm text-secondary mb-3 truncate">{txn.customer_name ?? txn.company_name ?? '—'}</p>
                  <div className="flex gap-5 text-xs">
                    <div>
                      <p className="text-[10px] text-secondary uppercase tracking-wide mb-0.5">Net</p>
                      <p className="text-primary font-semibold">£{Number(txn.net).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-secondary uppercase tracking-wide mb-0.5">Fee</p>
                      <p className="text-fail">£{Number(txn.fee).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-secondary uppercase tracking-wide mb-0.5">Gross</p>
                      <p className="text-secondary">£{Number(txn.amount).toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Spacer so sticky sync button doesn't overlap transactions on mobile */}
      <div className="sm:hidden h-44" />
    </div>
  )
}
