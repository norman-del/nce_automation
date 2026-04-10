export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/client'

function pence(amount: number): string {
  return `\u00A3${(amount / 100).toFixed(2)}`
}

interface CustomerRow {
  id: string
  full_name: string
  email: string
  phone: string | null
  created_at: string
  order_count: number
  total_spend: number
}

async function getCustomers(search?: string): Promise<CustomerRow[]> {
  const db = createServiceClient()

  // Get all customers with aggregated order data
  let query = db
    .from('customers')
    .select('id, full_name, email, phone, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
  }

  const { data: customers } = await query
  if (!customers || customers.length === 0) return []

  // Aggregate orders per customer
  const ids = customers.map((c) => c.id)
  const { data: orderAgg } = await db
    .from('orders')
    .select('customer_id, total_pence')
    .in('customer_id', ids)

  const agg: Record<string, { count: number; spend: number }> = {}
  for (const row of orderAgg ?? []) {
    if (!row.customer_id) continue
    if (!agg[row.customer_id]) agg[row.customer_id] = { count: 0, spend: 0 }
    agg[row.customer_id].count++
    agg[row.customer_id].spend += row.total_pence
  }

  return customers.map((c) => ({
    ...c,
    order_count: agg[c.id]?.count ?? 0,
    total_spend: agg[c.id]?.spend ?? 0,
  }))
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>
}) {
  const { search } = await searchParams
  const customers = await getCustomers(search)

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-primary">Customers</h2>
          <p className="mt-1 text-sm text-secondary">Registered customer accounts</p>
        </div>
      </div>

      {/* Search */}
      <form method="GET" className="mb-5 flex gap-2">
        <input
          type="text"
          name="search"
          defaultValue={search ?? ''}
          placeholder="Search by name or email"
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
            href="/customers"
            className="px-4 py-2 text-secondary text-sm rounded-md hover:bg-overlay transition-colors"
          >
            Clear
          </a>
        )}
      </form>

      {customers.length === 0 ? (
        <div className="text-center py-16 text-secondary">
          {search ? `No customers matching "${search}".` : 'No customers yet.'}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block">
            <div className="bg-surface border border-edge rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-overlay border-b border-edge">
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wide">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wide">Email</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-secondary uppercase tracking-wide">Orders</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-secondary uppercase tracking-wide">Total spent</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wide">Joined</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {customers.map((c) => {
                    const joined = new Date(c.created_at).toLocaleDateString('en-GB', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })
                    return (
                      <tr key={c.id} className="hover:bg-overlay transition-colors">
                        <td className="px-4 py-3 text-primary font-medium">{c.full_name}</td>
                        <td className="px-4 py-3 text-secondary">{c.email}</td>
                        <td className="px-4 py-3 text-right text-secondary">{c.order_count}</td>
                        <td className="px-4 py-3 text-right font-medium text-primary">
                          {c.total_spend > 0 ? pence(c.total_spend) : '—'}
                        </td>
                        <td className="px-4 py-3 text-secondary text-xs">{joined}</td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/customers/${c.id}`}
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
            {customers.map((c) => {
              const joined = new Date(c.created_at).toLocaleDateString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric',
              })
              return (
                <Link
                  key={c.id}
                  href={`/customers/${c.id}`}
                  className="block bg-surface border border-edge rounded-xl p-4 active:bg-overlay transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-primary font-medium text-sm">{c.full_name}</span>
                    {c.total_spend > 0 && (
                      <span className="text-sm font-semibold text-primary">{pence(c.total_spend)}</span>
                    )}
                  </div>
                  <p className="text-sm text-secondary truncate mb-2">{c.email}</p>
                  <div className="flex items-center gap-4 text-xs text-secondary">
                    <span>{c.order_count} order{c.order_count !== 1 ? 's' : ''}</span>
                    <span>Joined {joined}</span>
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
