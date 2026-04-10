export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/client'

const ORDER_STATUSES = ['paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'] as const

const statusStyles: Record<string, { pill: string; label: string }> = {
  paid:       { pill: 'bg-accent/10 text-accent border border-accent/25',   label: 'Paid'       },
  processing: { pill: 'bg-warn/10 text-warn border border-warn/25',         label: 'Processing' },
  shipped:    { pill: 'bg-ok/10 text-ok border border-ok/25',               label: 'Shipped'    },
  delivered:  { pill: 'bg-ok/10 text-ok border border-ok/25',               label: 'Delivered'  },
  cancelled:  { pill: 'bg-overlay text-secondary border border-edge',       label: 'Cancelled'  },
  refunded:   { pill: 'bg-fail/10 text-fail border border-fail/25',         label: 'Refunded'   },
}

function pence(amount: number): string {
  return `\u00A3${(amount / 100).toFixed(2)}`
}

async function getOrders(search?: string, status?: string) {
  const db = createServiceClient()

  let query = db
    .from('orders')
    .select('*, customers(full_name, email)')
    .order('created_at', { ascending: false })

  if (status && ORDER_STATUSES.includes(status as typeof ORDER_STATUSES[number])) {
    query = query.eq('status', status)
  }

  if (search) {
    // Search by order_number or guest_email or customer email
    query = query.or(
      `order_number.ilike.%${search}%,guest_email.ilike.%${search}%`
    )
  }

  query = query.limit(100)

  const { data } = await query
  return data ?? []
}

interface OrderRow {
  id: string
  order_number: string | null
  created_at: string
  status: string
  total_pence: number
  guest_email: string | null
  customer_id: string | null
  customers: { full_name: string; email: string } | null
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string }>
}) {
  const { search, status } = await searchParams
  const orders = await getOrders(search, status) as OrderRow[]

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-primary">Orders</h2>
          <p className="mt-1 text-sm text-secondary">Manage customer orders</p>
        </div>
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Link
          href="/orders"
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            !status
              ? 'bg-accent/15 text-accent border border-accent/30'
              : 'bg-overlay text-secondary border border-edge hover:text-primary'
          }`}
        >
          All
        </Link>
        {ORDER_STATUSES.map((s) => {
          const st = statusStyles[s]
          const active = status === s
          return (
            <Link
              key={s}
              href={`/orders?status=${s}`}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                active
                  ? st.pill
                  : 'bg-overlay text-secondary border border-edge hover:text-primary'
              }`}
            >
              {st.label}
            </Link>
          )
        })}
      </div>

      {/* Search */}
      <form method="GET" className="mb-5 flex gap-2">
        {status && <input type="hidden" name="status" value={status} />}
        <input
          type="text"
          name="search"
          defaultValue={search ?? ''}
          placeholder="Search by order number or email"
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
            href={status ? `/orders?status=${status}` : '/orders'}
            className="px-4 py-2 text-secondary text-sm rounded-md hover:bg-overlay transition-colors"
          >
            Clear
          </a>
        )}
      </form>

      {orders.length === 0 ? (
        <div className="text-center py-16 text-secondary">
          {search
            ? `No orders matching "${search}".`
            : status
            ? `No ${status} orders.`
            : 'No orders yet.'}
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
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wide">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-secondary uppercase tracking-wide">Total</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {orders.map((order) => {
                    const s = statusStyles[order.status] ?? statusStyles.paid
                    const customerName = order.customers?.full_name ?? order.guest_email ?? '—'
                    const date = new Date(order.created_at).toLocaleDateString('en-GB', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })
                    return (
                      <tr key={order.id} className="hover:bg-overlay transition-colors">
                        <td className="px-4 py-3 font-mono text-primary text-xs font-medium">
                          {order.order_number ?? order.id.slice(0, 8)}
                        </td>
                        <td className="px-4 py-3 text-secondary text-xs">{date}</td>
                        <td className="px-4 py-3 text-secondary truncate max-w-48">{customerName}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${s.pill}`}>
                            {s.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-primary">
                          {pence(order.total_pence)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/orders/${order.id}`}
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
            {orders.map((order) => {
              const s = statusStyles[order.status] ?? statusStyles.paid
              const customerName = order.customers?.full_name ?? order.guest_email ?? '—'
              const date = new Date(order.created_at).toLocaleDateString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric',
              })
              return (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="block bg-surface border border-edge rounded-xl p-4 active:bg-overlay transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-mono text-primary text-sm font-medium">
                      {order.order_number ?? order.id.slice(0, 8)}
                    </span>
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${s.pill}`}>
                      {s.label}
                    </span>
                  </div>
                  <p className="text-sm text-secondary truncate mb-2">{customerName}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-secondary">{date}</span>
                    <span className="text-sm font-semibold text-primary">{pence(order.total_pence)}</span>
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
