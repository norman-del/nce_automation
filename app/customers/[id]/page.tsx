export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/client'
import { notFound } from 'next/navigation'

function pence(amount: number): string {
  return `\u00A3${(amount / 100).toFixed(2)}`
}

const statusStyles: Record<string, { pill: string; label: string }> = {
  paid:       { pill: 'bg-accent/10 text-accent border border-accent/25',   label: 'Paid'       },
  processing: { pill: 'bg-warn/10 text-warn border border-warn/25',         label: 'Processing' },
  shipped:    { pill: 'bg-ok/10 text-ok border border-ok/25',               label: 'Shipped'    },
  delivered:  { pill: 'bg-ok/10 text-ok border border-ok/25',               label: 'Delivered'  },
  cancelled:  { pill: 'bg-overlay text-secondary border border-edge',       label: 'Cancelled'  },
  refunded:   { pill: 'bg-fail/10 text-fail border border-fail/25',         label: 'Refunded'   },
}

interface Customer {
  id: string
  full_name: string
  email: string
  phone: string | null
  created_at: string
}

interface OrderRow {
  id: string
  order_number: string | null
  created_at: string
  status: string
  total_pence: number
}

async function getCustomer(id: string) {
  const db = createServiceClient()

  const { data: customer } = await db
    .from('customers')
    .select('*')
    .eq('id', id)
    .single()

  if (!customer) return null

  const { data: orders } = await db
    .from('orders')
    .select('id, order_number, created_at, status, total_pence')
    .eq('customer_id', id)
    .order('created_at', { ascending: false })

  return { customer: customer as Customer, orders: (orders ?? []) as OrderRow[] }
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getCustomer(id)
  if (!result) notFound()

  const { customer, orders } = result
  const totalSpend = orders.reduce((sum, o) => sum + o.total_pence, 0)
  const joined = new Date(customer.created_at).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="mb-2">
          <Link href="/customers" className="text-secondary hover:text-primary text-sm transition-colors">
            ← Customers
          </Link>
        </div>
        <h2 className="text-2xl font-semibold text-primary">{customer.full_name}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-secondary">
          <span>{customer.email}</span>
          {customer.phone && <span>{customer.phone}</span>}
          <span>Joined {joined}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-surface border border-edge rounded-lg p-4">
          <p className="text-xs text-secondary uppercase tracking-wide mb-1">Orders</p>
          <p className="text-2xl font-semibold text-primary">{orders.length}</p>
        </div>
        <div className="bg-surface border border-edge rounded-lg p-4">
          <p className="text-xs text-secondary uppercase tracking-wide mb-1">Total spent</p>
          <p className="text-2xl font-semibold text-primary">
            {totalSpend > 0 ? pence(totalSpend) : '—'}
          </p>
        </div>
        <div className="bg-surface border border-edge rounded-lg p-4">
          <p className="text-xs text-secondary uppercase tracking-wide mb-1">Avg order</p>
          <p className="text-2xl font-semibold text-primary">
            {orders.length > 0 ? pence(Math.round(totalSpend / orders.length)) : '—'}
          </p>
        </div>
      </div>

      {/* Order history */}
      <h3 className="text-lg font-medium text-primary mb-4">Order history</h3>

      {orders.length === 0 ? (
        <div className="bg-surface border border-edge rounded-lg px-6 py-16 text-center">
          <p className="text-secondary text-sm">No orders yet.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block">
            <div className="bg-surface border border-edge rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-overlay border-b border-edge">
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wide">Order</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wide">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-secondary uppercase tracking-wide">Total</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {orders.map((o) => {
                    const s = statusStyles[o.status] ?? statusStyles.paid
                    const date = new Date(o.created_at).toLocaleDateString('en-GB', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })
                    return (
                      <tr key={o.id} className="hover:bg-overlay transition-colors">
                        <td className="px-4 py-3 font-mono text-primary text-xs font-medium">
                          {o.order_number ?? o.id.slice(0, 8)}
                        </td>
                        <td className="px-4 py-3 text-secondary text-xs">{date}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${s.pill}`}>
                            {s.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-primary">{pence(o.total_pence)}</td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/orders/${o.id}`}
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

          {/* Mobile cards */}
          <div className="lg:hidden space-y-2.5">
            {orders.map((o) => {
              const s = statusStyles[o.status] ?? statusStyles.paid
              const date = new Date(o.created_at).toLocaleDateString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric',
              })
              return (
                <Link
                  key={o.id}
                  href={`/orders/${o.id}`}
                  className="block bg-surface border border-edge rounded-xl p-4 active:bg-overlay transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-mono text-primary text-sm font-medium">
                      {o.order_number ?? o.id.slice(0, 8)}
                    </span>
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${s.pill}`}>
                      {s.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-secondary">{date}</span>
                    <span className="text-sm font-semibold text-primary">{pence(o.total_pence)}</span>
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
